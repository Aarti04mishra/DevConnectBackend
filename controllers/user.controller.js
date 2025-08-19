const User = require('../models/user.model');
const { body, validationResult } = require('express-validator');

module.exports.registerUser = async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log(errors);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const {
            fullname,    
            email,
            password,
            university,
            skillLevel,
            interests,
            github,
            linkedin,
            bio
        } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'User already exists with this email address'
            });
        }

        // Create new user object
        const userData = {
            fullname,    // ← Changed from fullName to fullname
            email,
            password,
            university,
            skillLevel,
            interests,
            socialProfiles: {},
            bio: bio || ''
        };

        // Add social profiles if provided
        if (github) userData.socialProfiles.github = github;
        if (linkedin) userData.socialProfiles.linkedin = linkedin;

        // Create new user
        const newUser = new User(userData);
        
        // Save user to database
        await newUser.save();

        // Generate authentication token
        const token = newUser.getAuthToken();

        // Get public profile (without sensitive data)
        const userProfile = newUser.getPublicProfile();

        // Send success response
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: userProfile,
                token,
                profileCompletion: newUser.profile.completionPercentage
            }
        });

    } catch (error) {
        console.error('Registration error:', error);

        // Handle specific MongoDB errors
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'User already exists with this email address'
            });
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => ({
                field: err.path,
                message: err.message
            }));
            
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validationErrors
            });
        }

        // Handle other errors
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

module.exports.loginUser = async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { email, password } = req.body;

        // Find user by email and include password field
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Compare password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Update last active timestamp
        await user.updateLastActive();

        // Generate authentication token
        const token = user.getAuthToken();

        // Get public profile (without sensitive data)
        const userProfile = user.getPublicProfile();

        // Send success response
        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                user: userProfile,
                token,
                profileCompletion: user.profile.completionPercentage
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

module.exports.generalUserSearch = async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.trim().length < 2) {
            return res.json({
                success: true,
                data: []
            });
        }

        // Search by fullname (case insensitive, starts with query)
        const users = await User.find({
            fullname: { $regex: `^${q}`, $options: 'i' },
            status: 'active'
        })
        .select('_id fullname university skillLevel profile.avatar')
        .limit(10);

        res.json({
            success: true,
            data: users
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            success: false,
            message: 'Search failed',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

module.exports.getUserProfile = async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('Fetching profile for userId:', userId);

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // First, get user without population to see raw data
        const rawUser = await User.findById(userId).select('-password -socketID -preferences');
        console.log('Raw user projects array:', JSON.stringify(rawUser.projects, null, 2));

        // Find user and populate projects with necessary details
        const user = await User.findById(userId)
            .select('-password -socketID -preferences')
            .populate({
                path: 'projects.projectId',
                select: 'title description techStack projectStatus collaborationPurpose githubUrl liveUrl collaborators owner createdAt updatedAt',
                populate: [
                    {
                        path: 'collaborators.userId',
                        select: 'fullname email profile.avatar'
                    },
                    {
                        path: 'owner',
                        select: 'fullname email profile.avatar'
                    }
                ]
            })
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        console.log('Populated user projects:', JSON.stringify(user.projects, null, 2));

        // Transform the projects array to match frontend expectations
        const transformedProjects = user.projects
            .filter(projectRef => {
                console.log('Processing project ref:', projectRef);
                return projectRef.projectId;
            })
            .map(projectRef => {
                console.log('Transforming project:', projectRef.projectId);
                return {
                    ...projectRef.projectId,
                    userRole: projectRef.role,
                    joinedAt: projectRef.joinedAt
                };
            });

        console.log('Transformed projects:', JSON.stringify(transformedProjects, null, 2));

        // Replace the projects array with transformed data
        user.projects = transformedProjects;

        // Add computed fields that might be missing
        if (!user.stats) {
            user.stats = {
                connectionsCount: 0,
                reputation: 0,
                projectsCount: transformedProjects.length
            };
        }

        // Update project count in stats
        user.stats.projectsCount = transformedProjects.length;

        // Add missing fields that frontend expects
        user.isOnline = user.status === 'active' || false;
        user.lastSeen = user.profile?.lastActive ? 
            new Date(user.profile.lastActive).toLocaleDateString() : 'Recently';
        user.joinDate = user.createdAt || user.profile?.joinedDate || new Date();

        console.log('Final user data being sent:', {
            projectsCount: user.projects.length,
            hasProjects: user.projects.length > 0
        });

        res.json({
            success: true,
            data: user
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user profile',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

module.exports.logoutUser = async (req, res) => {
    try {
        const userId = req.user._id; // Assuming you have user data from auth middleware

        // Update user's last active timestamp and clear socket ID if exists
        await User.findByIdAndUpdate(userId, {
            'profile.lastActive': new Date(),
            socketID: null // Clear socket connection if using real-time features
        });

        // If you're using token blacklisting, you can add the token to a blacklist
        // const token = req.headers.authorization?.split(' ')[1];
        // await TokenBlacklist.create({ token, expiresAt: new Date(Date.now() + 24*60*60*1000) });

        res.status(200).json({
            success: true,
            message: 'Logout successful'
        });

    } catch (error) {
        console.error('Logout error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};
