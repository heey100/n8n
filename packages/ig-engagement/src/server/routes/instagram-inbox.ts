import express from 'express';
import { InstagramMessagingService } from '../services/InstagramMessagingService';

const router = express.Router();

// This will be injected by the main server
let messagingService: InstagramMessagingService;

export const setMessagingService = (service: InstagramMessagingService) => {
  messagingService = service;
};

/**
 * Get unified inbox with all conversations from all Instagram accounts
 */
router.get('/conversations', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!messagingService) {
      return res.status(503).json({
        success: false,
        error: 'Instagram messaging service not initialized'
      });
    }

    const result = await messagingService.getUnifiedInbox(page, limit);

    res.json({
      success: true,
      data: result,
      pagination: {
        page,
        limit,
        total: result.totalCount,
        pages: Math.ceil(result.totalCount / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error getting unified inbox:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get unified inbox'
    });
  }
});

/**
 * Get messages for a specific conversation
 */
router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!messagingService) {
      return res.status(503).json({
        success: false,
        error: 'Instagram messaging service not initialized'
      });
    }

    const result = await messagingService.getConversationMessages(conversationId, page, limit);

    res.json({
      success: true,
      data: result,
      pagination: {
        page,
        limit,
        total: result.totalCount,
        pages: Math.ceil(result.totalCount / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error getting conversation messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get conversation messages'
    });
  }
});

/**
 * Send a reply to an Instagram conversation
 */
router.post('/conversations/:conversationId/reply', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { accountId, content, replyType = 'text', attachment } = req.body;

    if (!conversationId || !accountId || !content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: conversationId, accountId, content'
      });
    }

    if (!messagingService) {
      return res.status(503).json({
        success: false,
        error: 'Instagram messaging service not initialized'
      });
    }

    const result = await messagingService.sendReply({
      conversationId,
      accountId,
      content,
      replyType,
      attachment
    });

    if (result.success) {
      res.json({
        success: true,
        data: {
          messageId: result.messageId,
          content,
          timestamp: new Date()
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ Error sending Instagram reply:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send reply'
    });
  }
});

/**
 * Mark conversation as read
 */
router.post('/conversations/:conversationId/mark-read', async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!messagingService) {
      return res.status(503).json({
        success: false,
        error: 'Instagram messaging service not initialized'
      });
    }

    await messagingService.markConversationAsRead(conversationId);

    res.json({
      success: true,
      message: 'Conversation marked as read'
    });

  } catch (error) {
    console.error('❌ Error marking conversation as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark conversation as read'
    });
  }
});

/**
 * Search conversations and messages
 */
router.get('/search', async (req, res) => {
  try {
    const { q: query, accountId } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    if (!messagingService) {
      return res.status(503).json({
        success: false,
        error: 'Instagram messaging service not initialized'
      });
    }

    const result = await messagingService.searchInbox(query, accountId as string);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error searching inbox:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search inbox'
    });
  }
});

/**
 * Get inbox activity stats
 */
router.get('/activity', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;

    if (!messagingService) {
      return res.status(503).json({
        success: false,
        error: 'Instagram messaging service not initialized'
      });
    }

    const activity = await messagingService.getInboxActivity(hours);

    res.json({
      success: true,
      data: activity
    });

  } catch (error) {
    console.error('❌ Error getting inbox activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get inbox activity'
    });
  }
});

/**
 * Get inbox statistics
 */
router.get('/stats', async (req, res) => {
  try {
    if (!messagingService) {
      return res.status(503).json({
        success: false,
        error: 'Instagram messaging service not initialized'
      });
    }

    const inbox = await messagingService.getUnifiedInbox(1, 1); // Just get stats
    const status = messagingService.getStatus();

    res.json({
      success: true,
      data: {
        stats: inbox.stats,
        status
      }
    });

  } catch (error) {
    console.error('❌ Error getting inbox stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get inbox stats'
    });
  }
});

/**
 * Get service status
 */
router.get('/status', async (req, res) => {
  try {
    if (!messagingService) {
      return res.json({
        success: true,
        data: {
          isInitialized: false,
          error: 'Messaging service not initialized'
        }
      });
    }

    const status = messagingService.getStatus();

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('❌ Error getting service status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service status'
    });
  }
});

/**
 * Quick reply templates for common responses
 */
router.get('/quick-replies', async (req, res) => {
  try {
    const quickReplies = [
      {
        id: 'thanks',
        title: 'Thanks',
        content: 'Thank you for reaching out! 😊'
      },
      {
        id: 'interested',
        title: 'Interested',
        content: 'I\'m interested! Can you tell me more?'
      },
      {
        id: 'not_interested',
        title: 'Not Interested',
        content: 'Thanks for the offer, but I\'m not interested at this time.'
      },
      {
        id: 'check_dm',
        title: 'Check DM',
        content: 'Hey! I sent you a DM with more details 📩'
      },
      {
        id: 'follow_back',
        title: 'Follow Back',
        content: 'Thanks for the follow! Followed you back 🙌'
      },
      {
        id: 'story_reply',
        title: 'Story Reply',
        content: 'Love your story! 🔥'
      },
      {
        id: 'collaboration',
        title: 'Collaboration',
        content: 'I\'d love to collaborate! Let\'s discuss this further.'
      },
      {
        id: 'more_info',
        title: 'More Info',
        content: 'Could you provide more information about this?'
      }
    ];

    res.json({
      success: true,
      data: quickReplies
    });

  } catch (error) {
    console.error('❌ Error getting quick replies:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get quick replies'
    });
  }
});

export default router;