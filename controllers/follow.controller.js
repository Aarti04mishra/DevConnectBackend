const Follow = require('../models/follow.model');
const User = require('../models/user.model');
const Notification = require('../models/notification.model');

// Get connected users map (will be passed from socket setup)
let connectedUsers = new Map();

const setConnectedUsers = (users) => {
    connectedUsers = users;
};

// Fixed import path to match your file structure
const getSocketIO = () => {
    return require('../socket').getIO();
};

const followUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const currentUserId = req.user._id;

        // Validate user ID
        if (!userId || userId === currentUserId.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID or cannot follow yourself'
            });
        }

        // Check if target user exists
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if already following
        const existingFollow = await Follow.findOne({
            follower: currentUserId,
            following: userId
        });

        if (existingFollow) {
            return res.status(409).json({
                success: false,
                message: 'Already following this user'
            });
        }

        // Create follow relationship
        const follow = new Follow({
            follower: currentUserId,
            following: userId
        });

        await follow.save();

        // Create notification
        const notification = new Notification({
            recipient: userId,
            sender: currentUserId,
            type: 'follow',
            message: `${req.user.fullname} started following you`,
            relatedData: {
                followerId: currentUserId,
                followerName: req.user.fullname,
                followerAvatar: req.user.profile?.avatar || null
            }
        });

        await notification.save();

        // Populate notification with sender details
        await notification.populate('sender', 'fullname profile.avatar');

        // Send real-time notification if user is online
        try {
            const io = getSocketIO();
            const targetSocketId = connectedUsers.get(userId);
            
            if (targetSocketId && io) {
                const unreadCount = await Notification.countDocuments({ 
                    recipient: userId, 
                    isRead: false 
                });

                io.to(targetSocketId).emit('newNotification', {
                    notification: notification,
                    unreadCount: unreadCount,
                    type: 'follow'
                });

                console.log(`✅ Follow notification sent to user ${userId} via socket ${targetSocketId}`);
            } else {
                console.log(`📱 User ${userId} is offline, notification stored for later delivery`);
            }
        } catch (socketError) {
            console.error('❌ Socket notification error:', socketError);
            // Don't fail the request if socket fails - notification is still saved in DB
        }

        // Get updated follower/following counts
        const followerCount = await Follow.countDocuments({ following: userId });
        const followingCount = await Follow.countDocuments({ follower: currentUserId });

        res.status(201).json({
            success: true,
            message: 'Successfully followed user',
            data: {
                followId: follow._id,
                followedUser: {
                    _id: targetUser._id,
                    fullname: targetUser.fullname,
                    profile: targetUser.profile,
                    stats: {
                        followers: followerCount,
                        following: followingCount
                    }
                },
                notification: {
                    sent: !!connectedUsers.get(userId),
                    stored: true
                }
            }
        });

    } catch (error) {
        console.error('❌ Follow error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to follow user',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

const unfollowUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const currentUserId = req.user._id;

        // Validate user ID
        if (!userId || userId === currentUserId.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID or cannot unfollow yourself'
            });
        }

        // Check if target user exists
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if following exists
        const follow = await Follow.findOne({
            follower: currentUserId,
            following: userId
        });

        if (!follow) {
            return res.status(404).json({
                success: false,
                message: 'Not following this user'
            });
        }

        // Remove follow relationship
        await Follow.deleteOne({ _id: follow._id });

        // Remove the original follow notification (optional but recommended)
        await Notification.deleteOne({
            recipient: userId,
            sender: currentUserId,
            type: 'follow'
        });

        // Send real-time unfollow notification
        try {
            const io = getSocketIO();
            const targetSocketId = connectedUsers.get(userId);
            
            if (targetSocketId && io) {
                const unreadCount = await Notification.countDocuments({ 
                    recipient: userId, 
                    isRead: false 
                });

                // Send unfollow notification
                io.to(targetSocketId).emit('userUnfollowed', {
                    unfollowedBy: {
                        _id: currentUserId,
                        fullname: req.user.fullname,
                        avatar: req.user.profile?.avatar || null
                    },
                    message: `${req.user.fullname} unfollowed you`,
                    unreadCount: unreadCount,
                    timestamp: new Date()
                });

                console.log(`✅ Unfollow notification sent to user ${userId} via socket ${targetSocketId}`);
            } else {
                console.log(`📱 User ${userId} is offline, unfollow notification not sent`);
            }
        } catch (socketError) {
            console.error('❌ Socket unfollow notification error:', socketError);
            // Don't fail the request if socket fails
        }

        // Get updated counts
        const followerCount = await Follow.countDocuments({ following: userId });
        const followingCount = await Follow.countDocuments({ follower: currentUserId });

        res.json({
            success: true,
            message: 'Successfully unfollowed user',
            data: {
                unfollowedUser: {
                    _id: targetUser._id,
                    fullname: targetUser.fullname,
                    profile: targetUser.profile
                },
                stats: {
                    followers: followerCount,
                    following: followingCount
                },
                notification: {
                    sent: !!connectedUsers.get(userId),
                    removed: true
                }
            }
        });

    } catch (error) {
        console.error('❌ Unfollow error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unfollow user',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

const getFollowers = async (req, res) => {
    try {
        const { userId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const followers = await Follow.find({ following: userId })
            .populate('follower', 'fullname university skillLevel profile.avatar')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalFollowers = await Follow.countDocuments({ following: userId });

        res.json({
            success: true,
            data: {
                followers: followers.map(f => f.follower),
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalFollowers / limit),
                    totalFollowers,
                    hasMore: page * limit < totalFollowers
                }
            }
        });

    } catch (error) {
        console.error('❌ Get followers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get followers',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

const getFollowing = async (req, res) => {
    try {
        const { userId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const following = await Follow.find({ follower: userId })
            .populate('following', 'fullname university skillLevel profile.avatar')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalFollowing = await Follow.countDocuments({ follower: userId });

        res.json({
            success: true,
            data: {
                following: following.map(f => f.following),
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalFollowing / limit),
                    totalFollowing,
                    hasMore: page * limit < totalFollowing
                }
            }
        });

    } catch (error) {
        console.error('❌ Get following error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get following',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

const checkFollowStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const currentUserId = req.user._id;

        if (userId === currentUserId.toString()) {
            return res.json({
                success: true,
                data: { isFollowing: false, isSelf: true }
            });
        }

        const follow = await Follow.findOne({
            follower: currentUserId,
            following: userId
        });

        res.json({
            success: true,
            data: { 
                isFollowing: !!follow,
                isSelf: false
            }
        });

    } catch (error) {
        console.error('❌ Check follow status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check follow status',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

module.exports = {
    followUser,
    unfollowUser,
    getFollowers,
    getFollowing,
    checkFollowStatus,
    setConnectedUsers
};