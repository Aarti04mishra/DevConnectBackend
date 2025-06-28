const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../Middleware/authMiddleware');
const notificationController = require('../controllers/notification.controller');

// Get user's notifications
router.get('/notifications', authMiddleware, notificationController.getNotifications);

// Mark a notification as read
router.put('/notifications/:id/read', authMiddleware, notificationController.markAsRead);

// Mark all notifications as read
router.put('/notifications/mark-all-read', authMiddleware, notificationController.markAllAsRead);

// Get unread notifications count
router.get('/notifications/unread-count', authMiddleware, notificationController.getUnreadCount);

// Delete a notification
router.delete('/notifications/:id', authMiddleware, notificationController.deleteNotification);

module.exports = router;