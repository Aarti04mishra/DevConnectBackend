const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    type: {
        type: String,
        enum: ['direct', 'group'],
        default: 'direct'
    },
    // For group conversations
    name: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    avatar: {
        type: String
    },
    // Admin for group conversations
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    // For archiving conversations
    isArchived: {
        type: Boolean,
        default: false
    },
    archivedBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        archivedAt: {
            type: Date,
            default: Date.now
        }
    }],
    // For muting conversations
    mutedBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        mutedAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

// Indexes for efficient queries
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastActivity: -1 });
conversationSchema.index({ type: 1 });

// Ensure direct conversations have exactly 2 participants
conversationSchema.pre('save', function(next) {
    if (this.type === 'direct' && this.participants.length !== 2) {
        next(new Error('Direct conversations must have exactly 2 participants'));
    } else {
        next();
    }
});

// Virtual for conversation display name (for direct messages)
conversationSchema.virtual('displayName').get(function() {
    if (this.type === 'group') {
        return this.name || 'Group Chat';
    }
    // For direct messages, this would be set dynamically based on the other participant
    return 'Direct Message';
});

// Method to add participant (for group chats)
conversationSchema.methods.addParticipant = function(userId) {
    if (!this.participants.includes(userId)) {
        this.participants.push(userId);
        return this.save();
    }
    return Promise.resolve(this);
};

// Method to remove participant
conversationSchema.methods.removeParticipant = function(userId) {
    this.participants = this.participants.filter(p => !p.equals(userId));
    return this.save();
};

// Method to check if user is participant
conversationSchema.methods.isParticipant = function(userId) {
    return this.participants.some(p => p.equals(userId));
};

// Method to archive conversation for a user
conversationSchema.methods.archiveForUser = function(userId) {
    const existingArchive = this.archivedBy.find(a => a.user.equals(userId));
    if (!existingArchive) {
        this.archivedBy.push({ user: userId });
        return this.save();
    }
    return Promise.resolve(this);
};

// Method to unarchive conversation for a user
conversationSchema.methods.unarchiveForUser = function(userId) {
    this.archivedBy = this.archivedBy.filter(a => !a.user.equals(userId));
    return this.save();
};

// Method to mute conversation for a user
conversationSchema.methods.muteForUser = function(userId) {
    const existingMute = this.mutedBy.find(m => m.user.equals(userId));
    if (!existingMute) {
        this.mutedBy.push({ user: userId });
        return this.save();
    }
    return Promise.resolve(this);
};

// Method to unmute conversation for a user
conversationSchema.methods.unmuteForUser = function(userId) {
    this.mutedBy = this.mutedBy.filter(m => !m.user.equals(userId));
    return this.save();
};

// Static method to find or create direct conversation
conversationSchema.statics.findOrCreateDirectConversation = function(user1Id, user2Id) {
    return this.findOneAndUpdate(
        {
            type: 'direct',
            participants: { $all: [user1Id, user2Id], $size: 2 }
        },
        {
            $setOnInsert: {
                participants: [user1Id, user2Id],
                type: 'direct',
                lastActivity: new Date()
            },
            $set: {
                lastActivity: new Date()
            }
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
        }
    );
};


// Static method to get user's conversations
conversationSchema.statics.getUserConversations = function(userId, page = 1, limit = 20) {
    return this.find({
        participants: userId,
        'archivedBy.user': { $ne: userId }
    })
    .populate('participants', 'fullname profile.avatar status lastActive')
    .populate('lastMessage')
    .sort({ lastActivity: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .exec();
};

// Static method to get conversation with unread count
conversationSchema.statics.getConversationWithUnreadCount = async function(conversationId, userId) {
    const Message = require('./message.model');
    
    const conversation = await this.findById(conversationId)
        .populate('participants', 'fullname profile.avatar status lastActive')
        .populate('lastMessage');
    
    if (!conversation) return null;
    
    const unreadCount = await Message.countDocuments({
        conversationId: conversationId,
        senderId: { $ne: userId },
        status: { $ne: 'read' },
        isDeleted: false
    });
    
    return {
        ...conversation.toObject(),
        unreadCount
    };
};

module.exports = mongoose.model('Conversation', conversationSchema);