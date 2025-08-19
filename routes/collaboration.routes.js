// Backend routes (Express.js) - Fixed version
// File: routes/collaboration.js

const express = require('express');
const router = express.Router();
const {authMiddleware} = require('../Middleware/authMiddleware'); // Your auth middleware
const User = require('../models/user.model');
const Project = require('../models/project.model');
const Notification = require('../models/notification.model');

// Send collaboration request
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const { projectId, projectOwnerId, message } = req.body;
    const requesterId = req.user._id; // From auth middleware (using _id instead of id)

    // Validate input
    if (!projectId || !projectOwnerId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Project ID, project owner ID, and message are required'
      });
    }

    // Check if project exists and is collaborative
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (project.projectStatus !== 'collaborative') {
      return res.status(400).json({
        success: false,
        message: 'This project is not accepting collaborators'
      });
    }

    // Check if user is already a collaborator
    const isAlreadyCollaborator = project.collaborators.some(
      collab => collab.userId.toString() === requesterId.toString()
    );

    if (isAlreadyCollaborator) {
      return res.status(400).json({
        success: false,
        message: 'You are already a collaborator on this project'
      });
    }

    // Get requester details
    const requester = await User.findById(requesterId).select('fullname email');
    
    // Create notification for project owner using the correct schema
    const notification = new Notification({
      sender: requesterId,  // Required field
      recipient: projectOwnerId,  // Required field
      type: 'collaboration_request',  // Make sure this is in your enum values
      message: `${requester.fullname} wants to collaborate on your project "${project.title}": ${message}`,
      // Store additional data in relatedData if your schema supports it
      relatedData: {
        projectId: projectId,
        projectTitle: project.title,
        requesterId: requesterId,
        requesterName: requester.fullname,
        requesterEmail: requester.email,
        requestMessage: message
      },
      // If your schema uses projectId field directly
      projectId: projectId,
      projectTitle: project.title,
      isRead: false
    });

    await notification.save();

    // If you have socket.io for real-time notifications
    if (global.io) {
      global.io.to(projectOwnerId.toString()).emit('new_notification', {
        notification: notification,
        unreadCount: await Notification.countDocuments({ 
          recipient: projectOwnerId, 
          isRead: false 
        })
      });
    }

    res.json({
      success: true,
      message: 'Collaboration request sent successfully',
      data: {
        notificationId: notification._id
      }
    });

  } catch (error) {
    console.error('Error sending collaboration request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send collaboration request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Respond to collaboration request (accept/reject)
router.post('/respond/:requestId', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action, message } = req.body; // action: 'accept' or 'reject'
    const userId = req.user._id;

    // Find the notification
    const notification = await Notification.findById(requestId);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Collaboration request not found'
      });
    }

    // Check if current user is the recipient of the request
    if (notification.recipient.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to respond to this request'
      });
    }

    // Get project and requester info from notification
    const projectId = notification.projectId || notification.relatedData?.projectId;
    const requesterId = notification.sender;
    const requester = await User.findById(requesterId).select('fullname');

    if (action === 'accept') {
      // Add collaborator to project
      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      // Check if not already a collaborator
      const isAlreadyCollaborator = project.collaborators.some(
        collab => collab.userId.toString() === requesterId.toString()
      );

      if (!isAlreadyCollaborator) {
        project.collaborators.push({
          userId: requesterId,
          joinDate: new Date(),
          role: 'collaborator'
        });
        await project.save();
      }

      // Create notification for the requester
      const acceptNotification = new Notification({
        sender: userId,
        recipient: requesterId,
        type: 'collaboration_accepted', // Make sure this is in your enum
        message: `Your collaboration request for "${project.title}" has been accepted!${message ? ' Message: ' + message : ''}`,
        projectId: projectId,
        projectTitle: project.title,
        relatedData: {
          projectId: projectId,
          projectTitle: project.title,
          projectOwnerId: userId,
          responseMessage: message || ''
        },
        isRead: false
      });

      await acceptNotification.save();

      // Send real-time notification
      if (global.io) {
        global.io.to(requesterId.toString()).emit('new_notification', {
          notification: acceptNotification,
          unreadCount: await Notification.countDocuments({ 
            recipient: requesterId, 
            isRead: false 
          })
        });
      }

    } else if (action === 'reject') {
      // Create notification for the requester
      const rejectNotification = new Notification({
        sender: userId,
        recipient: requesterId,
        type: 'collaboration_rejected', // Make sure this is in your enum
        message: `Your collaboration request for "${notification.projectTitle}" was declined.${message ? ' Message: ' + message : ''}`,
        projectId: projectId,
        projectTitle: notification.projectTitle,
        relatedData: {
          projectId: projectId,
          projectTitle: notification.projectTitle,
          projectOwnerId: userId,
          responseMessage: message || ''
        },
        isRead: false
      });

      await rejectNotification.save();

      // Send real-time notification
      if (global.io) {
        global.io.to(requesterId.toString()).emit('new_notification', {
          notification: rejectNotification,
          unreadCount: await Notification.countDocuments({ 
            recipient: requesterId, 
            isRead: false 
          })
        });
      }
    }

    // Mark the original request as read/handled
    notification.isRead = true;
    if (notification.relatedData) {
      notification.relatedData.responded = true;
      notification.relatedData.response = action;
      notification.relatedData.responseDate = new Date();
    }
    await notification.save();

    res.json({
      success: true,
      message: `Collaboration request ${action}ed successfully`,
      data: {
        action: action,
        projectId: projectId
      }
    });

  } catch (error) {
    console.error('Error responding to collaboration request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to respond to collaboration request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get collaboration requests for current user
router.get('/requests', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const requests = await Notification.find({
      recipient: userId,
      type: 'collaboration_request',
      'relatedData.responded': { $ne: true }
    })
    .populate('sender', 'fullname email')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: requests
    });

  } catch (error) {
    console.error('Error getting collaboration requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get collaboration requests',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;