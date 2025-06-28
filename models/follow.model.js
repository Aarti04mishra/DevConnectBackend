const mongoose = require('mongoose');

const followSchema = new mongoose.Schema({
    follower: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    following: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Compound index to ensure unique follow relationships
followSchema.index({ follower: 1, following: 1 }, { unique: true });

// Individual indexes for efficient queries
followSchema.index({ follower: 1 });
followSchema.index({ following: 1 });

// Prevent self-following
followSchema.pre('save', function(next) {
    if (this.follower.equals(this.following)) {
        const error = new Error('Users cannot follow themselves');
        return next(error);
    }
    next();
});

module.exports = mongoose.model('Follow', followSchema);