const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../Middleware/authMiddleware');
const Message = require('../models/message.model');
const Conversation = require('../models/conversation.model');
const User = require('../models/user.model');

// Get user's conversations
// router.get('/conversations', authMiddleware, async (req, res) => {
//     try {
//         const { page = 1, limit = 20 } = req.query;
//         const userId = req.user._id;

//         const conversations = await Conversation.getUserConversations(userId, page, limit);

//         // Get display names for direct conversations
//         const conversationsWithNames = await Promise.all(
//             conversations.map(async (conv) => {
//                 const convObj = conv.toObject();
                
//                 if (conv.type === 'direct') {
//                     // Find the other participant
//                     const otherParticipant = conv.participants.find(p => 
//                         p._id.toString() !== userId.toString()
//                     );
                    
//                     if (otherParticipant) {
//                         convObj.displayName = otherParticipant.fullname;
//                         convObj.displayAvatar = otherParticipant.profile?.avatar;
//                         convObj.isOnline = otherParticipant.status === 'active';
//                         convObj.lastSeen = otherParticipant.lastActive;
//                     }
//                 }

//                 // Get unread count
//                 const unreadCount = await Message.countDocuments({
//                     conversationId: conv._id,
//                     senderId: { $ne: userId },
//                     status: { $ne: 'read' },
//                     isDeleted: false
//                 });

//                 convObj.unreadCount = unreadCount;
//                 return convObj;
//             })
//         );

//         res.json({
//             success: true,
//             conversations: conversationsWithNames,
//             pagination: {
//                 page: parseInt(page),
//                 limit: parseInt(limit),
//                 total: conversations.length
//             }
//         });

//     } catch (error) {
//         console.error('Get conversations error:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to fetch conversations',
//             error: error.message
//         });
//     }
// });
router.post('/conversations/direct', authMiddleware, async (req, res) => {
    try {
        const { recipientId } = req.body;
        const userId = req.user._id;

        if (!recipientId) {
            return res.status(400).json({
                success: false,
                message: 'Recipient ID is required'
            });
        }

        if (recipientId === userId.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot create conversation with yourself'
            });
        }

        // Check if recipient exists
        const recipient = await User.findById(recipientId);
        if (!recipient) {
            return res.status(404).json({
                success: false,
                message: 'Recipient not found'
            });
        }

        // Find existing direct conversation between these two users
        let conversation = await Conversation.findOne({
            type: 'direct',
            participants: { 
                $all: [userId, recipientId],
                $size: 2
            }
        }).populate('participants', 'fullname profile.avatar status lastActive');

        // If no existing conversation, create new one
        if (!conversation) {
            conversation = new Conversation({
                type: 'direct',
                participants: [userId, recipientId],
                createdBy: userId,
                lastActivity: new Date()
            });
            
            await conversation.save();
            await conversation.populate('participants', 'fullname profile.avatar status lastActive');
        }

        // Add display info for direct conversation
        const otherParticipant = conversation.participants.find(p => 
            p._id.toString() !== userId.toString()
        );

      

        await conversation.populate('lastMessage', 'content type fileName createdAt');

        const conversationData = {
            ...conversation.toObject(),
            displayName: otherParticipant.fullname,
            displayAvatar: otherParticipant.profile?.avatar,
            isOnline: otherParticipant.status === 'active',
            lastSeen: otherParticipant.lastActive,
            unreadCount: 0
        };

        // Add formatted last message
        if (conversationData.lastMessage) {
            if (conversationData.lastMessage.type === 'file') {
                conversationData.lastMessageText = `📎 ${conversationData.lastMessage.fileName || 'File'}`;
            } else {
                conversationData.lastMessageText = conversationData.lastMessage.content;
            }
        } else {
            conversationData.lastMessageText = 'Start a conversation...';
        }

        res.json({
            success: true,
            conversation: conversationData
        });

    } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create conversation',
            error: error.message
        });
    }
});



// Get messages for a conversation
router.get('/conversations/:conversationId/messages', authMiddleware, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const userId = req.user._id;

        // Verify user is participant in conversation
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.isParticipant(userId)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this conversation'
            });
        }

        const messages = await Message.getConversationMessages(conversationId, page, limit);

        // Mark messages as read
        await Message.markConversationAsRead(conversationId, userId);

        res.json({
            success: true,
            messages: messages.reverse(), // Reverse to show oldest first
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: messages.length
            }
        });

    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch messages',
            error: error.message
        });
    }
});

// Create or get direct conversation
router.post('/conversations/direct', authMiddleware, async (req, res) => {
    try {
        const { recipientId } = req.body;
        const userId = req.user._id;

        if (!recipientId) {
            return res.status(400).json({
                success: false,
                message: 'Recipient ID is required'
            });
        }

        if (recipientId === userId.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot create conversation with yourself'
            });
        }

        // Check if recipient exists
        const recipient = await User.findById(recipientId);
        if (!recipient) {
            return res.status(404).json({
                success: false,
                message: 'Recipient not found'
            });
        }

        // Create or find existing conversation
        const conversation = await Conversation.findOrCreateDirectConversation(userId, recipientId);

        // Populate participants
        await conversation.populate('participants', 'fullname profile.avatar status lastActive');

        // Add display info for direct conversation
        const otherParticipant = conversation.participants.find(p => 
            p._id.toString() !== userId.toString()
        );

        const conversationData = {
            ...conversation.toObject(),
            displayName: otherParticipant.fullname,
            displayAvatar: otherParticipant.profile?.avatar,
            isOnline: otherParticipant.status === 'active',
            lastSeen: otherParticipant.lastActive,
            unreadCount: 0
        };

        res.json({
            success: true,
            conversation: conversationData
        });

    } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create conversation',
            error: error.message
        });
    }
});

// Send message (for REST API - real-time handled by socket)
router.post('/conversations/:conversationId/messages', authMiddleware, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { content, type = 'text', fileName, fileSize, fileUrl } = req.body;
        const userId = req.user._id;

        if (!content && !fileUrl) {
            return res.status(400).json({
                success: false,
                message: 'Message content or file is required'
            });
        }

        // Verify user is participant in conversation
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.isParticipant(userId)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this conversation'
            });
        }

        // Create message
        const message = new Message({
            senderId: userId,
            conversationId: conversationId,
            content: content,
            type: type,
            fileName: fileName,
            fileSize: fileSize,
            fileUrl: fileUrl
        });

        await message.save();
        await message.populate('senderId', 'fullname profile.avatar');

        // Update conversation
       await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: message.content,        // ✅ Store actual content
    lastMessageId: message._id,          // Store ID separately if needed
    lastMessageType: message.type,       // Store type for file messages
    lastActivity: new Date()
});

        res.json({
            success: true,
            message: message
        });

    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message',
            error: error.message
        });
    }
});

// Mark messages as read
router.patch('/conversations/:conversationId/read', authMiddleware, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { messageIds } = req.body;
        const userId = req.user._id;

        // Verify user is participant in conversation
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.isParticipant(userId)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this conversation'
            });
        }

        let result;
        if (messageIds && messageIds.length > 0) {
            // Mark specific messages as read
            result = await Message.updateMany(
                {
                    _id: { $in: messageIds },
                    conversationId: conversationId,
                    senderId: { $ne: userId }
                },
                { status: 'read' }
            );
        } else {
            // Mark all unread messages as read
            result = await Message.markConversationAsRead(conversationId, userId);
        }

        res.json({
            success: true,
            modifiedCount: result.modifiedCount
        });

    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark messages as read',
            error: error.message
        });
    }
});

// Delete message
router.delete('/messages/:messageId', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        // Check if user is the sender
        if (message.senderId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own messages'
            });
        }

        // Soft delete
        message.isDeleted = true;
        message.deletedAt = new Date();
        await message.save();

        res.json({
            success: true,
            message: 'Message deleted successfully'
        });

    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete message',
            error: error.message
        });
    }
});

// Edit message
router.patch('/messages/:messageId', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;
        const userId = req.user._id;

        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Message content is required'
            });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        // Check if user is the sender
        if (message.senderId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only edit your own messages'
            });
        }

        // Update message
        message.content = content.trim();
        message.isEdited = true;
        message.editedAt = new Date();
        await message.save();

        await message.populate('senderId', 'fullname profile.avatar');

        res.json({
            success: true,
            message: message
        });

    } catch (error) {
        console.error('Edit message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to edit message',
            error: error.message
        });
    }
});

// Search messages
router.get('/search', authMiddleware, async (req, res) => {
    try {
        const { query, conversationId, page = 1, limit = 20 } = req.query;
        const userId = req.user._id;

        if (!query) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }

        // Build search criteria
        const searchCriteria = {
            content: { $regex: query, $options: 'i' },
            isDeleted: false
        };

        // If specific conversation, add to criteria
        if (conversationId) {
            // Verify user has access to conversation
            const conversation = await Conversation.findById(conversationId);
            if (!conversation || !conversation.isParticipant(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this conversation'
                });
            }
            searchCriteria.conversationId = conversationId;
        } else {
            // Search only in user's conversations
            const userConversations = await Conversation.find({
                participants: userId
            }).select('_id');
            
            searchCriteria.conversationId = {
                $in: userConversations.map(c => c._id)
            };
        }

        const messages = await Message.find(searchCriteria)
            .populate('senderId', 'fullname profile.avatar')
            .populate('conversationId', 'participants type name')
            .sort({ timestamp: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        res.json({
            success: true,
            messages: messages,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                query: query
            }
        });

    } catch (error) {
        console.error('Search messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search messages',
            error: error.message
        });
    }
});

// Get unread message count
router.get('/unread-count', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id;
        
        const unreadCounts = await Message.getUnreadCount(userId);
        
        const totalUnread = unreadCounts.reduce((total, conv) => total + conv.unreadCount, 0);

        res.json({
            success: true,
            totalUnread: totalUnread,
            conversationCounts: unreadCounts
        });

    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get unread count',
            error: error.message
        });
    }
});

module.exports = router;