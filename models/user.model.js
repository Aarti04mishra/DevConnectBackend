const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const userSchema = mongoose.Schema({
    fullname: {
        type: String,
        required: true,
        minLength: [3, 'Full name must be at least 3 characters long'],
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: true,
        minLength: [6, 'Password must be at least 6 characters long'],
        select: false
    },
    university: {
        type: String,
        required: true,
        trim: true,
        minLength: [3, 'University name must be at least 3 characters long']
    },
    skillLevel: {
        type: String,
        required: true,
        enum: ['beginner', 'intermediate', 'advanced'],
        default: 'beginner'
    },
    interests: [{
        type: String,
        enum: [
            'Web Development', 
            'Mobile Apps', 
            'AI/ML', 
            'Data Science',
            'DevOps', 
            'Cybersecurity', 
            'Game Development', 
            'Blockchain',
            'Cloud Computing', 
            'IoT', 
            'AR/VR', 
            'Robotics'
        ]
    }],
    
    socialProfiles: {
        github: {
            type: String,
            trim: true,
            validate: {
                validator: function(v) {
                    return !v || /^https:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/.test(v);
                },
                message: 'Please enter a valid GitHub URL'
            }
        },
        linkedin: {
            type: String,
            trim: true,
            validate: {
                validator: function(v) {
                    return !v || /^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/.test(v);
                },
                message: 'Please enter a valid LinkedIn URL'
            }
        }
    },
    bio: {
        type: String,
        maxLength: [500, 'Bio cannot exceed 500 characters'],
        trim: true
    },
    socketID: { 
        type: String, 
        default: null 
    },
    status: { 
        type: String, 
        enum: ['active', 'inactive', 'busy'], 
        default: 'inactive' 
    },
    lastActive: { 
        type: Date, 
        default: Date.now 
    },
    profile: {
        avatar: {
            type: String,
            default: null
        },
        completionPercentage: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        joinedDate: {
            type: Date,
            default: Date.now
        },
        lastActive: {
            type: Date,
            default: Date.now
        }
    },
    preferences: {
        emailNotifications: {
            type: Boolean,
            default: true
        },
        projectInvites: {
            type: Boolean,
            default: true
        },
        mentorshipRequests: {
            type: Boolean,
            default: true
        }
    },
    stats: {
        projectsJoined: {
            type: Number,
            default: 0
        },
        projectsCreated: {
            type: Number,
            default: 0
        },
        connectionsCount: {
            type: Number,
            default: 0
        },
        reputation: {
            type: Number,
            default: 0,
            min: 0
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Index for efficient queries
userSchema.index({ email: 1 });
userSchema.index({ skillLevel: 1, interests: 1 });
userSchema.index({ 'profile.lastActive': -1 });

// Virtual for followers count
userSchema.virtual('followersCount', {
    ref: 'Follow',
    localField: '_id',
    foreignField: 'following',
    count: true
});

// Virtual for following count
userSchema.virtual('followingCount', {
    ref: 'Follow',
    localField: '_id',
    foreignField: 'follower',
    count: true
});

// Update last active timestamp
userSchema.methods.updateLastActive = function() {
    this.lastActive = new Date();
    this.profile.lastActive = new Date();
    return this.save();
};

// Generate JWT token
userSchema.methods.getAuthToken = function() {
    const token = jwt.sign(
        { 
            _id: this._id,
            email: this.email,
            skillLevel: this.skillLevel
        }, 
        process.env.JWT_SECRET, 
        { expiresIn: '24h' }
    );
    return token;
};

// Virtual for checking if users are connected
userSchema.virtual('isConnected').get(function() {
    return this.stats.connectionsCount > 0;
});

// Compare password for login
userSchema.methods.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
};

// Hash password before saving
userSchema.statics.hashPassword = async function(password) {
    return await bcrypt.hash(password, 10);
};

// Calculate profile completion percentage
userSchema.methods.calculateProfileCompletion = function() {
    let completion = 0;
    const fields = [
        'fullname', 'email', 'university', 'skillLevel', 'interests', 'bio'
    ];
    
    // Each field is worth 15 points (6 fields × 15 = 90 points)
    fields.forEach(field => {
        if (field === 'interests') {
            if (this[field] && this[field].length > 0) completion += 15;
        } else if (field === 'bio') {
            // Bio is optional, so only add points if it exists and has content
            if (this[field] && this[field].trim().length > 0) completion += 15;
        } else if (this[field]) {
            completion += 15;
        }
    });
    
    // Bonus points for social profiles (5 points each, total 10 points)
    if (this.socialProfiles && this.socialProfiles.github && this.socialProfiles.github.trim()) {
        completion += 5;
    }
    if (this.socialProfiles && this.socialProfiles.linkedin && this.socialProfiles.linkedin.trim()) {
        completion += 5;
    }
    
    // Ensure completion never exceeds 100
    this.profile.completionPercentage = Math.min(Math.round(completion), 100);
    return this.profile.completionPercentage;
};

// Get user's public profile (excluding sensitive data)
userSchema.methods.getPublicProfile = function() {
    const userObject = this.toObject();
    delete userObject.password;
    delete userObject.socketID;
    delete userObject.preferences;
    return userObject;
};

// Get user's profile with follow counts
userSchema.methods.getProfileWithCounts = async function() {
    await this.populate(['followersCount', 'followingCount']);
    return this.getPublicProfile();
};

// Find users with similar interests
userSchema.statics.findSimilarUsers = function(userId, interests, skillLevel) {
    return this.find({
        _id: { $ne: userId },
        $or: [
            { interests: { $in: interests } },
            { skillLevel: skillLevel }
        ],
        status: 'active'
    }).select('-password -socketID').limit(10);
};

// Pre-save middleware to hash password and calculate profile completion
userSchema.pre('save', async function(next) {
    // Hash password if it's modified
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    
    // Calculate profile completion
    this.calculateProfileCompletion();
    
    next();
});

// Pre-save middleware to update timestamps
userSchema.pre('save', function(next) {
    if (this.isNew) {
        this.profile.joinedDate = new Date();
    }
    this.profile.lastActive = new Date();
    next();
});

module.exports = mongoose.model('User', userSchema);