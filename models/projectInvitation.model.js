const mongoose = require('mongoose');

const projectInvitationSchema = new mongoose.Schema({
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true
    },
    invitedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    invitedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    invitedEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined', 'expired'],
        default: 'pending'
    },
    message: {
        type: String,
        trim: true,
        maxLength: 500
    },
    projectDetails: {
        title: String,
        description: String,
        techStack: [String]
    },
    respondedAt: {
        type: Date,
        default: null
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
projectInvitationSchema.index({ invitedUser: 1, status: 1 });
projectInvitationSchema.index({ project: 1, invitedUser: 1 }, { unique: true }); // Prevent duplicate invitations
projectInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-expire invitations

// Prevent duplicate invitations for same project and user
projectInvitationSchema.index({ 
    project: 1, 
    invitedUser: 1 
}, { 
    unique: true,
    partialFilterExpression: { status: 'pending' }
});

// Virtual to check if invitation is expired
projectInvitationSchema.virtual('isExpired').get(function() {
    return this.expiresAt < new Date();
});

// Method to accept invitation
projectInvitationSchema.methods.accept = async function() {
    if (this.status !== 'pending') {
        throw new Error('Invitation is no longer pending');
    }
    
    if (this.isExpired) {
        this.status = 'expired';
        await this.save();
        throw new Error('Invitation has expired');
    }
    
    this.status = 'accepted';
    this.respondedAt = new Date();
    return this.save();
};

// Method to decline invitation
projectInvitationSchema.methods.decline = async function() {
    if (this.status !== 'pending') {
        throw new Error('Invitation is no longer pending');
    }
    
    this.status = 'declined';
    this.respondedAt = new Date();
    return this.save();
};

// Static method to find pending invitations for a user
projectInvitationSchema.statics.findPendingInvitations = function(userId) {
    return this.find({
        invitedUser: userId,
        status: 'pending',
        expiresAt: { $gt: new Date() }
    }).populate('project invitedBy', 'title description techStack fullname profile.avatar');
};

// Static method to check if invitation already exists
projectInvitationSchema.statics.invitationExists = function(projectId, userId) {
    return this.findOne({
        project: projectId,
        invitedUser: userId,
        status: 'pending'
    });
};

module.exports = mongoose.model('ProjectInvitation', projectInvitationSchema);