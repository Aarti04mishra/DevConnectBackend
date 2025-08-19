const Project = require('../models/project.model');
const User = require('../models/user.model');
const Notification = require('../models/notification.model');

// Create a new project
const createProject = async (req, res) => {
  try {
    const { 
      title, 
      description, 
      githubUrl, 
      liveUrl, 
      techStack, 
      projectTypes, 
      collaborationPurpose // Add this new field
    } = req.body;

    // Validation
    if (!title || !description || !projectTypes) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, and project status are required'
      });
    }

    // Validate collaboration purpose for collaborative projects
    if (projectTypes === 'collaborative' && (!collaborationPurpose || collaborationPurpose.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Collaboration purpose is required for collaborative projects'
      });
    }

    const newProject = new Project({
      title,
      description,
      githubUrl,
      liveUrl,
      techStack: techStack || [],
      projectStatus: projectTypes,
      collaborationPurpose: projectTypes === 'collaborative' ? collaborationPurpose : [], // Handle the array
      owner: req.user.id,
      collaborators: []
    });

    await newProject.save();

    // Populate owner information
    await newProject.populate('owner', 'fullname email profile.avatar');

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project: newProject
    });

  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating project'
    });
  }
};

// Get all projects for a user
const getUserProjects = async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [
        { owner: req.user.id },
        { 'collaborators.userId': req.user.id }
      ],
      isActive: true
    })
    .populate('owner', 'fullname email profile.avatar')
    .populate('collaborators.userId', 'fullname email profile.avatar')
    .sort({ createdAt: -1 });

    // Transform the data to include collaboration purpose properly
    const transformedProjects = projects.map(project => ({
      ...project.toObject(),
      collaborationPurpose: project.collaborationPurpose || [] // Ensure it's always an array
    }));

    res.json({
      success: true,
      projects: transformedProjects
    });

  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching projects'
    });
  }
};


// Search users for collaboration
const searchUsers = async (req, res) => {
  try {
    const { q } = req.query; 
    const currentUserId = req.user.id; // Fixed: use req.user.id for consistency

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const users = await User.find({
      _id: { $ne: currentUserId },
      $or: [
        { fullname: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { university: { $regex: q, $options: 'i' } }
      ]
    }).select('fullname email university profile.avatar skillLevel interests').limit(10);

    res.status(200).json({
      success: true,
      users
    });

  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search users',
      error: error.message
    });
  }
};

// Add collaborator to existing project
const addCollaborator = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { collaboratorId } = req.body;
    const userId = req.user.id;

    const project = await Project.findById(projectId);
    if (!project || project.owner.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Only project owner can send collaboration requests'
      });
    }

    // Check if already collaborator
    const isAlreadyCollaborator = project.collaborators.some(
      collab => collab.userId.toString() === collaboratorId
    );

    if (isAlreadyCollaborator) {
      return res.status(400).json({
        success: false,
        message: 'User is already a collaborator'
      });
    }

    // Send collaboration request instead of directly adding
    const success = await sendCollaborationRequest(userId, collaboratorId, projectId, project.title);
    
    if (success) {
      res.status(200).json({
        success: true,
        message: 'Collaboration request sent successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send collaboration request'
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send collaboration request',
      error: error.message
    });
  }
};

// Remove collaborator from project
const removeCollaborator = async (req, res) => {
  try {
    const { projectId, collaboratorId } = req.params;
    const userId = req.user.id;

    // Check if user is the owner of the project
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (project.owner.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Only project owner can remove collaborators'
      });
    }

    // Remove from project collaborators
    const originalCollaborators = [...project.collaborators];
    project.collaborators = project.collaborators.filter(
      collab => collab.userId.toString() !== collaboratorId
    );
    await project.save();

    // Remove from user's projects
    const collaborator = await User.findById(collaboratorId);
    if (collaborator) {
      collaborator.projects = collaborator.projects.filter(
        p => p.projectId.toString() !== projectId || p.role !== 'collaborator'
      );
      collaborator.stats.projectsJoined = Math.max(0, collaborator.stats.projectsJoined - 1);
      await collaborator.save();
    }

    res.status(200).json({
      success: true,
      message: 'Collaborator removed successfully'
    });

  } catch (error) {
    console.error('Error removing collaborator:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove collaborator',
      error: error.message
    });
  }
};

// Delete project
const deleteProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    // Find the project first to get collaborators
    const project = await Project.findOne({
      _id: projectId,
      owner: userId
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found or you are not the owner'
      });
    }

    // Store collaborators before deleting
    const collaborators = [...project.collaborators];

    // Delete the project
    await Project.findByIdAndDelete(projectId);

    // Remove project from owner's projects array
    const owner = await User.findById(userId);
    if (owner) {
      owner.projects = owner.projects.filter(p => p.projectId.toString() !== projectId);
      owner.stats.projectsCreated = Math.max(0, owner.stats.projectsCreated - 1);
      await owner.save();
    }

    // Remove project from all collaborators' arrays
    for (const collaborator of collaborators) {
      try {
        const user = await User.findById(collaborator.userId);
        if (user) {
          user.projects = user.projects.filter(p => p.projectId.toString() !== projectId);
          user.stats.projectsJoined = Math.max(0, user.stats.projectsJoined - 1);
          await user.save();
        }
      } catch (collabError) {
        console.error(`Error removing project from collaborator ${collaborator.userId}:`, collabError);
        // Continue with other collaborators
      }
    }

    res.status(200).json({
      success: true,
      message: 'Project deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete project',
      error: error.message
    });
  }
};

// Add this function in project.controller.js
const sendCollaborationRequest = async (senderId, recipientId, projectId, projectTitle) => {
  try {
    const sender = await User.findById(senderId).select('fullname profile.avatar');
    
    // Create notification in database
    const notification = new Notification({
      recipient: recipientId,
      sender: senderId,
      type: 'project_invite',
      message: `${sender.fullname} invited you to collaborate on "${projectTitle}"`,
      relatedData: {
        projectId: projectId,
        projectTitle: projectTitle,
        action: 'collaboration_request'
      }
    });

    await notification.save();

    // Send real-time notification via socket
    const { emitToUser } = require('../socket');
    const unreadCount = await Notification.countDocuments({
      recipient: recipientId,
      isRead: false
    });

    emitToUser(recipientId, 'newNotification', {
      notification: {
        _id: notification._id,
        type: 'project_invite',
        message: notification.message,
        sender: {
          _id: sender._id,
          fullname: sender.fullname,
          avatar: sender.profile?.avatar
        },
        createdAt: notification.createdAt,
        relatedData: notification.relatedData
      },
      unreadCount: unreadCount
    });

    return true;
  } catch (error) {
    console.error('Error sending collaboration request:', error);
    return false;
  }
};

// Accept collaboration request
const acceptCollaborationRequest = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: userId,
      type: 'project_invite'
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Collaboration request not found'
      });
    }

    const { projectId } = notification.relatedData;
    const project = await Project.findById(projectId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project no longer exists'
      });
    }

    // Add to project collaborators
    project.collaborators.push({ userId: userId });
    await project.save();

    // Add to user's projects
    const user = await User.findById(userId);
    user.projects.push({
      projectId: projectId,
      role: 'collaborator'
    });
    user.stats.projectsJoined += 1;
    await user.save();

    // Mark notification as read
    notification.isRead = true;
    await notification.save();

    // Send confirmation to project owner
    await sendCollaborationAcceptedNotification(userId, project.owner, project.title);

    res.status(200).json({
      success: true,
      message: 'Collaboration request accepted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to accept collaboration request',
      error: error.message
    });
  }
};

// Reject collaboration request
const rejectCollaborationRequest = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        recipient: userId,
        type: 'project_invite'
      },
      { isRead: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Collaboration request not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Collaboration request rejected'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to reject collaboration request'
    });
  }
};

const sendCollaborationAcceptedNotification = async (acceptorId, ownerId, projectTitle) => {
  try {
    const acceptor = await User.findById(acceptorId).select('fullname profile.avatar');
    
    // Create notification for project owner
    const notification = new Notification({
      recipient: ownerId,
      sender: acceptorId,
      type: 'project_update',
      message: `${acceptor.fullname} accepted your collaboration request for "${projectTitle}"`,
      relatedData: {
        action: 'collaboration_accepted',
        projectTitle: projectTitle
      }
    });

    await notification.save();

    // Send real-time notification
    const { emitToUser } = require('../socket');
    const unreadCount = await Notification.countDocuments({
      recipient: ownerId,
      isRead: false
    });

    emitToUser(ownerId, 'newNotification', {
      notification: {
        _id: notification._id,
        type: 'project_update',
        message: notification.message,
        sender: {
          _id: acceptor._id,
          fullname: acceptor.fullname,
          avatar: acceptor.profile?.avatar
        },
        createdAt: notification.createdAt,
        relatedData: notification.relatedData
      },
      unreadCount: unreadCount
    });

    return true;
  } catch (error) {
    console.error('Error sending collaboration accepted notification:', error);
    return false;
  }
};

module.exports = {
  createProject,
  getUserProjects,
  searchUsers,
  addCollaborator,
  acceptCollaborationRequest,
  rejectCollaborationRequest,
  removeCollaborator,
  deleteProject,
  sendCollaborationAcceptedNotification 
};