import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';

export interface InstagramAccount {
  id: string;
  username: string;
  sessionData: string;
  proxyId?: string;
  isActive: boolean;
  lastSync: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  accountId: string;
  threadId: string;
  senderId: string;
  recipientId: string;
  content: string;
  messageType: 'text' | 'media' | 'story' | 'reel';
  timestamp: Date;
  isRead: boolean;
  direction: 'incoming' | 'outgoing';
}

export interface Proxy {
  id: string;
  name: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  type: 'http' | 'https' | 'socks4' | 'socks5';
  isActive: boolean;
  lastUsed?: Date;
  createdAt: Date;
}

export class DatabaseManager {
  private db: sqlite3.Database;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'instagram-inbox.db');
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log('📊 Connected to SQLite database');
        this.createTables().then(resolve).catch(reject);
      });
    });
  }

  private async createTables(): Promise<void> {
    const queries = [
      `CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        sessionData TEXT NOT NULL,
        proxyId TEXT,
        isActive INTEGER DEFAULT 1,
        lastSync DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proxyId) REFERENCES proxies (id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        threadId TEXT NOT NULL,
        senderId TEXT NOT NULL,
        recipientId TEXT NOT NULL,
        content TEXT NOT NULL,
        messageType TEXT DEFAULT 'text',
        timestamp DATETIME NOT NULL,
        isRead INTEGER DEFAULT 0,
        direction TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (accountId) REFERENCES accounts (id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS proxies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        username TEXT,
        password TEXT,
        type TEXT DEFAULT 'http',
        isActive INTEGER DEFAULT 1,
        lastUsed DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const query of queries) {
      await this.runQuery(query);
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_messages_account_thread ON messages(accountId, threadId)',
      'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_accounts_username ON accounts(username)',
      'CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(isActive)'
    ];

    for (const index of indexes) {
      await this.runQuery(index);
    }
  }

  private runQuery(query: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  private getQuery(query: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    });
  }

  private allQuery(query: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  }

  // Account methods
  async createAccount(account: Omit<InstagramAccount, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await this.runQuery(
      'INSERT INTO accounts (id, username, sessionData, proxyId, isActive, lastSync) VALUES (?, ?, ?, ?, ?, ?)',
      [id, account.username, account.sessionData, account.proxyId, account.isActive ? 1 : 0, account.lastSync]
    );
    return id;
  }

  async getAccount(id: string): Promise<InstagramAccount | null> {
    const row = await this.getQuery('SELECT * FROM accounts WHERE id = ?', [id]);
    return row ? this.mapAccount(row) : null;
  }

  async getAllAccounts(): Promise<InstagramAccount[]> {
    const rows = await this.allQuery('SELECT * FROM accounts ORDER BY createdAt DESC');
    return rows.map(this.mapAccount);
  }

  async updateAccount(id: string, updates: Partial<InstagramAccount>): Promise<void> {
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    await this.runQuery(
      `UPDATE accounts SET ${setClause}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id]
    );
  }

  async deleteAccount(id: string): Promise<void> {
    await this.runQuery('DELETE FROM accounts WHERE id = ?', [id]);
  }

  // Message methods
  async createMessage(message: Omit<Message, 'id'>): Promise<string> {
    const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await this.runQuery(
      `INSERT INTO messages (id, accountId, threadId, senderId, recipientId, content, messageType, timestamp, isRead, direction) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, message.accountId, message.threadId, message.senderId, message.recipientId, 
       message.content, message.messageType, message.timestamp, message.isRead ? 1 : 0, message.direction]
    );
    return id;
  }

  async getMessages(accountId: string, threadId?: string, limit: number = 50): Promise<Message[]> {
    let query = 'SELECT * FROM messages WHERE accountId = ?';
    const params = [accountId];
    
    if (threadId) {
      query += ' AND threadId = ?';
      params.push(threadId);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    
    const rows = await this.allQuery(query, params);
    return rows.map(this.mapMessage);
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    await this.runQuery('UPDATE messages SET isRead = 1 WHERE id = ?', [messageId]);
  }

  // Proxy methods
  async createProxy(proxy: Omit<Proxy, 'id' | 'createdAt'>): Promise<string> {
    const id = `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await this.runQuery(
      'INSERT INTO proxies (id, name, host, port, username, password, type, isActive, lastUsed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, proxy.name, proxy.host, proxy.port, proxy.username, proxy.password, proxy.type, proxy.isActive ? 1 : 0, proxy.lastUsed]
    );
    return id;
  }

  async getAllProxies(): Promise<Proxy[]> {
    const rows = await this.allQuery('SELECT * FROM proxies ORDER BY createdAt DESC');
    return rows.map(this.mapProxy);
  }

  async getProxy(id: string): Promise<Proxy | null> {
    const row = await this.getQuery('SELECT * FROM proxies WHERE id = ?', [id]);
    return row ? this.mapProxy(row) : null;
  }

  async updateProxy(id: string, updates: Partial<Proxy>): Promise<void> {
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    await this.runQuery(`UPDATE proxies SET ${setClause} WHERE id = ?`, [...values, id]);
  }

  async deleteProxy(id: string): Promise<void> {
    await this.runQuery('DELETE FROM proxies WHERE id = ?', [id]);
  }

  // User methods
  async createUser(username: string, hashedPassword: string): Promise<string> {
    const id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await this.runQuery('INSERT INTO users (id, username, password) VALUES (?, ?, ?)', [id, username, hashedPassword]);
    return id;
  }

  async getUserByUsername(username: string): Promise<any> {
    return await this.getQuery('SELECT * FROM users WHERE username = ?', [username]);
  }

  private mapAccount(row: any): InstagramAccount {
    return {
      id: row.id,
      username: row.username,
      sessionData: row.sessionData,
      proxyId: row.proxyId,
      isActive: Boolean(row.isActive),
      lastSync: new Date(row.lastSync),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }

  private mapMessage(row: any): Message {
    return {
      id: row.id,
      accountId: row.accountId,
      threadId: row.threadId,
      senderId: row.senderId,
      recipientId: row.recipientId,
      content: row.content,
      messageType: row.messageType,
      timestamp: new Date(row.timestamp),
      isRead: Boolean(row.isRead),
      direction: row.direction
    };
  }

  private mapProxy(row: any): Proxy {
    return {
      id: row.id,
      name: row.name,
      host: row.host,
      port: row.port,
      username: row.username,
      password: row.password,
      type: row.type,
      isActive: Boolean(row.isActive),
      lastUsed: row.lastUsed ? new Date(row.lastUsed) : undefined,
      createdAt: new Date(row.createdAt)
    };
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close(() => {
        console.log('📊 Database connection closed');
        resolve();
      });
    });
  }
}