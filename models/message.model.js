const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'file', 'code', 'link'],
        default: 'text'
    },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read'],
        default: 'sent'
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    // For file messages
    fileName: {
        type: String
    },
    fileSize: {
        type: String
    },
    fileUrl: {
        type: String
    },
    // For edited messages
    isEdited: {
        type: Boolean,
        default: false
    },
    editedAt: {
        type: Date
    },
    // For deleted messages
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Index for efficient queries
messageSchema.index({ conversationId: 1, timestamp: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ status: 1 });

// Virtual for formatted timestamp
messageSchema.virtual('formattedTime').get(function() {
    return this.timestamp.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
});

// Method to mark as read
messageSchema.methods.markAsRead = function() {
    this.status = 'read';
    return this.save();
};

// Method to mark as delivered
messageSchema.methods.markAsDelivered = function() {
    if (this.status === 'sent') {
        this.status = 'delivered';
        return this.save();
    }
    return Promise.resolve(this);
};

// Static method to get conversation messages
messageSchema.statics.getConversationMessages = function(conversationId, page = 1, limit = 50) {
    return this.find({ 
        conversationId: conversationId,
        isDeleted: false 
    })
    .populate('senderId', 'fullname profile.avatar')
    .sort({ timestamp: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .exec();
};

// Static method to mark messages as read
messageSchema.statics.markConversationAsRead = function(conversationId, userId) {
    return this.updateMany(
        {
            conversationId: conversationId,
            senderId: { $ne: userId },
            status: { $ne: 'read' }
        },
        {
            status: 'read'
        }
    );
};

// Static method to get unread message count for a user
messageSchema.statics.getUnreadCount = function(userId) {
    return this.aggregate([
        {
            $match: {
                status: { $ne: 'read' },
                isDeleted: false
            }
        },
        {
            $lookup: {
                from: 'conversations',
                localField: 'conversationId',
                foreignField: '_id',
                as: 'conversation'
            }
        },
        {
            $unwind: '$conversation'
        },
        {
            $match: {
                'conversation.participants': userId,
                senderId: { $ne: userId }
            }
        },
        {
            $group: {
                _id: '$conversationId',
                unreadCount: { $sum: 1 }
            }
        }
    ]);
};

module.exports = mongoose.model('Message', messageSchema);