const Project = require('../models/project.model');
const Follow = require('../models/follow.model');
const User = require('../models/user.model');

// Get feed posts (projects from followed users + own projects)
const getFeedPosts = async (req, res) => {
    try {
        const userId = req.user._id;
        console.log("userId=", userId);
        console.log("userId type:", typeof userId);
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Convert userId to string for consistent comparison
        const userIdStr = userId.toString();
        console.log("userIdStr=", userIdStr);

        // Get list of users that current user follows
        const followedUsers = await Follow.find({ follower: userId })
            .select('following')
            .lean();
        
        console.log("followedUsers=", followedUsers);
        
        // Convert all followed user IDs to strings
        const followedUserIds = followedUsers.map(follow => follow.following.toString());
        console.log("followedUserIds=", followedUserIds);
        
        // Include current user's ID to show their own posts too
        const userIdsToShow = [...followedUserIds, userIdStr];
        console.log("userIdsToShow=", userIdsToShow);

        // Check if there are any users to show posts for
        if (userIdsToShow.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    posts: [],
                    pagination: {
                        currentPage: page,
                        totalPages: 0,
                        totalPosts: 0,
                        hasNextPage: false,
                        hasPrevPage: false
                    }
                }
            });
        }

        // First, let's check if there are any projects at all for debugging
        const allProjects = await Project.find({ isActive: true }).lean();
        console.log("Total active projects:", allProjects.length);
        
        // Check projects for specific user
        const userProjects = await Project.find({ 
            owner: userId,
            isActive: true 
        }).lean();
        console.log("User's own projects:", userProjects.length);

        // Fetch projects from followed users + own projects
        // Try both ObjectId and string versions for owner field
        const projects = await Project.find({
            $and: [
                {
                    $or: [
                        { owner: { $in: userIdsToShow } }, // String version
                        { owner: { $in: [...followedUsers.map(f => f.following), userId] } } // ObjectId version
                    ]
                },
                { isActive: true }
            ]
        })
        .populate({
            path: 'owner',
            select: 'fullname email profile skillLevel university'
        })
        .populate({
            path: 'collaborators.userId',
            select: 'fullname profile'
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

        console.log("Found projects:", projects.length);

        // Transform projects to match frontend expectations
        const transformedPosts = projects.map(project => ({
            _id: project._id,
            author: {
                _id: project.owner._id,
                fullname: project.owner.fullname,
                profile: project.owner.profile || { avatar: null },
                skillLevel: project.owner.skillLevel || 'beginner',
                university: project.owner.university || '',
                verified: false // You can add verification logic later
            },
            title: project.title,
            description: project.description,
            tags: project.techStack || [],
            images: [], // Add if you have project images
            projectLink: project.githubUrl,
            liveDemo: project.liveUrl,
            likes: 0, // Initialize - you can add likes functionality later
            comments: 0, // Initialize - you can add comments functionality later
            bookmarks: 0, // Initialize - you can add bookmarks functionality later
            views: Math.floor(Math.random() * 200) + 50, // Random for now
            isLiked: false, // You can check against user's likes later
            isBookmarked: false, // You can check against user's bookmarks later
            rating: (Math.random() * 1.5 + 3.5).toFixed(1), // Random rating between 3.5-5.0
            createdAt: formatTimeAgo(project.createdAt),
            type: 'project',
            status: project.projectStatus,
            collaborators: project.collaborators || []
        }));

        // Get total count for pagination
        const totalPosts = await Project.countDocuments({
            $and: [
                {
                    $or: [
                        { owner: { $in: userIdsToShow } },
                        { owner: { $in: [...followedUsers.map(f => f.following), userId] } }
                    ]
                },
                { isActive: true }
            ]
        });

        const totalPages = Math.ceil(totalPosts / limit);

        res.status(200).json({
            success: true,
            data: {
                posts: transformedPosts,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalPosts,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Error fetching feed posts:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching feed posts',
            error: error.message
        });
    }
};

// Get suggested users to follow (users with similar interests or skill level)
const getSuggestedUsers = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select('interests skillLevel');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get users already being followed
        const followedUsers = await Follow.find({ follower: userId })
            .select('following')
            .lean();
        const followedUserIds = followedUsers.map(follow => follow.following.toString());
        
        // Find users with similar interests or skill level
        const suggestedUsers = await User.find({
            _id: { 
                $ne: userId,
                $nin: followedUserIds
            },
            $or: [
                { interests: { $in: user.interests || [] } },
                { skillLevel: user.skillLevel }
            ]
        })
        .select('fullname profile skillLevel university stats')
        .limit(5)
        .lean();

        res.status(200).json({
            success: true,
            data: suggestedUsers
        });

    } catch (error) {
        console.error('Error fetching suggested users:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching suggested users',
            error: error.message
        });
    }
};

// Get trending projects (most recent projects with high engagement)
const getTrendingProjects = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        // For now, get most recent projects
        // Later you can implement proper trending algorithm based on likes, views, etc.
        const trendingProjects = await Project.find({
            isActive: true,
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        })
        .populate({
            path: 'owner',
            select: 'fullname profile skillLevel university'
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

        const transformedTrending = trendingProjects.map(project => ({
            _id: project._id,
            title: project.title,
            description: project.description,
            author: project.owner,
            techStack: project.techStack,
            githubUrl: project.githubUrl,
            liveUrl: project.liveUrl,
            createdAt: formatTimeAgo(project.createdAt)
        }));

        res.status(200).json({
            success: true,
            data: transformedTrending
        });

    } catch (error) {
        console.error('Error fetching trending projects:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching trending projects',
            error: error.message
        });
    }
};

// Helper function to format time ago
const formatTimeAgo = (date) => {
    const now = new Date();
    const diffInMs = now - new Date(date);
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 60) {
        return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    } else if (diffInHours < 24) {
        return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffInDays === 1) {
        return '1 day ago';
    } else if (diffInDays < 7) {
        return `${diffInDays} days ago`;
    } else {
        return new Date(date).toLocaleDateString();
    }
};

module.exports = {
    getFeedPosts,
    getSuggestedUsers,
    getTrendingProjects
};