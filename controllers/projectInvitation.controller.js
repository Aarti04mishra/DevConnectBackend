const ProjectInvitation = require('../models/projectInvitation.model');
const Project = require('../models/project.model');
const User = require('../models/user.model');
const Notification = require('../models/notification.model');

// Send project invitation
const sendInvitation = async (req, res) => {
    try {
        const { projectId, invitedUserId, message } = req.body;
        const inviterId = req.user._id;

        // Validate project exists and user is owner
        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        if (project.owner.toString() !== inviterId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Only project owner can send invitations'
            });
        }

        // Check if user exists
        const invitedUser = await User.findById(invitedUserId);
        if (!invitedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user is already a collaborator
        const isAlreadyCollaborator = project.collaborators.some(
            collab => collab.userId.toString() === invitedUserId
        );

        if (isAlreadyCollaborator) {
            return res.status(400).json({
                success: false,
                message: 'User is already a collaborator on this project'
            });
        }

        // Check if invitation already exists
        const existingInvitation = await ProjectInvitation.invitationExists(projectId, invitedUserId);
        if (existingInvitation) {
            return res.status(400).json({
                success: false,
                message: 'Invitation already sent to this user'
            });
        }

        // Create invitation
        const invitation = new ProjectInvitation({
            project: projectId,
            invitedBy: inviterId,
            invitedUser: invitedUserId,
            invitedEmail: invitedUser.email,
            message: message || '',
            projectDetails: {
                title: project.title,
                description: project.description,
                techStack: project.techStack
            }
        });

        await invitation.save();

        // Create notification
        const notification = new Notification({
            recipient: invitedUserId,
            sender: inviterId,
            type: 'project_invite',
            message: `${req.user.fullname} invited you to collaborate on "${project.title}"`,
            relatedData: {
                invitationId: invitation._id,
                projectId: projectId,
                projectTitle: project.title
            }
        });

        await notification.save();

        // Populate invitation for response
        const populatedInvitation = await ProjectInvitation.findById(invitation._id)
            .populate('invitedUser', 'fullname email profile.avatar')
            .populate('invitedBy', 'fullname profile.avatar');

        res.status(201).json({
            success: true,
            message: 'Invitation sent successfully',
            data: { invitation: populatedInvitation }
        });

    } catch (error) {
        console.error('Error sending invitation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send invitation',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

// Get user's received invitations
const getReceivedInvitations = async (req, res) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const invitations = await ProjectInvitation.find({
            invitedUser: userId,
            status: 'pending',
            expiresAt: { $gt: new Date() }
        })
        .populate('project', 'title description techStack projectStatus')
        .populate('invitedBy', 'fullname profile.avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

        const totalInvitations = await ProjectInvitation.countDocuments({
            invitedUser: userId,
            status: 'pending',
            expiresAt: { $gt: new Date() }
        });

        res.json({
            success: true,
            data: {
                invitations,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalInvitations / limit),
                    totalInvitations,
                    hasMore: page * limit < totalInvitations
                }
            }
        });

    } catch (error) {
        console.error('Error fetching invitations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch invitations',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

// Get sent invitations
const getSentInvitations = async (req, res) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const invitations = await ProjectInvitation.find({
            invitedBy: userId
        })
        .populate('project', 'title description')
        .populate('invitedUser', 'fullname email profile.avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

        const totalInvitations = await ProjectInvitation.countDocuments({
            invitedBy: userId
        });

        res.json({
            success: true,
            data: {
                invitations,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalInvitations / limit),
                    totalInvitations,
                    hasMore: page * limit < totalInvitations
                }
            }
        });

    } catch (error) {
        console.error('Error fetching sent invitations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sent invitations',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

// Accept invitation
const acceptInvitation = async (req, res) => {
    try {
        const { invitationId } = req.params;
        const userId = req.user._id;

        const invitation = await ProjectInvitation.findOne({
            _id: invitationId,
            invitedUser: userId,
            status: 'pending'
        }).populate('project');

        if (!invitation) {
            return res.status(404).json({
                success: false,
                message: 'Invitation not found or already responded'
            });
        }

        if (invitation.isExpired) {
            invitation.status = 'expired';
            await invitation.save();
            return res.status(400).json({
                success: false,
                message: 'Invitation has expired'
            });
        }

        // Accept the invitation
        await invitation.accept();

        // Add user to project collaborators
        const project = await Project.findById(invitation.project._id);
        project.collaborators.push({ userId: userId });
        await project.save();

        // Add project to user's projects
        const user = await User.findById(userId);
        user.projects.push({
            projectId: invitation.project._id,
            role: 'collaborator'
        });
        user.stats.projectsJoined += 1;
        await user.save();

        // Create success notification for project owner
        const successNotification = new Notification({
            recipient: invitation.invitedBy,
            sender: userId,
            type: 'project_update',
            message: `${user.fullname} accepted your invitation to collaborate on "${invitation.project.title}"`,
            relatedData: {
                projectId: invitation.project._id,
                projectTitle: invitation.project.title
            }
        });

        await successNotification.save();

        res.json({
            success: true,
            message: 'Invitation accepted successfully',
            data: { invitation }
        });

    } catch (error) {
        console.error('Error accepting invitation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to accept invitation',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

// Decline invitation
const declineInvitation = async (req, res) => {
    try {
        const { invitationId } = req.params;
        const userId = req.user._id;

        const invitation = await ProjectInvitation.findOne({
            _id: invitationId,
            invitedUser: userId,
            status: 'pending'
        }).populate('project invitedBy', 'title fullname');

        if (!invitation) {
            return res.status(404).json({
                success: false,
                message: 'Invitation not found or already responded'
            });
        }

        // Decline the invitation
        await invitation.decline();

        // Optional: Create notification for project owner about decline
        const declineNotification = new Notification({
            recipient: invitation.invitedBy._id,
            sender: userId,
            type: 'project_update',
            message: `${req.user.fullname} declined your invitation to collaborate on "${invitation.project.title}"`,
            relatedData: {
                projectId: invitation.project._id,
                projectTitle: invitation.project.title
            }
        });

        await declineNotification.save();

        res.json({
            success: true,
            message: 'Invitation declined',
            data: { invitation }
        });

    } catch (error) {
        console.error('Error declining invitation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to decline invitation',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

// Cancel sent invitation (for project owners)
const cancelInvitation = async (req, res) => {
    try {
        const { invitationId } = req.params;
        const userId = req.user._id;

        const invitation = await ProjectInvitation.findOne({
            _id: invitationId,
            invitedBy: userId,
            status: 'pending'
        });

        if (!invitation) {
            return res.status(404).json({
                success: false,
                message: 'Invitation not found or cannot be cancelled'
            });
        }

        await ProjectInvitation.findByIdAndDelete(invitationId);

        res.json({
            success: true,
            message: 'Invitation cancelled successfully'
        });

    } catch (error) {
        console.error('Error cancelling invitation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel invitation',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};

module.exports = {
    sendInvitation,
    getReceivedInvitations,
    getSentInvitations,
    acceptInvitation,
    declineInvitation,
    cancelInvitation
};