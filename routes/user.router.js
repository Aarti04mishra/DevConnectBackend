const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/user.model');
const userController=require('../controllers/user.controller')


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

router.get('/search', userController.searchUsers);

router.get('/profile/:userId', userController.getUserProfile);

module.exports = router;

