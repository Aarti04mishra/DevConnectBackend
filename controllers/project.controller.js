const Project = require('../models/project.model');
const User = require('../models/user.model');

// Create a new project
const createProject = async (req, res) => {
  try {
    const { title, description, githubUrl, liveUrl, techStack, projectTypes, collaborators } = req.body;
    const userId = req.user.id; // Assuming you have authentication middleware

    // Create the project
    const newProject = new Project({
      title,
      description,
      githubUrl,
      liveUrl,
      techStack,
      projectStatus: projectTypes,
      owner: userId,
      collaborators: collaborators.map(collab => ({ userId: collab.id }))
    });

    const savedProject = await newProject.save();

    // Add project to owner's projects array
    await User.findByIdAndUpdate(userId, {
      $push: {
        projects: {
          projectId: savedProject._id,
          role: 'owner'
        }
      }
    });

    // Add project to all collaborators' projects arrays
    if (collaborators && collaborators.length > 0) {
      const collaboratorIds = collaborators.map(collab => collab.id);
      
      await User.updateMany(
        { _id: { $in: collaboratorIds } },
        {
          $push: {
            projects: {
              projectId: savedProject._id,
              role: 'collaborator'
            }
          }
        }
      );
    }

    // Populate the response with user details
    const populatedProject = await Project.findById(savedProject._id)
  .populate('owner', 'fullname email profile.avatar')
  .populate('collaborators.userId', 'fullname email profile.avatar');

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project: populatedProject
    });

  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create project',
      error: error.message
    });
  }
};

// Get all projects for a user
const getUserProjects = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId)
      .populate({
        path: 'projects.projectId',
        populate: {
          path: 'owner collaborators.userId',
          select: 'name username avatar'
        }
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      projects: user.projects
    });

  } catch (error) {
    console.error('Error fetching user projects:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch projects',
      error: error.message
    });
  }
};

// Search users for collaboration
const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    const currentUserId = req.user.id;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

  const users = await User.find({
  _id: { $ne: currentUserId },
  $or: [
    { fullname: { $regex: query, $options: 'i' } },
    { email: { $regex: query, $options: 'i' } }
  ]
}).select('fullname email profile.avatar').limit(10);

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
        message: 'Only project owner can add collaborators'
      });
    }

    // Check if user is already a collaborator
    const isAlreadyCollaborator = project.collaborators.some(
      collab => collab.userId.toString() === collaboratorId
    );

    if (isAlreadyCollaborator) {
      return res.status(400).json({
        success: false,
        message: 'User is already a collaborator'
      });
    }

    // Add to project collaborators
    await Project.findByIdAndUpdate(projectId, {
      $push: {
        collaborators: { userId: collaboratorId }
      }
    });

    // Add to user's projects
    await User.findByIdAndUpdate(collaboratorId, {
      $push: {
        projects: {
          projectId: projectId,
          role: 'collaborator'
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Collaborator added successfully'
    });

  } catch (error) {
    console.error('Error adding collaborator:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add collaborator',
      error: error.message
    });
  }
};

module.exports = {
  createProject,
  getUserProjects,
  searchUsers,
  addCollaborator
};
