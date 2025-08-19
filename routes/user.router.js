const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/user.model');
const userController=require('../controllers/user.controller')
const { authMiddleware } = require('../Middleware/authMiddleware'); 
const Project=require('../models/project.model');
router.post('/register',[
 body('fullname')
        .notEmpty()
        .withMessage('Full name is required')
        .isLength({ min: 3 })
        .withMessage('Full name must be at least 3 characters long')
        .trim(),
    
    body('email')
        .isEmail()
        .withMessage('Please enter a valid email')
        .normalizeEmail()
        .toLowerCase(),
    
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),
    
    body('university')
        .notEmpty()
        .withMessage('University is required')
        .isLength({ min: 3 })
        .withMessage('University name must be at least 3 characters long')
        .trim(),
    
    body('skillLevel')
        .isIn(['beginner', 'intermediate', 'advanced'])
        .withMessage('Invalid skill level'),
    
    body('interests')
        .isArray({ min: 1 })
        .withMessage('Please select at least one interest'),
    
    body('github')
        .optional()
        .matches(/^https:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/)
        .withMessage('Please enter a valid GitHub URL'),
    
    body('linkedin')
        .optional()
        .matches(/^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/)
        .withMessage('Please enter a valid LinkedIn URL'),
    
    body('bio')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Bio cannot exceed 500 characters')
        .trim()
],userController.registerUser)


// Login route
router.post('/login', [
    body('email')
        .isEmail()
        .withMessage('Please enter a valid email')
        .normalizeEmail(),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 1 })  
        .withMessage('Password cannot be empty')
], userController.loginUser);

router.get('/search', userController.generalUserSearch);

router.get('/profile/:userId', userController.getUserProfile);

router.get('/projects', authMiddleware, async (req, res) => {
  try {
    // Find projects where user is either owner OR collaborator
    const projects = await Project.find({
      $or: [
        { owner: req.user.id }, // User is owner
        { 'collaborators.userId': req.user.id } // User is collaborator
      ]
    })
      .populate('collaborators.userId', 'fullname email')
      .populate('owner', 'fullname email')
      .sort({ createdAt: -1 });

    // Transform the data to match frontend expectations
    const transformedProjects = projects.map(project => ({
      ...project.toObject(),
      // Add user's role in this project
      userRole: project.owner._id.toString() === req.user.id ? 'owner' : 'collaborator',
      // Filter out current user from collaborators list
      collaborators: project.collaborators
        .filter(collab => collab.userId._id.toString() !== req.user.id)
        .map(collab => ({
          id: collab.userId._id,
          name: collab.userId.fullname,
          email: collab.userId.email,
          joinedAt: collab.joinedAt
        }))
    }));

    const stats = {
      projectsCompleted: projects.filter(p => p.projectStatus === 'completed').length,
      projectsOwned: projects.filter(p => p.owner._id.toString() === req.user.id).length,
      projectsCollaborated: projects.filter(p => p.owner._id.toString() !== req.user.id).length,
      connectionsMode: 0, // You can calculate this based on your needs
      profileViews: 0 // You can calculate this based on your needs
    };

    res.json({
      projects: transformedProjects,
      stats
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;

