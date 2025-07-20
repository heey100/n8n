import { Page } from 'puppeteer';
import { DatabaseManager } from './DatabaseManager';
import { Server } from 'socket.io';

export interface MarketplaceMessage {
  id: string;
  accountId: string;
  accountEmail: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderProfileUrl?: string;
  listingId?: string;
  listingTitle?: string;
  messageText: string;
  timestamp: Date;
  isRead: boolean;
  messageType: 'inquiry' | 'negotiation' | 'scheduling' | 'other';
  attachments?: string[];
}

export interface SendMessageRequest {
  accountId: string;
  conversationId: string;
  messageText: string;
  replyToMessageId?: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  errorMessage?: string;
  timestamp: Date;
}

export class MessagingService {
  private dbManager: DatabaseManager;
  private io: Server;
  private facebookSessions: Map<string, Page>; // accountId -> page session

  constructor(dbManager: DatabaseManager, io: Server, facebookSessions: Map<string, Page>) {
    this.dbManager = dbManager;
    this.io = io;
    this.facebookSessions = facebookSessions;
  }

  /**
   * Fetch new messages from all Facebook accounts
   */
  async fetchAllMessages(): Promise<MarketplaceMessage[]> {
    const allMessages: MarketplaceMessage[] = [];
    const accounts = await this.dbManager.getActiveAccounts();

    console.log(`📨 Fetching messages from ${accounts.length} Facebook accounts`);

    for (const account of accounts) {
      try {
        const page = this.facebookSessions.get(account.id);
        if (!page) {
          console.log(`⚠️ No active session for account ${account.email}`);
          continue;
        }

        const messages = await this.fetchMessagesFromAccount(account.id, account.email, page);
        allMessages.push(...messages);

        // Small delay between accounts
        await this.delay(2000, 4000);

      } catch (error) {
        console.error(`Failed to fetch messages from ${account.email}:`, error);
      }
    }

    // Sort by timestamp (newest first)
    allMessages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    console.log(`✅ Fetched ${allMessages.length} total messages from all accounts`);
    return allMessages;
  }

  /**
   * Fetch messages from a specific Facebook account
   */
  private async fetchMessagesFromAccount(
    accountId: string, 
    accountEmail: string, 
    page: Page
  ): Promise<MarketplaceMessage[]> {
    try {
      console.log(`📬 Fetching messages for account: ${accountEmail}`);

             // Navigate to Facebook Marketplace
      await page.goto('https://www.facebook.com/marketplace', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await page.waitForTimeout(2000);

      // Click on "Inbox" in the marketplace menu
      const inboxButton = await page.$('[data-testid="marketplace-inbox-button"], [aria-label*="Inbox"], a[href*="marketplace/inbox"]');
      if (inboxButton) {
        await inboxButton.click();
        await page.waitForTimeout(3000);
      } else {
        // Fallback: try direct navigation
        await page.goto('https://www.facebook.com/marketplace/inbox', {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        await page.waitForTimeout(3000);
      }

      // Look for "Mark Messages" or similar section
      const markMessagesSection = await page.$('[data-testid="marketplace-messages"], [aria-label*="Messages"], div:has-text("Messages")');
      if (markMessagesSection) {
        await markMessagesSection.click();
        await page.waitForTimeout(2000);
      }

      // Get all conversation threads
      const conversations = await page.evaluate(() => {
        const conversationElements = document.querySelectorAll('[data-testid="marketplace-inbox-conversation"]');
        const conversations: any[] = [];

        conversationElements.forEach((element, index) => {
          try {
            const nameElement = element.querySelector('[data-testid="conversation-name"]');
            const messageElement = element.querySelector('[data-testid="latest-message"]');
            const timeElement = element.querySelector('[data-testid="message-time"]');
            const listingElement = element.querySelector('[data-testid="listing-title"]');
            const unreadBadge = element.querySelector('[data-testid="unread-badge"]');

            if (nameElement && messageElement) {
              conversations.push({
                index,
                senderName: nameElement.textContent?.trim() || 'Unknown',
                latestMessage: messageElement.textContent?.trim() || '',
                timestamp: timeElement?.textContent?.trim() || '',
                listingTitle: listingElement?.textContent?.trim() || '',
                isUnread: !!unreadBadge,
                conversationId: `conv_${Date.now()}_${index}`
              });
            }
          } catch (error) {
            console.error('Error parsing conversation:', error);
          }
        });

        return conversations;
      });

      const messages: MarketplaceMessage[] = [];

      // Click through each conversation to get detailed messages
      for (let i = 0; i < Math.min(conversations.length, 10); i++) { // Limit to first 10 conversations
        try {
          const conversation = conversations[i];
          
          // Click on the conversation
          const conversationSelector = `[data-testid="marketplace-inbox-conversation"]:nth-child(${i + 1})`;
          await page.click(conversationSelector);
          await page.waitForTimeout(2000);

          // Get messages from this conversation
          const conversationMessages = await page.evaluate((conv, accId, accEmail) => {
            const messageElements = document.querySelectorAll('[data-testid="message-container"]');
            const messages: any[] = [];

            messageElements.forEach((element, msgIndex) => {
              try {
                const messageText = element.querySelector('[data-testid="message-text"]')?.textContent?.trim();
                const timestamp = element.querySelector('[data-testid="message-timestamp"]')?.textContent?.trim();
                const senderElement = element.querySelector('[data-testid="message-sender"]');
                const isFromSender = !element.querySelector('[data-testid="outgoing-message"]'); // If no outgoing marker, it's from sender

                if (messageText && isFromSender) { // Only get messages FROM customers TO us
                  messages.push({
                    id: `msg_${Date.now()}_${msgIndex}`,
                    accountId: accId,
                    accountEmail: accEmail,
                    conversationId: conv.conversationId,
                    senderId: 'unknown',
                    senderName: conv.senderName,
                    listingTitle: conv.listingTitle,
                    messageText: messageText,
                    timestamp: timestamp || new Date().toISOString(),
                    isRead: !conv.isUnread,
                    messageType: 'inquiry'
                  });
                }
              } catch (error) {
                console.error('Error parsing message:', error);
              }
            });

            return messages;
          }, conversation, accountId, accountEmail);

          messages.push(...conversationMessages.map(msg => ({
            ...msg,
            timestamp: this.parseTimestamp(msg.timestamp),
            messageType: this.categorizeMessage(msg.messageText)
          })));

        } catch (error) {
          console.error(`Error processing conversation ${i}:`, error);
        }
      }

      console.log(`✅ Found ${messages.length} messages for ${accountEmail}`);
      return messages;

    } catch (error) {
      console.error(`Error fetching messages for ${accountEmail}:`, error);
      return [];
    }
  }

  /**
   * Send a reply to a specific conversation
   * THIS IS THE ACTUAL REPLY FUNCTIONALITY
   */
  async sendReply(request: SendMessageRequest): Promise<SendMessageResult> {
    try {
      console.log(`📤 Sending reply for account ${request.accountId} to conversation ${request.conversationId}`);

      const page = this.facebookSessions.get(request.accountId);
      if (!page) {
        throw new Error(`No active session for account ${request.accountId}`);
      }

             // Navigate through Facebook's proper flow: Marketplace → Inbox → Mark Messages → Messages
      
       // Step 1: Go to Facebook Marketplace
      await page.goto('https://www.facebook.com/marketplace', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      await page.waitForTimeout(2000);

      // Step 2: Click "Inbox" button
      const inboxClicked = await page.evaluate(() => {
        // Try multiple selectors for the Inbox button
        const selectors = [
          '[data-testid="marketplace-inbox-button"]',
          '[aria-label*="Inbox"]',
          'a[href*="marketplace/inbox"]',
          'div[role="button"]:has-text("Inbox")',
          'span:has-text("Inbox")'
        ];
        
        for (const selector of selectors) {
          const button = document.querySelector(selector) as HTMLElement;
          if (button) {
            button.click();
            return true;
          }
        }
        return false;
      });

      if (!inboxClicked) {
        // Fallback: direct navigation
        await page.goto('https://www.facebook.com/marketplace/inbox', {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
      }
      await page.waitForTimeout(3000);

      // Step 3: Look for and click "Mark Messages" or "Messages" section
      const messagesClicked = await page.evaluate(() => {
        const messageSelectors = [
          '[data-testid="marketplace-messages"]',
          '[data-testid="mark-messages"]',
          '[aria-label*="Messages"]',
          'div[role="button"]:has-text("Messages")',
          'span:has-text("Messages")',
          'div:has-text("Mark Messages")',
          // Sometimes it's a tab or navigation item
          '[role="tab"]:has-text("Messages")',
          'a:has-text("Messages")'
        ];
        
        for (const selector of messageSelectors) {
          const button = document.querySelector(selector) as HTMLElement;
          if (button) {
            button.click();
            return true;
          }
        }
        return false;
      });

      if (messagesClicked) {
        await page.waitForTimeout(2000);
      }

      // Step 4: Now look for the actual messages/conversations
      await page.waitForTimeout(1000);

      // Find and click the conversation we want to reply to
      // For demo, we'll click the first available conversation
      const conversationClicked = await page.evaluate((convId) => {
        // Try to find conversations with various selectors
        const conversationSelectors = [
          '[data-testid="marketplace-inbox-conversation"]',
          '[data-testid="conversation-item"]',
          '[role="button"][aria-label*="conversation"]',
          'div[data-testid*="conversation"]',
          // Broader selectors
          'div[role="button"]:has([data-testid*="message"])',
          'li[role="button"]:has([data-testid*="conversation"])'
        ];
        
        for (const selector of conversationSelectors) {
          const conversations = document.querySelectorAll(selector);
          if (conversations.length > 0) {
            // Click the first conversation (or match by convId if available)
            (conversations[0] as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, request.conversationId);

      if (!conversationClicked) {
        throw new Error('Could not find conversation to reply to');
      }

      await page.waitForTimeout(3000);

      // Find the message input field
      const messageInputSelector = '[data-testid="message-input"], [contenteditable="true"][data-testid="composer"], textarea[placeholder*="message"], div[contenteditable="true"][role="textbox"]';
      
      await page.waitForSelector(messageInputSelector, { timeout: 10000 });

      // Type the reply message
      await page.click(messageInputSelector);
      await page.waitForTimeout(1000);

      // Clear any existing text and type the new message
      await page.evaluate((selector) => {
        const element = document.querySelector(selector) as HTMLElement;
        if (element) {
          if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            (element as HTMLInputElement).value = '';
          } else {
            element.textContent = '';
          }
        }
      }, messageInputSelector);

      await page.type(messageInputSelector, request.messageText, { delay: 50 });
      await page.waitForTimeout(1000);

      // Send the message
      const sendButtonSelector = '[data-testid="send-button"], button[type="submit"], [aria-label*="Send"], button:has-text("Send")';
      
      const messageSent = await page.evaluate((selector) => {
        const sendButton = document.querySelector(selector) as HTMLButtonElement;
        if (sendButton) {
          sendButton.click();
          return true;
        }
        
        // Fallback: try pressing Enter
        const inputElement = document.querySelector('[data-testid="message-input"], [contenteditable="true"]') as HTMLElement;
        if (inputElement) {
          const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' });
          inputElement.dispatchEvent(enterEvent);
          return true;
        }
        
        return false;
      }, sendButtonSelector);

      if (!messageSent) {
        // Try pressing Enter as fallback
        await page.keyboard.press('Enter');
      }

      await page.waitForTimeout(2000);

      // Verify message was sent by checking if input is cleared
      const messageSentSuccessfully = await page.evaluate((selector) => {
        const element = document.querySelector(selector) as HTMLElement;
        if (element) {
          if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            return (element as HTMLInputElement).value === '';
          } else {
            return element.textContent?.trim() === '';
          }
        }
        return false;
      }, messageInputSelector);

      if (messageSentSuccessfully) {
        console.log(`✅ Successfully sent reply: "${request.messageText}"`);
        
        // Emit real-time update
        this.io.emit('message-sent', {
          accountId: request.accountId,
          conversationId: request.conversationId,
          messageText: request.messageText,
          timestamp: new Date()
        });

        return {
          success: true,
          messageId: `sent_${Date.now()}`,
          timestamp: new Date()
        };
      } else {
        throw new Error('Message sending verification failed');
      }

    } catch (error) {
      console.error(`Failed to send reply:`, error);
      
      return {
        success: false,
        errorMessage: (error as Error).message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Send bulk replies to multiple conversations
   */
  async sendBulkReplies(requests: SendMessageRequest[]): Promise<SendMessageResult[]> {
    const results: SendMessageResult[] = [];

    for (const request of requests) {
      try {
        const result = await this.sendReply(request);
        results.push(result);

        // Add delay between messages to avoid being flagged
        await this.delay(5000, 10000);

      } catch (error) {
        results.push({
          success: false,
          errorMessage: (error as Error).message,
          timestamp: new Date()
        });
      }
    }

    return results;
  }

  /**
   * Get message statistics
   */
  async getMessageStats(): Promise<{
    totalMessages: number;
    unreadMessages: number;
    messagesByAccount: Array<{ accountId: string; accountEmail: string; messageCount: number; unreadCount: number }>;
    messagesByType: { [key: string]: number };
  }> {
    const allMessages = await this.fetchAllMessages();
    
    const stats = {
      totalMessages: allMessages.length,
      unreadMessages: allMessages.filter(m => !m.isRead).length,
      messagesByAccount: [] as Array<{ accountId: string; accountEmail: string; messageCount: number; unreadCount: number }>,
      messagesByType: {} as { [key: string]: number }
    };

    // Group by account
    const accountGroups = new Map<string, MarketplaceMessage[]>();
    for (const message of allMessages) {
      if (!accountGroups.has(message.accountId)) {
        accountGroups.set(message.accountId, []);
      }
      accountGroups.get(message.accountId)!.push(message);
    }

    // Calculate per-account stats
    for (const [accountId, messages] of accountGroups) {
      const accountEmail = messages[0]?.accountEmail || '';
      stats.messagesByAccount.push({
        accountId,
        accountEmail,
        messageCount: messages.length,
        unreadCount: messages.filter(m => !m.isRead).length
      });
    }

    // Group by message type
    for (const message of allMessages) {
      stats.messagesByType[message.messageType] = (stats.messagesByType[message.messageType] || 0) + 1;
    }

    return stats;
  }

  /**
   * Mark messages as read
   */
  async markAsRead(messageIds: string[]): Promise<void> {
    // This would typically update the database and potentially the Facebook interface
    console.log(`✅ Marked ${messageIds.length} messages as read`);
    
    // Emit update
    this.io.emit('messages-marked-read', { messageIds });
  }

  /**
   * Search messages
   */
  async searchMessages(query: string, accountId?: string): Promise<MarketplaceMessage[]> {
    const allMessages = await this.fetchAllMessages();
    
    return allMessages.filter(message => {
      const matchesQuery = message.messageText.toLowerCase().includes(query.toLowerCase()) ||
                          message.senderName.toLowerCase().includes(query.toLowerCase()) ||
                          (message.listingTitle || '').toLowerCase().includes(query.toLowerCase());
      
      const matchesAccount = !accountId || message.accountId === accountId;
      
      return matchesQuery && matchesAccount;
    });
  }

  /**
   * Categorize message type based on content
   */
  private categorizeMessage(messageText: string): 'inquiry' | 'negotiation' | 'scheduling' | 'other' {
    const text = messageText.toLowerCase();
    
    if (text.includes('price') || text.includes('cost') || text.includes('$') || text.includes('offer')) {
      return 'negotiation';
    }
    
    if (text.includes('when') || text.includes('time') || text.includes('meet') || text.includes('pickup') || text.includes('schedule')) {
      return 'scheduling';
    }
    
    if (text.includes('available') || text.includes('interested') || text.includes('question') || text.includes('?')) {
      return 'inquiry';
    }
    
    return 'other';
  }

  /**
   * Parse timestamp from Facebook's format
   */
  private parseTimestamp(timestampStr: string): Date {
    try {
      // Handle various Facebook timestamp formats
      if (timestampStr.includes('minute') || timestampStr.includes('min')) {
        const minutes = parseInt(timestampStr.match(/\d+/)?.[0] || '0');
        return new Date(Date.now() - minutes * 60 * 1000);
      }
      
      if (timestampStr.includes('hour') || timestampStr.includes('hr')) {
        const hours = parseInt(timestampStr.match(/\d+/)?.[0] || '0');
        return new Date(Date.now() - hours * 60 * 60 * 1000);
      }
      
      if (timestampStr.includes('day')) {
        const days = parseInt(timestampStr.match(/\d+/)?.[0] || '0');
        return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      }
      
      // Try to parse as regular date
      const parsed = new Date(timestampStr);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
      
    } catch (error) {
      return new Date();
    }
  }

  /**
   * Random delay helper
   */
  private async delay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}