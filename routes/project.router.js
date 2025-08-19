const express = require('express');
const router = express.Router();
const {
  createProject,
  getUserProjects,
  searchUsers,
  addCollaborator,
  acceptCollaborationRequest,
  rejectCollaborationRequest,
  removeCollaborator,
  deleteProject
} = require('../controllers/project.controller');
const { authMiddleware } = require('../Middleware/authMiddleware'); 

// Create a new project
router.post('/create', authMiddleware, createProject);

// Get user's projects
router.get('/my-projects', authMiddleware, getUserProjects);

// Search users for collaboration
router.get('/search-users', authMiddleware, searchUsers);

// Add collaborator to project (sends request)
router.post('/:projectId/add-collaborator', authMiddleware, addCollaborator);

// Accept collaboration request
router.post('/collaboration/accept/:notificationId', authMiddleware, acceptCollaborationRequest);

// Reject collaboration request  
router.post('/collaboration/reject/:notificationId', authMiddleware, rejectCollaborationRequest);

// Remove collaborator from project
router.delete('/:projectId/collaborator/:collaboratorId', authMiddleware, removeCollaborator);

// Delete project
router.delete('/:projectId', authMiddleware, deleteProject);

module.exports = router;