import { InstagramBot } from './InstagramBot';
import { DatabaseManager } from './DatabaseManager';
import { Server } from 'socket.io';

interface InstagramMessage {
  id: string;
  accountId: string;
  accountUsername: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  senderProfilePic: string;
  content: string;
  timestamp: Date;
  isRead: boolean;
  messageType: 'text' | 'image' | 'video' | 'voice' | 'story_reply' | 'post_mention';
  attachments?: Array<{
    type: string;
    url: string;
    thumbnail?: string;
  }>;
  isFromMe: boolean;
  conversationPreview?: string;
}

interface InstagramConversation {
  id: string;
  accountId: string;
  accountUsername: string;
  participantId: string;
  participantUsername: string;
  participantProfilePic: string;
  participantFullName: string;
  lastMessage: InstagramMessage;
  unreadCount: number;
  isVerified: boolean;
  followerCount?: number;
  lastActiveAt: Date;
  conversationType: 'direct' | 'group';
  isBusinessAccount: boolean;
}

interface MessageReply {
  conversationId: string;
  accountId: string;
  content: string;
  replyType: 'text' | 'image' | 'quick_reply' | 'story_share';
  attachment?: {
    type: string;
    data: Buffer | string;
  };
}

interface UnifiedInboxStats {
  totalMessages: number;
  unreadMessages: number;
  totalConversations: number;
  unreadConversations: number;
  activeAccounts: number;
  responseRate: number;
  averageResponseTime: number; // minutes
  todaysMessages: number;
  todaysReplies: number;
}

export class InstagramMessagingService {
  private instagramBot: InstagramBot;
  private dbManager: DatabaseManager;
  private io: Server;
  private conversations: Map<string, InstagramConversation[]> = new Map(); // accountId -> conversations
  private messages: Map<string, InstagramMessage[]> = new Map(); // conversationId -> messages
  private lastSyncTimes: Map<string, Date> = new Map(); // accountId -> lastSync
  private syncInterval: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;

  constructor(instagramBot: InstagramBot, dbManager: DatabaseManager, io: Server) {
    this.instagramBot = instagramBot;
    this.dbManager = dbManager;
    this.io = io;
  }

  /**
   * Initialize the unified inbox system
   */
  public async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing Instagram Unified Inbox...');
      
      // Create database tables for messaging
      await this.createMessagingTables();
      
      // Load existing conversations and messages
      await this.loadExistingData();
      
      // Start real-time sync for all accounts
      await this.startRealTimeSync();
      
      this.isInitialized = true;
      console.log('✅ Instagram Unified Inbox initialized successfully!');
      
      // Emit initialization complete
      this.io.emit('instagram:inbox:initialized', {
        status: 'ready',
        timestamp: new Date()
      });
      
    } catch (error) {
      console.error('❌ Failed to initialize Instagram messaging service:', error);
      throw error;
    }
  }

  /**
   * Create database tables for messaging
   */
  private async createMessagingTables(): Promise<void> {
    const createTablesSQL = `
      -- Instagram conversations table
      CREATE TABLE IF NOT EXISTS instagram_conversations (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        account_username TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        participant_username TEXT NOT NULL,
        participant_profile_pic TEXT,
        participant_full_name TEXT,
        last_message_id TEXT,
        unread_count INTEGER DEFAULT 0,
        is_verified BOOLEAN DEFAULT FALSE,
        follower_count INTEGER,
        last_active_at DATETIME,
        conversation_type TEXT DEFAULT 'direct',
        is_business_account BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES instagram_accounts(id),
        UNIQUE(account_id, participant_id)
      );

      -- Instagram messages table
      CREATE TABLE IF NOT EXISTS instagram_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_username TEXT NOT NULL,
        sender_profile_pic TEXT,
        content TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        message_type TEXT DEFAULT 'text',
        attachments TEXT, -- JSON array
        is_from_me BOOLEAN DEFAULT FALSE,
        reply_status TEXT DEFAULT 'none', -- none, pending, sent, failed
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES instagram_conversations(id),
        FOREIGN KEY (account_id) REFERENCES instagram_accounts(id)
      );

      -- Instagram message replies table
      CREATE TABLE IF NOT EXISTS instagram_message_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_message_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        reply_content TEXT NOT NULL,
        reply_type TEXT DEFAULT 'text',
        attachment_data TEXT, -- JSON
        sent_at DATETIME,
        status TEXT DEFAULT 'pending', -- pending, sent, failed
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (original_message_id) REFERENCES instagram_messages(id),
        FOREIGN KEY (conversation_id) REFERENCES instagram_conversations(id),
        FOREIGN KEY (account_id) REFERENCES instagram_accounts(id)
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_conversations_account_id ON instagram_conversations(account_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON instagram_conversations(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON instagram_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON instagram_messages(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_is_read ON instagram_messages(is_read);
      CREATE INDEX IF NOT EXISTS idx_replies_status ON instagram_message_replies(status);
    `;

    await this.dbManager.runQuery(createTablesSQL);
    console.log('📊 Instagram messaging database tables created');
  }

  /**
   * Load existing conversations and messages from database
   */
  private async loadExistingData(): Promise<void> {
    try {
      const accounts = await this.dbManager.getAccounts();
      
      for (const account of accounts) {
        if (account.status !== 'active') continue;
        
        // Load conversations for this account
        const conversations = await this.loadAccountConversations(account.id);
        this.conversations.set(account.id, conversations);
        
        // Load recent messages for each conversation
        for (const conversation of conversations) {
          const messages = await this.loadConversationMessages(conversation.id, 50);
          this.messages.set(conversation.id, messages);
        }
        
        console.log(`📥 Loaded ${conversations.length} conversations for @${account.username}`);
      }
      
    } catch (error) {
      console.error('❌ Error loading existing messaging data:', error);
    }
  }

  /**
   * Load conversations for a specific account from database
   */
  private async loadAccountConversations(accountId: string): Promise<InstagramConversation[]> {
    const query = `
      SELECT 
        c.*,
        m.content as last_message_content,
        m.timestamp as last_message_timestamp,
        m.sender_username as last_message_sender,
        m.is_from_me as last_message_from_me
      FROM instagram_conversations c
      LEFT JOIN instagram_messages m ON c.last_message_id = m.id
      WHERE c.account_id = ?
      ORDER BY c.updated_at DESC
    `;
    
    const rows = await this.dbManager.runQuery(query, [accountId]);
    
    return rows.map(row => ({
      id: row.id,
      accountId: row.account_id,
      accountUsername: row.account_username,
      participantId: row.participant_id,
      participantUsername: row.participant_username,
      participantProfilePic: row.participant_profile_pic,
      participantFullName: row.participant_full_name,
      lastMessage: {
        id: row.last_message_id,
        content: row.last_message_content,
        timestamp: new Date(row.last_message_timestamp),
        senderUsername: row.last_message_sender,
        isFromMe: Boolean(row.last_message_from_me)
      } as InstagramMessage,
      unreadCount: row.unread_count,
      isVerified: Boolean(row.is_verified),
      followerCount: row.follower_count,
      lastActiveAt: new Date(row.last_active_at),
      conversationType: row.conversation_type,
      isBusinessAccount: Boolean(row.is_business_account)
    }));
  }

  /**
   * Load messages for a specific conversation
   */
  private async loadConversationMessages(conversationId: string, limit: number = 50): Promise<InstagramMessage[]> {
    const query = `
      SELECT * FROM instagram_messages 
      WHERE conversation_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `;
    
    const rows = await this.dbManager.runQuery(query, [conversationId, limit]);
    
    return rows.map(row => ({
      id: row.id,
      accountId: row.account_id,
      accountUsername: '', // Will be filled from account data
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      senderUsername: row.sender_username,
      senderProfilePic: row.sender_profile_pic,
      content: row.content,
      timestamp: new Date(row.timestamp),
      isRead: Boolean(row.is_read),
      messageType: row.message_type,
      attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
      isFromMe: Boolean(row.is_from_me)
    })).reverse(); // Reverse to get chronological order
  }

  /**
   * Start real-time synchronization for all accounts
   */
  private async startRealTimeSync(): Promise<void> {
    // Sync every 30 seconds
    this.syncInterval = setInterval(async () => {
      await this.syncAllAccountMessages();
    }, 30000);

    // Initial sync
    await this.syncAllAccountMessages();
    
    console.log('🔄 Real-time Instagram message sync started');
  }

  /**
   * Sync messages for all active accounts
   */
  private async syncAllAccountMessages(): Promise<void> {
    try {
      const accounts = await this.dbManager.getAccounts();
      const activeAccounts = accounts.filter(acc => acc.status === 'active');
      
      for (const account of activeAccounts) {
        await this.syncAccountMessages(account.id);
      }
      
    } catch (error) {
      console.error('❌ Error syncing Instagram messages:', error);
    }
  }

  /**
   * Sync messages for a specific Instagram account
   */
  private async syncAccountMessages(accountId: string): Promise<void> {
    try {
      // Get fresh conversations from Instagram
      const freshConversations = await this.instagramBot.getDirectMessageInbox(accountId);
      
      if (!freshConversations) {
        console.log(`⚠️ Could not fetch conversations for account ${accountId}`);
        return;
      }

      const existingConversations = this.conversations.get(accountId) || [];
      let newMessagesCount = 0;

      for (const conversation of freshConversations) {
        // Update or create conversation
        await this.updateConversation(accountId, conversation);
        
        // Get new messages for this conversation
        const newMessages = await this.instagramBot.getConversationMessages(
          accountId, 
          conversation.id, 
          this.lastSyncTimes.get(`${accountId}_${conversation.id}`)
        );

        if (newMessages && newMessages.length > 0) {
          for (const message of newMessages) {
            await this.saveMessage(message);
            newMessagesCount++;
          }
          
          // Update conversation messages in memory
          const existingMessages = this.messages.get(conversation.id) || [];
          this.messages.set(conversation.id, [...existingMessages, ...newMessages]);
        }

        // Update last sync time
        this.lastSyncTimes.set(`${accountId}_${conversation.id}`, new Date());
      }

      // Update conversations in memory
      this.conversations.set(accountId, freshConversations);

      if (newMessagesCount > 0) {
        console.log(`📨 Synced ${newMessagesCount} new messages for account ${accountId}`);
        
        // Emit new messages to dashboard
        this.io.emit('instagram:inbox:new_messages', {
          accountId,
          newMessagesCount,
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error(`❌ Error syncing messages for account ${accountId}:`, error);
    }
  }

  /**
   * Update or create a conversation in the database
   */
  private async updateConversation(accountId: string, conversation: any): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO instagram_conversations (
        id, account_id, account_username, participant_id, participant_username,
        participant_profile_pic, participant_full_name, last_message_id,
        unread_count, is_verified, follower_count, last_active_at,
        conversation_type, is_business_account, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    await this.dbManager.runQuery(query, [
      conversation.id,
      accountId,
      conversation.accountUsername,
      conversation.participantId,
      conversation.participantUsername,
      conversation.participantProfilePic,
      conversation.participantFullName,
      conversation.lastMessage?.id,
      conversation.unreadCount,
      conversation.isVerified ? 1 : 0,
      conversation.followerCount,
      conversation.lastActiveAt?.toISOString(),
      conversation.conversationType,
      conversation.isBusinessAccount ? 1 : 0
    ]);
  }

  /**
   * Save a message to the database
   */
  private async saveMessage(message: InstagramMessage): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO instagram_messages (
        id, conversation_id, account_id, sender_id, sender_username,
        sender_profile_pic, content, timestamp, is_read, message_type,
        attachments, is_from_me
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.dbManager.runQuery(query, [
      message.id,
      message.conversationId,
      message.accountId,
      message.senderId,
      message.senderUsername,
      message.senderProfilePic,
      message.content,
      message.timestamp.toISOString(),
      message.isRead ? 1 : 0,
      message.messageType,
      message.attachments ? JSON.stringify(message.attachments) : null,
      message.isFromMe ? 1 : 0
    ]);
  }

  /**
   * Get unified inbox with all conversations from all accounts
   */
  public async getUnifiedInbox(page: number = 1, limit: number = 50): Promise<{
    conversations: InstagramConversation[];
    totalCount: number;
    unreadCount: number;
    stats: UnifiedInboxStats;
  }> {
    try {
      const allConversations: InstagramConversation[] = [];
      
      // Combine conversations from all accounts
      for (const [accountId, conversations] of this.conversations) {
        allConversations.push(...conversations);
      }

      // Sort by last activity (most recent first)
      allConversations.sort((a, b) => 
        b.lastActiveAt.getTime() - a.lastActiveAt.getTime()
      );

      // Pagination
      const startIndex = (page - 1) * limit;
      const paginatedConversations = allConversations.slice(startIndex, startIndex + limit);

      // Calculate stats
      const stats = await this.calculateInboxStats();

      return {
        conversations: paginatedConversations,
        totalCount: allConversations.length,
        unreadCount: allConversations.filter(c => c.unreadCount > 0).length,
        stats
      };

    } catch (error) {
      console.error('❌ Error getting unified inbox:', error);
      throw error;
    }
  }

  /**
   * Get messages for a specific conversation
   */
  public async getConversationMessages(
    conversationId: string, 
    page: number = 1, 
    limit: number = 50
  ): Promise<{
    messages: InstagramMessage[];
    totalCount: number;
    conversation: InstagramConversation | null;
  }> {
    try {
      const messages = this.messages.get(conversationId) || [];
      
      // Find the conversation
      let conversation: InstagramConversation | null = null;
      for (const [accountId, conversations] of this.conversations) {
        const found = conversations.find(c => c.id === conversationId);
        if (found) {
          conversation = found;
          break;
        }
      }

      // Pagination (most recent first)
      const startIndex = (page - 1) * limit;
      const paginatedMessages = messages.slice(-startIndex - limit, -startIndex || undefined);

      return {
        messages: paginatedMessages,
        totalCount: messages.length,
        conversation
      };

    } catch (error) {
      console.error('❌ Error getting conversation messages:', error);
      throw error;
    }
  }

  /**
   * Send a reply to an Instagram conversation
   */
  public async sendReply(reply: MessageReply): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      console.log(`📤 Sending Instagram reply to conversation ${reply.conversationId}`);

      // Log the reply attempt
      await this.logReplyAttempt(reply);

      // Send via Instagram Bot
      const result = await this.instagramBot.sendDirectMessage(
        reply.accountId,
        reply.conversationId,
        reply.content,
        reply.attachment
      );

      if (result.success) {
        // Update reply status
        await this.updateReplyStatus(reply.conversationId, reply.content, 'sent', result.messageId);
        
        // Create message object for the sent reply
        const sentMessage: InstagramMessage = {
          id: result.messageId || `reply_${Date.now()}`,
          accountId: reply.accountId,
          accountUsername: '', // Will be filled
          conversationId: reply.conversationId,
          senderId: reply.accountId,
          senderUsername: '', // Will be filled
          senderProfilePic: '',
          content: reply.content,
          timestamp: new Date(),
          isRead: true,
          messageType: reply.replyType as any,
          isFromMe: true
        };

        // Add to messages
        const existingMessages = this.messages.get(reply.conversationId) || [];
        this.messages.set(reply.conversationId, [...existingMessages, sentMessage]);
        
        // Save to database
        await this.saveMessage(sentMessage);

        console.log(`✅ Instagram reply sent successfully: ${result.messageId}`);
        
        // Emit reply sent event
        this.io.emit('instagram:inbox:reply_sent', {
          conversationId: reply.conversationId,
          messageId: result.messageId,
          content: reply.content,
          timestamp: new Date()
        });

        return { success: true, messageId: result.messageId };
      } else {
        await this.updateReplyStatus(reply.conversationId, reply.content, 'failed', undefined, result.error);
        console.error(`❌ Failed to send Instagram reply:`, result.error);
        return { success: false, error: result.error };
      }

    } catch (error) {
      console.error('❌ Error sending Instagram reply:', error);
      await this.updateReplyStatus(reply.conversationId, reply.content, 'failed', undefined, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log reply attempt to database
   */
  private async logReplyAttempt(reply: MessageReply): Promise<void> {
    const query = `
      INSERT INTO instagram_message_replies (
        original_message_id, conversation_id, account_id, reply_content,
        reply_type, attachment_data, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `;

    await this.dbManager.runQuery(query, [
      '', // We don't have original message ID in this context
      reply.conversationId,
      reply.accountId,
      reply.content,
      reply.replyType,
      reply.attachment ? JSON.stringify(reply.attachment) : null
    ]);
  }

  /**
   * Update reply status in database
   */
  private async updateReplyStatus(
    conversationId: string, 
    content: string, 
    status: string, 
    messageId?: string, 
    error?: string
  ): Promise<void> {
    const query = `
      UPDATE instagram_message_replies 
      SET status = ?, sent_at = ?, error_message = ?
      WHERE conversation_id = ? AND reply_content = ? AND status = 'pending'
    `;

    await this.dbManager.runQuery(query, [
      status,
      status === 'sent' ? new Date().toISOString() : null,
      error || null,
      conversationId,
      content
    ]);
  }

  /**
   * Mark conversation as read
   */
  public async markConversationAsRead(conversationId: string): Promise<void> {
    try {
      // Update messages as read
      const updateQuery = `
        UPDATE instagram_messages 
        SET is_read = 1 
        WHERE conversation_id = ? AND is_from_me = 0
      `;
      await this.dbManager.runQuery(updateQuery, [conversationId]);

      // Update conversation unread count
      const updateConversationQuery = `
        UPDATE instagram_conversations 
        SET unread_count = 0 
        WHERE id = ?
      `;
      await this.dbManager.runQuery(updateConversationQuery, [conversationId]);

      // Update in memory
      const messages = this.messages.get(conversationId) || [];
      messages.forEach(msg => {
        if (!msg.isFromMe) msg.isRead = true;
      });

      // Find and update conversation in memory
      for (const [accountId, conversations] of this.conversations) {
        const conversation = conversations.find(c => c.id === conversationId);
        if (conversation) {
          conversation.unreadCount = 0;
          break;
        }
      }

      console.log(`✅ Marked conversation ${conversationId} as read`);

    } catch (error) {
      console.error('❌ Error marking conversation as read:', error);
      throw error;
    }
  }

  /**
   * Calculate unified inbox statistics
   */
  private async calculateInboxStats(): Promise<UnifiedInboxStats> {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_messages,
          COUNT(CASE WHEN is_read = 0 AND is_from_me = 0 THEN 1 END) as unread_messages,
          COUNT(CASE WHEN DATE(timestamp) = DATE('now') THEN 1 END) as todays_messages,
          COUNT(CASE WHEN DATE(timestamp) = DATE('now') AND is_from_me = 1 THEN 1 END) as todays_replies
        FROM instagram_messages
      `;

      const conversationsQuery = `
        SELECT 
          COUNT(*) as total_conversations,
          COUNT(CASE WHEN unread_count > 0 THEN 1 END) as unread_conversations,
          COUNT(DISTINCT account_id) as active_accounts
        FROM instagram_conversations
      `;

      const [statsResult] = await this.dbManager.runQuery(statsQuery);
      const [conversationsResult] = await this.dbManager.runQuery(conversationsQuery);

      const responseRate = statsResult.todays_messages > 0 
        ? (statsResult.todays_replies / statsResult.todays_messages) * 100 
        : 0;

      return {
        totalMessages: statsResult.total_messages,
        unreadMessages: statsResult.unread_messages,
        totalConversations: conversationsResult.total_conversations,
        unreadConversations: conversationsResult.unread_conversations,
        activeAccounts: conversationsResult.active_accounts,
        responseRate: Math.round(responseRate),
        averageResponseTime: 15, // This would need more complex calculation
        todaysMessages: statsResult.todays_messages,
        todaysReplies: statsResult.todays_replies
      };

    } catch (error) {
      console.error('❌ Error calculating inbox stats:', error);
      return {
        totalMessages: 0,
        unreadMessages: 0,
        totalConversations: 0,
        unreadConversations: 0,
        activeAccounts: 0,
        responseRate: 0,
        averageResponseTime: 0,
        todaysMessages: 0,
        todaysReplies: 0
      };
    }
  }

  /**
   * Search conversations and messages
   */
  public async searchInbox(query: string, accountId?: string): Promise<{
    conversations: InstagramConversation[];
    messages: InstagramMessage[];
  }> {
    try {
      const searchConversationsQuery = `
        SELECT * FROM instagram_conversations 
        WHERE (participant_username LIKE ? OR participant_full_name LIKE ?)
        ${accountId ? 'AND account_id = ?' : ''}
        ORDER BY updated_at DESC
        LIMIT 20
      `;

      const searchMessagesQuery = `
        SELECT * FROM instagram_messages 
        WHERE content LIKE ?
        ${accountId ? 'AND account_id = ?' : ''}
        ORDER BY timestamp DESC
        LIMIT 50
      `;

      const searchTerm = `%${query}%`;
      const conversationParams = [searchTerm, searchTerm];
      const messageParams = [searchTerm];

      if (accountId) {
        conversationParams.push(accountId);
        messageParams.push(accountId);
      }

      const [conversationRows, messageRows] = await Promise.all([
        this.dbManager.runQuery(searchConversationsQuery, conversationParams),
        this.dbManager.runQuery(searchMessagesQuery, messageParams)
      ]);

      // Convert to proper objects
      const conversations: InstagramConversation[] = conversationRows.map(row => ({
        id: row.id,
        accountId: row.account_id,
        accountUsername: row.account_username,
        participantId: row.participant_id,
        participantUsername: row.participant_username,
        participantProfilePic: row.participant_profile_pic,
        participantFullName: row.participant_full_name,
        lastMessage: {} as InstagramMessage, // Would need to populate
        unreadCount: row.unread_count,
        isVerified: Boolean(row.is_verified),
        followerCount: row.follower_count,
        lastActiveAt: new Date(row.last_active_at),
        conversationType: row.conversation_type,
        isBusinessAccount: Boolean(row.is_business_account)
      }));

      const messages: InstagramMessage[] = messageRows.map(row => ({
        id: row.id,
        accountId: row.account_id,
        accountUsername: '',
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        senderUsername: row.sender_username,
        senderProfilePic: row.sender_profile_pic,
        content: row.content,
        timestamp: new Date(row.timestamp),
        isRead: Boolean(row.is_read),
        messageType: row.message_type,
        attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
        isFromMe: Boolean(row.is_from_me)
      }));

      return { conversations, messages };

    } catch (error) {
      console.error('❌ Error searching inbox:', error);
      return { conversations: [], messages: [] };
    }
  }

  /**
   * Get inbox activity for dashboard
   */
  public async getInboxActivity(hours: number = 24): Promise<Array<{
    hour: number;
    messagesReceived: number;
    messagesSent: number;
    newConversations: number;
  }>> {
    try {
      const query = `
        SELECT 
          strftime('%H', timestamp) as hour,
          COUNT(CASE WHEN is_from_me = 0 THEN 1 END) as messages_received,
          COUNT(CASE WHEN is_from_me = 1 THEN 1 END) as messages_sent
        FROM instagram_messages 
        WHERE timestamp >= datetime('now', '-${hours} hours')
        GROUP BY strftime('%H', timestamp)
        ORDER BY hour
      `;

      const rows = await this.dbManager.runQuery(query);
      
      // Fill in missing hours with zero values
      const activity = [];
      for (let i = 0; i < 24; i++) {
        const found = rows.find(row => parseInt(row.hour) === i);
        activity.push({
          hour: i,
          messagesReceived: found ? found.messages_received : 0,
          messagesSent: found ? found.messages_sent : 0,
          newConversations: 0 // Would need separate query
        });
      }

      return activity;

    } catch (error) {
      console.error('❌ Error getting inbox activity:', error);
      return [];
    }
  }

  /**
   * Stop the messaging service
   */
  public async stop(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    this.conversations.clear();
    this.messages.clear();
    this.lastSyncTimes.clear();
    this.isInitialized = false;
    
    console.log('🛑 Instagram messaging service stopped');
  }

  /**
   * Get service status
   */
  public getStatus(): {
    isInitialized: boolean;
    totalConversations: number;
    totalMessages: number;
    syncedAccounts: number;
    lastSyncTime?: Date;
  } {
    let totalConversations = 0;
    let totalMessages = 0;

    for (const conversations of this.conversations.values()) {
      totalConversations += conversations.length;
    }

    for (const messages of this.messages.values()) {
      totalMessages += messages.length;
    }

    return {
      isInitialized: this.isInitialized,
      totalConversations,
      totalMessages,
      syncedAccounts: this.conversations.size,
      lastSyncTime: this.lastSyncTimes.size > 0 
        ? new Date(Math.max(...Array.from(this.lastSyncTimes.values()).map(d => d.getTime())))
        : undefined
    };
  }
}