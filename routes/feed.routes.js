const express = require('express');
const router = express.Router();
const { getFeedPosts, getSuggestedUsers, getTrendingProjects } = require('../controllers/feed.controller');
const { authMiddleware } = require('../Middleware/authMiddleware'); // Adjust path as needed

// Get feed posts (projects from followed users + own projects)
router.get('/posts', authMiddleware, getFeedPosts);

// Get suggested users to follow
router.get('/suggested-users', authMiddleware, getSuggestedUsers);

// Get trending projects
router.get('/trending', getTrendingProjects);

module.exports = router;