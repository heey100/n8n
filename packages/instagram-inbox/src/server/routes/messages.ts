import express from 'express';
import { DatabaseManager } from '../services/DatabaseManager';
import { InstagramManager } from '../services/InstagramManager';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();
const dbManager = new DatabaseManager();

// We'll need to get this from the main app
let instagramManager: InstagramManager;

export function initializeInstagramManager(igManager: InstagramManager) {
  instagramManager = igManager;
}

// Get messages for all accounts or specific account/thread
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { accountId, threadId, limit = 50 } = req.query;

    if (accountId) {
      const messages = await dbManager.getMessages(
        accountId as string, 
        threadId as string, 
        parseInt(limit as string)
      );
      res.json(messages);
    } else {
      // Get messages from all accounts
      const accounts = await dbManager.getAllAccounts();
      const allMessages = [];

      for (const account of accounts) {
        const messages = await dbManager.getMessages(account.id, undefined, 20);
        allMessages.push(...messages.map(msg => ({
          ...msg,
          accountUsername: account.username
        })));
      }

      // Sort by timestamp descending
      allMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      res.json(allMessages.slice(0, parseInt(limit as string)));
    }

  } catch (error) {
    console.error('Failed to get messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Send a message
router.post('/send', async (req: AuthRequest, res) => {
  try {
    const { accountId, recipientUsername, message } = req.body;

    if (!accountId || !recipientUsername || !message) {
      return res.status(400).json({ 
        error: 'Account ID, recipient username, and message are required' 
      });
    }

    const success = await instagramManager.sendMessage(accountId, recipientUsername, message);
    
    if (success) {
      res.json({ message: 'Message sent successfully' });
    } else {
      res.status(400).json({ error: 'Failed to send message' });
    }

  } catch (error) {
    console.error('Failed to send message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Mark message as read
router.post('/:messageId/read', async (req: AuthRequest, res) => {
  try {
    const { messageId } = req.params;
    await dbManager.markMessageAsRead(messageId);
    res.json({ message: 'Message marked as read' });
  } catch (error) {
    console.error('Failed to mark message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// Get conversation between account and specific user
router.get('/conversation/:accountId/:threadId', async (req: AuthRequest, res) => {
  try {
    const { accountId, threadId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const messages = await dbManager.getMessages(
      accountId, 
      threadId, 
      parseInt(limit as string)
    );

    // Apply offset
    const startIndex = parseInt(offset as string);
    const paginatedMessages = messages.slice(startIndex, startIndex + parseInt(limit as string));

    res.json({
      messages: paginatedMessages,
      total: messages.length,
      hasMore: startIndex + parseInt(limit as string) < messages.length
    });

  } catch (error) {
    console.error('Failed to get conversation:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// Get unread messages count
router.get('/unread/count', async (req: AuthRequest, res) => {
  try {
    const { accountId } = req.query;

    if (accountId) {
      const messages = await dbManager.getMessages(accountId as string);
      const unreadCount = messages.filter(m => !m.isRead && m.direction === 'incoming').length;
      res.json({ unreadCount, accountId });
    } else {
      // Get unread count for all accounts
      const accounts = await dbManager.getAllAccounts();
      const unreadCounts = [];

      for (const account of accounts) {
        const messages = await dbManager.getMessages(account.id);
        const unreadCount = messages.filter(m => !m.isRead && m.direction === 'incoming').length;
        unreadCounts.push({
          accountId: account.id,
          accountUsername: account.username,
          unreadCount
        });
      }

      const totalUnread = unreadCounts.reduce((sum, acc) => sum + acc.unreadCount, 0);
      
      res.json({ 
        totalUnread,
        accounts: unreadCounts
      });
    }

  } catch (error) {
    console.error('Failed to get unread count:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// Search messages
router.get('/search', async (req: AuthRequest, res) => {
  try {
    const { query, accountId, limit = 50 } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // This is a simple implementation - in production you might want to use full-text search
    let accounts = [];
    if (accountId) {
      const account = await dbManager.getAccount(accountId as string);
      if (account) accounts = [account];
    } else {
      accounts = await dbManager.getAllAccounts();
    }

    const searchResults = [];
    const searchTerm = (query as string).toLowerCase();

    for (const account of accounts) {
      const messages = await dbManager.getMessages(account.id);
      const filteredMessages = messages.filter(msg => 
        msg.content.toLowerCase().includes(searchTerm)
      );
      
      searchResults.push(...filteredMessages.map(msg => ({
        ...msg,
        accountUsername: account.username
      })));
    }

    // Sort by timestamp descending and limit
    searchResults.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    res.json({
      results: searchResults.slice(0, parseInt(limit as string)),
      total: searchResults.length,
      query: query as string
    });

  } catch (error) {
    console.error('Failed to search messages:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

// Get message statistics
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const { accountId, days = 7 } = req.query;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days as string));

    let accounts = [];
    if (accountId) {
      const account = await dbManager.getAccount(accountId as string);
      if (account) accounts = [account];
    } else {
      accounts = await dbManager.getAllAccounts();
    }

    const stats = {
      totalMessages: 0,
      incomingMessages: 0,
      outgoingMessages: 0,
      unreadMessages: 0,
      messagesInPeriod: 0,
      accountStats: []
    };

    for (const account of accounts) {
      const messages = await dbManager.getMessages(account.id);
      const recentMessages = messages.filter(m => new Date(m.timestamp) >= daysAgo);
      
      const accountStats = {
        accountId: account.id,
        accountUsername: account.username,
        totalMessages: messages.length,
        incomingMessages: messages.filter(m => m.direction === 'incoming').length,
        outgoingMessages: messages.filter(m => m.direction === 'outgoing').length,
        unreadMessages: messages.filter(m => !m.isRead && m.direction === 'incoming').length,
        messagesInPeriod: recentMessages.length
      };

      stats.accountStats.push(accountStats);
      stats.totalMessages += accountStats.totalMessages;
      stats.incomingMessages += accountStats.incomingMessages;
      stats.outgoingMessages += accountStats.outgoingMessages;
      stats.unreadMessages += accountStats.unreadMessages;
      stats.messagesInPeriod += accountStats.messagesInPeriod;
    }

    res.json(stats);

  } catch (error) {
    console.error('Failed to get message stats:', error);
    res.status(500).json({ error: 'Failed to get message stats' });
  }
});

export default router;