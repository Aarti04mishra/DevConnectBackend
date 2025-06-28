const express = require('express');
const router = express.Router();
const { createProject, getUserProjects, searchUsers, addCollaborator } = require('../controllers/project.controller');
// const authMiddleware = require('../middleware/auth'); 

// Create a new project
router.post('/create', createProject);

// Get user's projects
router.get('/my-projects',  getUserProjects);

// Search users for collaboration
router.get('/search-users',  searchUsers);

// Add collaborator to project
router.post('/:projectId/add-collaborator', addCollaborator);

module.exports = router;
