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
            fullname,    // ← Changed from fullName to fullname
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