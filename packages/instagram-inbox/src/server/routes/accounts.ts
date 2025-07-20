import express from 'express';
import { DatabaseManager } from '../services/DatabaseManager';
import { InstagramManager } from '../services/InstagramManager';
import { ProxyManager } from '../services/ProxyManager';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();
const dbManager = new DatabaseManager();

// We'll need to get these from the main app
let instagramManager: InstagramManager;
let proxyManager: ProxyManager;

// Initialize managers (this would be called from the main app)
export function initializeManagers(igManager: InstagramManager, pManager: ProxyManager) {
  instagramManager = igManager;
  proxyManager = pManager;
}

// Get all accounts
router.get('/', async (req: AuthRequest, res) => {
  try {
    const accounts = await dbManager.getAllAccounts();
    
    // Add proxy information and stats
    const accountsWithInfo = await Promise.all(accounts.map(async account => {
      const proxyInfo = account.proxyId ? await dbManager.getProxy(account.proxyId) : null;
      const stats = instagramManager?.getStats();
      
      return {
        ...account,
        proxy: proxyInfo ? {
          id: proxyInfo.id,
          name: proxyInfo.name,
          host: proxyInfo.host,
          port: proxyInfo.port
        } : null,
        isOnline: stats?.lastActivity[account.id] ? 
          new Date().getTime() - stats.lastActivity[account.id].getTime() < 5 * 60 * 1000 : false
      };
    }));

    res.json(accountsWithInfo);
  } catch (error) {
    console.error('Failed to get accounts:', error);
    res.status(500).json({ error: 'Failed to get accounts' });
  }
});

// Add new Instagram account
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { username, password, proxyId } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Validate proxy if provided
    if (proxyId) {
      const proxy = await dbManager.getProxy(proxyId);
      if (!proxy) {
        return res.status(400).json({ error: 'Invalid proxy ID' });
      }
    }

    // Login to Instagram
    const result = await instagramManager.loginAccount(username, password, proxyId);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({
      message: 'Account added successfully',
      accountId: result.accountId
    });

  } catch (error) {
    console.error('Failed to add account:', error);
    res.status(500).json({ error: 'Failed to add account' });
  }
});

// Get account details
router.get('/:accountId', async (req: AuthRequest, res) => {
  try {
    const { accountId } = req.params;
    const account = await dbManager.getAccount(accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Get proxy info
    const proxyInfo = account.proxyId ? await dbManager.getProxy(account.proxyId) : null;
    
    // Get threads
    const threads = await instagramManager.getAccountThreads(accountId);
    
    res.json({
      ...account,
      proxy: proxyInfo,
      threads
    });

  } catch (error) {
    console.error('Failed to get account details:', error);
    res.status(500).json({ error: 'Failed to get account details' });
  }
});

// Update account
router.put('/:accountId', async (req: AuthRequest, res) => {
  try {
    const { accountId } = req.params;
    const { proxyId, isActive } = req.body;

    const updates: any = {};
    
    if (proxyId !== undefined) {
      if (proxyId) {
        const proxy = await dbManager.getProxy(proxyId);
        if (!proxy) {
          return res.status(400).json({ error: 'Invalid proxy ID' });
        }
      }
      updates.proxyId = proxyId;
    }
    
    if (isActive !== undefined) {
      updates.isActive = isActive;
      
      // If deactivating, disconnect the account
      if (!isActive) {
        await instagramManager.disconnectAccount(accountId);
      }
    }

    await dbManager.updateAccount(accountId, updates);

    res.json({ message: 'Account updated successfully' });

  } catch (error) {
    console.error('Failed to update account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Delete account
router.delete('/:accountId', async (req: AuthRequest, res) => {
  try {
    const { accountId } = req.params;
    
    // Disconnect if active
    await instagramManager.disconnectAccount(accountId);
    
    // Delete from database
    await dbManager.deleteAccount(accountId);

    res.json({ message: 'Account deleted successfully' });

  } catch (error) {
    console.error('Failed to delete account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Get account threads
router.get('/:accountId/threads', async (req: AuthRequest, res) => {
  try {
    const { accountId } = req.params;
    const threads = await instagramManager.getAccountThreads(accountId);
    res.json(threads);
  } catch (error) {
    console.error('Failed to get threads:', error);
    res.status(500).json({ error: 'Failed to get threads' });
  }
});

// Mark thread as read
router.post('/:accountId/threads/:threadId/read', async (req: AuthRequest, res) => {
  try {
    const { accountId, threadId } = req.params;
    await instagramManager.markThreadAsRead(accountId, threadId);
    res.json({ message: 'Thread marked as read' });
  } catch (error) {
    console.error('Failed to mark thread as read:', error);
    res.status(500).json({ error: 'Failed to mark thread as read' });
  }
});

// Get account statistics
router.get('/:accountId/stats', async (req: AuthRequest, res) => {
  try {
    const { accountId } = req.params;
    const stats = instagramManager.getStats();
    const messages = await dbManager.getMessages(accountId);
    
    const accountStats = {
      isOnline: stats.lastActivity[accountId] ? 
        new Date().getTime() - stats.lastActivity[accountId].getTime() < 5 * 60 * 1000 : false,
      lastActivity: stats.lastActivity[accountId],
      totalMessages: messages.length,
      unreadMessages: messages.filter(m => !m.isRead && m.direction === 'incoming').length,
      todayMessages: messages.filter(m => {
        const today = new Date();
        const messageDate = new Date(m.timestamp);
        return messageDate.toDateString() === today.toDateString();
      }).length
    };

    res.json(accountStats);
  } catch (error) {
    console.error('Failed to get account stats:', error);
    res.status(500).json({ error: 'Failed to get account stats' });
  }
});

export default router;