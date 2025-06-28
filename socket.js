const socketIo = require('socket.io');
const { socketAuthMiddleware } = require('./Middleware/authMiddleware');
const followController = require('./controllers/follow.controller');
const User = require('./models/user.model');
const Message = require('./models/message.model'); // Add this model
const Conversation = require('./models/conversation.model'); // Add this model

let io;
const connectedUsers = new Map(); // userId -> socketId

const initializeSocket = (server) => {
    io = socketIo(server, {
        cors: {
            origin: process.env.FRONTEND_URL || "http://localhost:3000",
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    // Set up authentication middleware
    io.use(socketAuthMiddleware);

    // Pass connectedUsers to follow controller
    followController.setConnectedUsers(connectedUsers);

    io.on('connection', async(socket) => {
        console.log(`User connected: ${socket.user.fullname} (${socket.userId})`);
        
        // Store user connection
        connectedUsers.set(socket.userId, socket.id);
        
        // Join user to their personal notification room
        socket.join(`user_${socket.userId}`);
        
        // Update user's socket ID in database
        try {
            await User.findByIdAndUpdate(socket.userId, { 
                socketID: socket.id,
                status: 'active',
                lastActive: new Date()
            });
        } catch (error) {
            console.error('Failed to update user socket info:', error);
        }

        // Handle joining notification room
        socket.on('joinNotificationRoom', () => {
            socket.join(`notifications_${socket.userId}`);
            console.log(`User ${socket.userId} joined notification room`);
        });

        // NEW: Handle joining conversation rooms
        socket.on('joinConversation', async (data) => {
            try {
                const { conversationId } = data;
                socket.join(`conversation_${conversationId}`);
                console.log(`User ${socket.userId} joined conversation ${conversationId}`);
                
                // Mark messages as delivered
                await Message.updateMany(
                    { 
                        conversationId: conversationId,
                        senderId: { $ne: socket.userId },
                        status: 'sent'
                    },
                    { status: 'delivered' }
                );
                
                // Notify other users in conversation about delivery status
                socket.to(`conversation_${conversationId}`).emit('messagesDelivered', {
                    conversationId,
                    userId: socket.userId
                });
                
            } catch (error) {
                console.error('Join conversation error:', error);
            }
        });

        // NEW: Handle leaving conversation rooms
        socket.on('leaveConversation', (data) => {
            const { conversationId } = data;
            socket.leave(`conversation_${conversationId}`);
            console.log(`User ${socket.userId} left conversation ${conversationId}`);
        });

        // NEW: Handle sending messages
        socket.on('sendMessage', async (data) => {
            try {
                const { recipientId, content, type = 'text', conversationId } = data;
                
                // Create or get conversation
                let conversation;
                if (conversationId) {
                    conversation = await Conversation.findById(conversationId);
                } else {
                    // Create new conversation between users
                    conversation = await Conversation.findOneAndUpdate(
                        {
                            participants: { $all: [socket.userId, recipientId] },
                            type: 'direct'
                        },
                        {
                            participants: [socket.userId, recipientId],
                            type: 'direct',
                            lastActivity: new Date()
                        },
                        { upsert: true, new: true }
                    );
                }

                // Create message
                const newMessage = new Message({
                    senderId: socket.userId,
                    conversationId: conversation._id,
                    content: content,
                    type: type,
                    status: 'sent',
                    timestamp: new Date()
                });

                await newMessage.save();

                // Populate sender info for the response
                await newMessage.populate('senderId', 'fullname profile.avatar');

                // Update conversation's last message
                await Conversation.findByIdAndUpdate(conversation._id, {
                    lastMessage: newMessage._id,
                    lastActivity: new Date()
                });

                // Prepare message data for clients
                const messageData = {
                    _id: newMessage._id,
                    senderId: newMessage.senderId._id,
                    senderName: newMessage.senderId.fullname,
                    senderAvatar: newMessage.senderId.profile?.avatar,
                    conversationId: conversation._id,
                    content: newMessage.content,
                    type: newMessage.type,
                    timestamp: newMessage.timestamp.toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    }),
                    status: 'sent'
                };

                // Send to conversation room
                socket.to(`conversation_${conversation._id}`).emit('newMessage', messageData);
                
                // Send to recipient directly if they're online (for notifications)
                const recipientSocketId = connectedUsers.get(recipientId);
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('messageNotification', {
                        conversationId: conversation._id,
                        senderName: socket.user.fullname,
                        content: content,
                        timestamp: new Date()
                    });
                    
                    // Update message status to delivered
                    newMessage.status = 'delivered';
                    await newMessage.save();
                    messageData.status = 'delivered';
                }

                // Confirm to sender
                socket.emit('messageSent', {
                    ...messageData,
                    tempId: data.tempId, // For matching with client-side temporary message
                    success: true
                });

                console.log(`Message sent from ${socket.userId} to conversation ${conversation._id}`);

            } catch (error) {
                console.error('Send message error:', error);
                socket.emit('messageError', {
                    tempId: data.tempId,
                    success: false,
                    message: 'Failed to send message'
                });
            }
        });

        // NEW: Handle message read status
        socket.on('markMessagesRead', async (data) => {
            try {
                const { conversationId, messageIds } = data;
                
                // Update message status to read
                await Message.updateMany(
                    { 
                        _id: { $in: messageIds },
                        conversationId: conversationId,
                        senderId: { $ne: socket.userId }
                    },
                    { status: 'read' }
                );

                // Notify other users in conversation
                socket.to(`conversation_${conversationId}`).emit('messagesRead', {
                    conversationId,
                    messageIds,
                    readBy: socket.userId
                });

            } catch (error) {
                console.error('Mark messages read error:', error);
            }
        });

        // NEW: Handle typing indicators
        socket.on('typing', (data) => {
            const { conversationId } = data;
            socket.to(`conversation_${conversationId}`).emit('userTyping', {
                userId: socket.userId,
                userName: socket.user.fullname,
                conversationId
            });
        });

        socket.on('stopTyping', (data) => {
            const { conversationId } = data;
            socket.to(`conversation_${conversationId}`).emit('userStoppedTyping', {
                userId: socket.userId,
                conversationId
            });
        });

        // Existing follow request events...
        socket.on('sendFollowRequest', async (data) => {
            try {
                const { targetUserId } = data;
                
                const notification = {
                    _id: new Date().getTime().toString(),
                    type: 'follow_request',
                    message: `${socket.user.fullname} sent you a follow request`,
                    sender: {
                        _id: socket.userId,
                        fullname: socket.user.fullname,
                        avatar: socket.user.profile?.avatar
                    },
                    recipient: targetUserId,
                    isRead: false,
                    createdAt: new Date()
                };

                const targetSocketId = connectedUsers.get(targetUserId);
                if (targetSocketId) {
                    io.to(targetSocketId).emit('newNotification', {
                        notification,
                        unreadCount: await getUnreadCountForUser(targetUserId) + 1
                    });
                    
                    console.log(`Follow request notification sent to user ${targetUserId}`);
                } else {
                    console.log(`User ${targetUserId} is offline, notification will be stored in database`);
                }

                socket.emit('followRequestSent', {
                    success: true,
                    targetUserId,
                    message: 'Follow request sent successfully'
                });

            } catch (error) {
                console.error('Follow request socket error:', error);
                socket.emit('followRequestError', {
                    success: false,
                    message: 'Failed to send follow request'
                });
            }
        });

        socket.on('acceptFollowRequest', async (data) => {
            try {
                const { requesterId } = data;
                
                const notification = {
                    _id: new Date().getTime().toString(),
                    type: 'follow_accepted',
                    message: `${socket.user.fullname} accepted your follow request`,
                    sender: {
                        _id: socket.userId,
                        fullname: socket.user.fullname,
                        avatar: socket.user.profile?.avatar
                    },
                    recipient: requesterId,
                    isRead: false,
                    createdAt: new Date()
                };

                const requesterSocketId = connectedUsers.get(requesterId);
                if (requesterSocketId) {
                    io.to(requesterSocketId).emit('newNotification', {
                        notification,
                        unreadCount: await getUnreadCountForUser(requesterId) + 1,
                        type: 'follow_accepted'
                    });
                    
                    console.log(`Follow acceptance notification sent to user ${requesterId}`);
                }

                socket.emit('followRequestAccepted', {
                    success: true,
                    requesterId,
                    message: 'Follow request accepted'
                });

            } catch (error) {
                console.error('Follow accept socket error:', error);
                socket.emit('followAcceptError', {
                    success: false,
                    message: 'Failed to accept follow request'
                });
            }
        });

        // Handle user status updates
        socket.on('updateStatus', async (status) => {
            try {
                if (['active', 'inactive', 'busy'].includes(status)) {
                    await User.findByIdAndUpdate(socket.userId, { status });
                    socket.broadcast.emit('userStatusUpdate', {
                        userId: socket.userId,
                        status: status
                    });
                }
            } catch (error) {
                console.error('Status update error:', error);
                socket.emit('error', { message: 'Failed to update status' });
            }
        });

        // Handle disconnection
        socket.on('disconnect', async () => {
            console.log(`User disconnected: ${socket.user.fullname} (${socket.userId})`);
            
            // Remove from connected users
            connectedUsers.delete(socket.userId);
            
            // Update user status and clear socket ID
            try {
                await User.findByIdAndUpdate(socket.userId, { 
                    socketID: null, 
                    status: 'inactive',
                    lastActive: new Date()
                });
            } catch (error) {
                console.error('Disconnect cleanup error:', error);
            }
        });
    });

    return io;
};

// Helper function to get unread count for a user
const getUnreadCountForUser = async (userId) => {
    try {
        const Notification = require('./models/notification.model');
        const count = await Notification.countDocuments({
            recipient: userId,
            isRead: false
        });
        return count;
    } catch (error) {
        console.error('Error getting unread count:', error);
        return 0;
    }
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.IO not initialized');
    }
    return io;
};

const getConnectedUsers = () => {
    return connectedUsers;
};

// Utility function to emit to a specific user
const emitToUser = (userId, event, data) => {
    const socketId = connectedUsers.get(userId);
    if (socketId && io) {
        io.to(socketId).emit(event, data);
        return true;
    }
    return false;
};

// Utility function to emit to multiple users
const emitToUsers = (userIds, event, data) => {
    const results = [];
    userIds.forEach(userId => {
        results.push(emitToUser(userId, event, data));
    });
    return results;
};

// Function to send follow notification
const sendFollowNotification = (targetUserId, notification) => {
    return emitToUser(targetUserId, 'newNotification', {
        notification,
        unreadCount: notification.unreadCount || 1
    });
};

// NEW: Function to send message notification
const sendMessageNotification = (userId, messageData) => {
    return emitToUser(userId, 'messageNotification', messageData);
};

module.exports = {
    initializeSocket,
    getIO,
    getConnectedUsers,
    emitToUser,
    emitToUsers,
    sendFollowNotification,
    sendMessageNotification
};