const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../Middleware/authMiddleware');
const followController = require('../controllers/follow.controller');

// Follow a user
router.post('/follow/:userId', authMiddleware, followController.followUser);

// Unfollow a user
router.delete('/follow/:userId', authMiddleware, followController.unfollowUser);

// Get followers of a user
router.get('/followers/:userId', followController.getFollowers);

// Get following of a user
router.get('/following/:userId', followController.getFollowing);

// Check if current user follows a specific user
router.get('/follow-status/:userId', authMiddleware, followController.checkFollowStatus);

module.exports = router;