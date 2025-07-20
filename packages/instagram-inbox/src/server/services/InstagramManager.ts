import { Server } from 'socket.io';
import { ProxyManager } from './ProxyManager';
import { DatabaseManager, InstagramAccount, Message } from './DatabaseManager';

interface AccountSession {
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
      // For now, just create a mock session
      const session: AccountSession = {
        accountId: account.id,
        username: account.username,
        isActive: true,
        lastActivity: new Date(),
        proxyId: account.proxyId
      };

      this.sessions.set(account.id, session);
      console.log(`✅ Mock session created for ${account.username}`);
      
      return true;
    } catch (error) {
      console.error(`Failed to initialize account ${account.username}:`, error);
      return false;
    }
  }

  async loginAccount(username: string, password: string, proxyId?: string): Promise<{ success: boolean; accountId?: string; sessionData?: string; error?: string }> {
    try {
      // Mock login for now
      const accountId = await this.dbManager.createAccount({
        username,
        sessionData: JSON.stringify({ mock: true }),
        proxyId,
        isActive: true,
        lastSync: new Date()
      });

      const session: AccountSession = {
        accountId,
        username,
        isActive: true,
        lastActivity: new Date(),
        proxyId
      };

      this.sessions.set(accountId, session);
      
      console.log(`✅ Mock login successful for ${username}`);
      
      return {
        success: true,
        accountId,
        sessionData: JSON.stringify({ mock: true })
      };
      
    } catch (error) {
      console.error(`Failed to login account ${username}:`, error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  async sendMessage(accountId: string, recipientUsername: string, message: string): Promise<boolean> {
    try {
      const session = this.sessions.get(accountId);
      if (!session || !session.isActive) {
        throw new Error('Account session not found or inactive');
      }

      // Mock sending message
      await this.dbManager.createMessage({
        accountId,
        threadId: `thread_${Date.now()}`,
        senderId: 'mock_sender',
        recipientId: recipientUsername,
        content: message,
        messageType: 'text',
        timestamp: new Date(),
        isRead: true,
        direction: 'outgoing'
      });

      this.io.to(`account-${accountId}`).emit('message-sent', {
        accountId,
        recipientUsername,
        message,
        timestamp: new Date()
      });

      session.lastActivity = new Date();
      console.log(`📤 Mock message sent from ${session.username} to ${recipientUsername}`);
      
      return true;
    } catch (error) {
      console.error(`Failed to send message:`, error);
      return false;
    }
  }

  async getMessages(accountId: string, threadId?: string): Promise<Message[]> {
    return await this.dbManager.getMessages(accountId, threadId);
  }

  async disconnectAccount(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (session) {
      session.isActive = false;
      this.sessions.delete(accountId);
      
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
      // Mock threads
      return [
        {
          threadId: 'mock_thread_1',
          users: [
            {
              pk: 'mock_user_1',
              username: 'mock_user',
              fullName: 'Mock User',
              profilePic: 'https://via.placeholder.com/50'
            }
          ],
          lastActivity: new Date(),
          hasUnread: false
        }
      ];
      
    } catch (error) {
      console.error(`Failed to get threads for account ${accountId}:`, error);
      return [];
    }
  }

  async markThreadAsRead(accountId: string, threadId: string): Promise<void> {
    try {
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

  async initializeAllAccounts(): Promise<void> {
    try {
      const accounts = await this.dbManager.getAllAccounts();
      
      for (const account of accounts) {
        if (account.isActive) {
          await this.initializeAccount(account);
        }
      }
      
      console.log(`📱 Initialized ${this.sessions.size} accounts (mock mode)`);
    } catch (error) {
      console.error('Failed to initialize accounts:', error);
    }
  }

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