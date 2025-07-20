import { IgApiClient } from 'instagram-private-api';
import { Server } from 'socket.io';
import { ProxyManager } from './ProxyManager';
import { DatabaseManager, InstagramAccount, Message } from './DatabaseManager';

interface AccountSession {
  client: IgApiClient;
  accountId: string;
  username: string;
  isActive: boolean;
  lastActivity: Date;
  proxyId?: string;
}

export class InstagramManager {
  private sessions: Map<string, AccountSession> = new Map();
  private dbManager: DatabaseManager;
  private proxyManager: ProxyManager;
  private io: Server;
  private syncIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(proxyManager: ProxyManager, io: Server) {
    this.proxyManager = proxyManager;
    this.io = io;
    this.dbManager = new DatabaseManager();
  }

  async initializeAccount(account: InstagramAccount): Promise<boolean> {
    try {
      const client = new IgApiClient();
      
      // Configure proxy if specified
      if (account.proxyId) {
        const proxyAgent = this.proxyManager.getAgent(account.proxyId);
        if (proxyAgent) {
          client.request.defaults.httpAgent = proxyAgent;
          client.request.defaults.httpsAgent = proxyAgent;
          console.log(`🔗 Using proxy for account ${account.username}`);
        }
      }

      // Set device settings
      client.state.generateDevice(account.username);
      
      // Restore session if available
      if (account.sessionData) {
        try {
          await client.state.deserialize(account.sessionData);
          console.log(`✅ Restored session for ${account.username}`);
        } catch (error) {
          console.log(`⚠️  Failed to restore session for ${account.username}, will need to re-login`);
          return false;
        }
      }

      // Test the session
      try {
        await client.account.currentUser();
        console.log(`✅ Account ${account.username} is authenticated`);
      } catch (error) {
        console.log(`❌ Account ${account.username} authentication failed`);
        return false;
      }

      // Store the session
      const session: AccountSession = {
        client,
        accountId: account.id,
        username: account.username,
        isActive: true,
        lastActivity: new Date(),
        proxyId: account.proxyId
      };

      this.sessions.set(account.id, session);
      
      // Start message sync for this account
      this.startMessageSync(account.id);
      
      return true;
    } catch (error) {
      console.error(`Failed to initialize account ${account.username}:`, error);
      return false;
    }
  }

  async loginAccount(username: string, password: string, proxyId?: string): Promise<{ success: boolean; accountId?: string; sessionData?: string; error?: string }> {
    try {
      const client = new IgApiClient();
      
      // Configure proxy if specified
      if (proxyId) {
        const proxyAgent = this.proxyManager.getAgent(proxyId);
        if (proxyAgent) {
          client.request.defaults.httpAgent = proxyAgent;
          client.request.defaults.httpsAgent = proxyAgent;
        }
      }

      // Generate device
      client.state.generateDevice(username);
      
      // Login
      await client.account.login(username, password);
      
      // Get session data
      const sessionData = await client.state.serialize();
      delete sessionData.constants; // Remove constants to reduce size
      
      // Save to database
      const accountId = await this.dbManager.createAccount({
        username,
        sessionData: JSON.stringify(sessionData),
        proxyId,
        isActive: true,
        lastSync: new Date()
      });

      // Create session
      const session: AccountSession = {
        client,
        accountId,
        username,
        isActive: true,
        lastActivity: new Date(),
        proxyId
      };

      this.sessions.set(accountId, session);
      
      // Start message sync
      this.startMessageSync(accountId);
      
      console.log(`✅ Successfully logged in account ${username}`);
      
      return {
        success: true,
        accountId,
        sessionData: JSON.stringify(sessionData)
      };
      
    } catch (error) {
      console.error(`Failed to login account ${username}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendMessage(accountId: string, recipientUsername: string, message: string): Promise<boolean> {
    try {
      const session = this.sessions.get(accountId);
      if (!session || !session.isActive) {
        throw new Error('Account session not found or inactive');
      }

      // Get recipient user ID
      const recipient = await session.client.user.searchExact(recipientUsername);
      if (!recipient) {
        throw new Error('Recipient not found');
      }

      // Get or create thread
      const thread = session.client.entity.directThread([recipient.pk.toString()]);
      
      // Send message
      await thread.broadcastText(message);
      
      // Save to database
      await this.dbManager.createMessage({
        accountId,
        threadId: thread.threadId,
        senderId: session.client.state.cookieUserId,
        recipientId: recipient.pk.toString(),
        content: message,
        messageType: 'text',
        timestamp: new Date(),
        isRead: true,
        direction: 'outgoing'
      });

      // Emit to connected clients
      this.io.to(`account-${accountId}`).emit('message-sent', {
        accountId,
        recipientUsername,
        message,
        timestamp: new Date()
      });

      session.lastActivity = new Date();
      console.log(`📤 Message sent from ${session.username} to ${recipientUsername}`);
      
      return true;
    } catch (error) {
      console.error(`Failed to send message:`, error);
      return false;
    }
  }

  async getMessages(accountId: string, threadId?: string): Promise<Message[]> {
    return await this.dbManager.getMessages(accountId, threadId);
  }

  private startMessageSync(accountId: string): void {
    // Clear existing interval if any
    const existingInterval = this.syncIntervals.get(accountId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Start new sync interval (every 30 seconds)
    const interval = setInterval(async () => {
      await this.syncMessages(accountId);
    }, 30000);

    this.syncIntervals.set(accountId, interval);
  }

  private async syncMessages(accountId: string): Promise<void> {
    try {
      const session = this.sessions.get(accountId);
      if (!session || !session.isActive) return;

      // Get inbox
      const inbox = await session.client.feed.directInbox().items();
      
      for (const thread of inbox) {
        // Get recent messages from this thread
        const recentMessages = thread.items.slice(0, 10); // Last 10 messages
        
        for (const message of recentMessages) {
          // Check if message already exists in database
          const existingMessages = await this.dbManager.getMessages(accountId, thread.threadId);
          const messageExists = existingMessages.some(m => 
            m.timestamp.getTime() === message.timestamp * 1000
          );
          
          if (!messageExists) {
            // Save new message
            const messageId = await this.dbManager.createMessage({
              accountId,
              threadId: thread.threadId,
              senderId: message.userId.toString(),
              recipientId: session.client.state.cookieUserId,
              content: message.text || '[Media]',
              messageType: message.text ? 'text' : 'media',
              timestamp: new Date(message.timestamp * 1000),
              isRead: false,
              direction: message.userId.toString() === session.client.state.cookieUserId ? 'outgoing' : 'incoming'
            });

            // Emit to connected clients
            this.io.to(`account-${accountId}`).emit('new-message', {
              accountId,
              messageId,
              threadId: thread.threadId,
              content: message.text || '[Media]',
              timestamp: new Date(message.timestamp * 1000),
              direction: message.userId.toString() === session.client.state.cookieUserId ? 'outgoing' : 'incoming'
            });
          }
        }
      }

      session.lastActivity = new Date();
      
      // Update last sync in database
      await this.dbManager.updateAccount(accountId, { lastSync: new Date() });
      
    } catch (error) {
      console.error(`Failed to sync messages for account ${accountId}:`, error);
      
      // If authentication failed, mark session as inactive
      if (error.message.includes('401') || error.message.includes('login')) {
        const session = this.sessions.get(accountId);
        if (session) {
          session.isActive = false;
          await this.dbManager.updateAccount(accountId, { isActive: false });
        }
      }
    }
  }

  async disconnectAccount(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (session) {
      session.isActive = false;
      this.sessions.delete(accountId);
      
      // Clear sync interval
      const interval = this.syncIntervals.get(accountId);
      if (interval) {
        clearInterval(interval);
        this.syncIntervals.delete(accountId);
      }
      
      await this.dbManager.updateAccount(accountId, { isActive: false });
      console.log(`🔌 Disconnected account ${session.username}`);
    }
  }

  getActiveAccounts(): AccountSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  async getAccountThreads(accountId: string): Promise<any[]> {
    try {
      const session = this.sessions.get(accountId);
      if (!session || !session.isActive) {
        throw new Error('Account session not found or inactive');
      }

      const inbox = await session.client.feed.directInbox().items();
      
      return inbox.map(thread => ({
        threadId: thread.threadId,
        users: thread.users.map(user => ({
          pk: user.pk,
          username: user.username,
          fullName: user.fullName,
          profilePic: user.profilePicUrl
        })),
        lastActivity: new Date(thread.lastActivity * 1000),
        hasUnread: thread.hasUnreadMessage
      }));
      
    } catch (error) {
      console.error(`Failed to get threads for account ${accountId}:`, error);
      return [];
    }
  }

  async markThreadAsRead(accountId: string, threadId: string): Promise<void> {
    try {
      const session = this.sessions.get(accountId);
      if (!session || !session.isActive) return;

      // Mark thread as seen on Instagram
      await session.client.directThread.markItemSeen(threadId);
      
      // Update local database
      const messages = await this.dbManager.getMessages(accountId, threadId);
      for (const message of messages) {
        if (!message.isRead && message.direction === 'incoming') {
          await this.dbManager.markMessageAsRead(message.id);
        }
      }
      
    } catch (error) {
      console.error(`Failed to mark thread as read:`, error);
    }
  }

  // Initialize all accounts from database
  async initializeAllAccounts(): Promise<void> {
    try {
      const accounts = await this.dbManager.getAllAccounts();
      
      for (const account of accounts) {
        if (account.isActive) {
          await this.initializeAccount(account);
        }
      }
      
      console.log(`📱 Initialized ${this.sessions.size} Instagram accounts`);
    } catch (error) {
      console.error('Failed to initialize accounts:', error);
    }
  }

  // Get account statistics
  getStats(): { total: number; active: number; lastActivity: { [accountId: string]: Date } } {
    const sessions = Array.from(this.sessions.values());
    return {
      total: sessions.length,
      active: sessions.filter(s => s.isActive).length,
      lastActivity: Object.fromEntries(
        sessions.map(s => [s.accountId, s.lastActivity])
      )
    };
  }
}