import express from 'express';
import { DatabaseManager } from '../services/DatabaseManager';
import { ProxyManager } from '../services/ProxyManager';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();
const dbManager = new DatabaseManager();

// We'll need to get this from the main app
let proxyManager: ProxyManager;

export function initializeProxyManager(pManager: ProxyManager) {
  proxyManager = pManager;
}

// Get all proxies
router.get('/', async (req: AuthRequest, res) => {
  try {
    const proxies = await dbManager.getAllProxies();
    
    // Add status information
    const proxiesWithStatus = await Promise.all(proxies.map(async proxy => {
      const isLoaded = proxyManager.getProxy(proxy.id) !== undefined;
      return {
        ...proxy,
        isLoaded,
        status: proxy.isActive ? (isLoaded ? 'active' : 'inactive') : 'disabled'
      };
    }));

    res.json(proxiesWithStatus);
  } catch (error) {
    console.error('Failed to get proxies:', error);
    res.status(500).json({ error: 'Failed to get proxies' });
  }
});

// Add new proxy
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, host, port, username, password, type = 'http' } = req.body;

    if (!name || !host || !port) {
      return res.status(400).json({ error: 'Name, host, and port are required' });
    }

    // Validate proxy configuration
    const proxyConfig = { host, port, username, password, type };
    const validation = proxyManager.validateProxyConfig(proxyConfig);
    
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(', ') });
    }

    // Test proxy before adding
    const testResult = await proxyManager.testProxy(proxyConfig);
    if (!testResult) {
      return res.status(400).json({ error: 'Proxy test failed. Please check your configuration.' });
    }

    // Save to database
    const proxyId = await dbManager.createProxy({
      name,
      host,
      port,
      username,
      password,
      type,
      isActive: true
    });

    // Add to proxy manager
    proxyManager.addProxy(proxyId, proxyConfig);

    res.status(201).json({
      message: 'Proxy added successfully',
      proxyId
    });

  } catch (error) {
    console.error('Failed to add proxy:', error);
    res.status(500).json({ error: 'Failed to add proxy' });
  }
});

// Get proxy details
router.get('/:proxyId', async (req: AuthRequest, res) => {
  try {
    const { proxyId } = req.params;
    const proxy = await dbManager.getProxy(proxyId);
    
    if (!proxy) {
      return res.status(404).json({ error: 'Proxy not found' });
    }

    const isLoaded = proxyManager.getProxy(proxyId) !== undefined;
    
    res.json({
      ...proxy,
      isLoaded,
      status: proxy.isActive ? (isLoaded ? 'active' : 'inactive') : 'disabled'
    });

  } catch (error) {
    console.error('Failed to get proxy details:', error);
    res.status(500).json({ error: 'Failed to get proxy details' });
  }
});

// Update proxy
router.put('/:proxyId', async (req: AuthRequest, res) => {
  try {
    const { proxyId } = req.params;
    const { name, host, port, username, password, type, isActive } = req.body;

    const proxy = await dbManager.getProxy(proxyId);
    if (!proxy) {
      return res.status(404).json({ error: 'Proxy not found' });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (host !== undefined) updates.host = host;
    if (port !== undefined) updates.port = port;
    if (username !== undefined) updates.username = username;
    if (password !== undefined) updates.password = password;
    if (type !== undefined) updates.type = type;
    if (isActive !== undefined) updates.isActive = isActive;

    // If connection details changed, validate and test
    if (host || port || username || password || type) {
      const updatedProxy = { ...proxy, ...updates };
      const proxyConfig = {
        host: updatedProxy.host,
        port: updatedProxy.port,
        username: updatedProxy.username,
        password: updatedProxy.password,
        type: updatedProxy.type
      };

      const validation = proxyManager.validateProxyConfig(proxyConfig);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors.join(', ') });
      }

      const testResult = await proxyManager.testProxy(proxyConfig);
      if (!testResult) {
        return res.status(400).json({ error: 'Proxy test failed. Please check your configuration.' });
      }

      // Update in proxy manager
      if (updatedProxy.isActive) {
        proxyManager.addProxy(proxyId, proxyConfig);
      } else {
        proxyManager.removeProxy(proxyId);
      }
    } else if (isActive !== undefined) {
      // Just changing active status
      if (isActive) {
        const proxyConfig = {
          host: proxy.host,
          port: proxy.port,
          username: proxy.username,
          password: proxy.password,
          type: proxy.type
        };
        proxyManager.addProxy(proxyId, proxyConfig);
      } else {
        proxyManager.removeProxy(proxyId);
      }
    }

    updates.lastUsed = new Date();
    await dbManager.updateProxy(proxyId, updates);

    res.json({ message: 'Proxy updated successfully' });

  } catch (error) {
    console.error('Failed to update proxy:', error);
    res.status(500).json({ error: 'Failed to update proxy' });
  }
});

// Delete proxy
router.delete('/:proxyId', async (req: AuthRequest, res) => {
  try {
    const { proxyId } = req.params;
    
    // Check if proxy is being used by any accounts
    const accounts = await dbManager.getAllAccounts();
    const accountsUsingProxy = accounts.filter(acc => acc.proxyId === proxyId);
    
    if (accountsUsingProxy.length > 0) {
      return res.status(400).json({ 
        error: `Cannot delete proxy. It is being used by ${accountsUsingProxy.length} account(s)`,
        accountsUsing: accountsUsingProxy.map(acc => acc.username)
      });
    }

    // Remove from proxy manager
    proxyManager.removeProxy(proxyId);
    
    // Delete from database
    await dbManager.deleteProxy(proxyId);

    res.json({ message: 'Proxy deleted successfully' });

  } catch (error) {
    console.error('Failed to delete proxy:', error);
    res.status(500).json({ error: 'Failed to delete proxy' });
  }
});

// Test proxy
router.post('/:proxyId/test', async (req: AuthRequest, res) => {
  try {
    const { proxyId } = req.params;
    const proxy = await dbManager.getProxy(proxyId);
    
    if (!proxy) {
      return res.status(404).json({ error: 'Proxy not found' });
    }

    const proxyConfig = {
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
      type: proxy.type
    };

    const testResult = await proxyManager.testProxy(proxyConfig);
    
    if (testResult) {
      const ip = await proxyManager.getProxyIP(proxyId);
      
      // Update last used
      await dbManager.updateProxy(proxyId, { lastUsed: new Date() });
      
      res.json({ 
        success: true, 
        message: 'Proxy test successful',
        ip
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Proxy test failed' 
      });
    }

  } catch (error) {
    console.error('Failed to test proxy:', error);
    res.status(500).json({ error: 'Failed to test proxy' });
  }
});

// Test proxy configuration (without saving)
router.post('/test', async (req: AuthRequest, res) => {
  try {
    const { host, port, username, password, type = 'http' } = req.body;

    if (!host || !port) {
      return res.status(400).json({ error: 'Host and port are required' });
    }

    const proxyConfig = { host, port, username, password, type };
    const validation = proxyManager.validateProxyConfig(proxyConfig);
    
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(', ') });
    }

    const testResult = await proxyManager.testProxy(proxyConfig);
    
    res.json({ 
      success: testResult,
      message: testResult ? 'Proxy test successful' : 'Proxy test failed'
    });

  } catch (error) {
    console.error('Failed to test proxy configuration:', error);
    res.status(500).json({ error: 'Failed to test proxy configuration' });
  }
});

// Get proxy statistics
router.get('/:proxyId/stats', async (req: AuthRequest, res) => {
  try {
    const { proxyId } = req.params;
    const proxy = await dbManager.getProxy(proxyId);
    
    if (!proxy) {
      return res.status(404).json({ error: 'Proxy not found' });
    }

    // Get accounts using this proxy
    const accounts = await dbManager.getAllAccounts();
    const accountsUsingProxy = accounts.filter(acc => acc.proxyId === proxyId);
    
    const ip = proxy.isActive ? await proxyManager.getProxyIP(proxyId) : null;
    
    const stats = {
      proxyId,
      name: proxy.name,
      isActive: proxy.isActive,
      lastUsed: proxy.lastUsed,
      accountsUsing: accountsUsingProxy.length,
      accounts: accountsUsingProxy.map(acc => ({
        id: acc.id,
        username: acc.username,
        isActive: acc.isActive
      })),
      currentIP: ip
    };

    res.json(stats);

  } catch (error) {
    console.error('Failed to get proxy stats:', error);
    res.status(500).json({ error: 'Failed to get proxy stats' });
  }
});

// Get all proxy statistics
router.get('/stats/overview', async (req: AuthRequest, res) => {
  try {
    const proxies = await dbManager.getAllProxies();
    const accounts = await dbManager.getAllAccounts();
    const proxyStats = proxyManager.getProxyStats();
    
    const overview = {
      totalProxies: proxies.length,
      activeProxies: proxies.filter(p => p.isActive).length,
      loadedProxies: proxyStats.active,
      proxiesInUse: new Set(accounts.filter(acc => acc.proxyId).map(acc => acc.proxyId)).size,
      accountsWithProxy: accounts.filter(acc => acc.proxyId).length,
      accountsWithoutProxy: accounts.filter(acc => !acc.proxyId).length
    };

    res.json(overview);

  } catch (error) {
    console.error('Failed to get proxy overview:', error);
    res.status(500).json({ error: 'Failed to get proxy overview' });
  }
});

export default router;