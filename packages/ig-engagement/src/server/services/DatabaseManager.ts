import sqlite3 from 'sqlite3';
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

export interface Competitor {
  id: string;
  username: string;
  displayName: string;
  isMonitoring: boolean;
  lastCheck: Date;
  followerCount: number;
  followingCount: number;
  postCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Target {
  id: string;
  username: string;
  competitorId: string;
  accountId: string;
  isFollowed: boolean;
  isLiked: boolean;
  isCommented: boolean;
  isCloseFriend: boolean;
  followedAt?: Date;
  unfollowAt?: Date;
  engagedAt?: Date;
  status: 'discovered' | 'engaged' | 'following' | 'unfollowed';
  createdAt: Date;
  updatedAt: Date;
}

export interface Campaign {
  id: string;
  name: string;
  accountId: string;
  competitorId: string;
  isActive: boolean;
  settings: string; // JSON settings
  stats: string; // JSON stats
  createdAt: Date;
  updatedAt: Date;
}

export interface EngagementAction {
  id: string;
  accountId: string;
  targetUsername: string;
  action: 'follow' | 'unfollow' | 'like' | 'comment' | 'story_view' | 'story_comment' | 'close_friend_add';
  success: boolean;
  errorMessage?: string;
  timestamp: Date;
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
  private db!: sqlite3.Database;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'ig-engagement.db');
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log('📊 Connected to engagement bot database');
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
      
      `CREATE TABLE IF NOT EXISTS competitors (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        displayName TEXT,
        isMonitoring INTEGER DEFAULT 0,
        lastCheck DATETIME,
        followerCount INTEGER DEFAULT 0,
        followingCount INTEGER DEFAULT 0,
        postCount INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS targets (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        competitorId TEXT NOT NULL,
        accountId TEXT NOT NULL,
        isFollowed INTEGER DEFAULT 0,
        isLiked INTEGER DEFAULT 0,
        isCommented INTEGER DEFAULT 0,
        isCloseFriend INTEGER DEFAULT 0,
        followedAt DATETIME,
        unfollowAt DATETIME,
        engagedAt DATETIME,
        status TEXT DEFAULT 'discovered',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (competitorId) REFERENCES competitors (id),
        FOREIGN KEY (accountId) REFERENCES accounts (id),
        UNIQUE(username, competitorId, accountId)
      )`,
      
      `CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        accountId TEXT NOT NULL,
        competitorId TEXT NOT NULL,
        isActive INTEGER DEFAULT 0,
        settings TEXT DEFAULT '{}',
        stats TEXT DEFAULT '{}',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (accountId) REFERENCES accounts (id),
        FOREIGN KEY (competitorId) REFERENCES competitors (id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS engagement_actions (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        targetUsername TEXT NOT NULL,
        action TEXT NOT NULL,
        success INTEGER NOT NULL,
        errorMessage TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
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

    // Create indexes for performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_targets_competitor ON targets(competitorId)',
      'CREATE INDEX IF NOT EXISTS idx_targets_account ON targets(accountId)',
      'CREATE INDEX IF NOT EXISTS idx_targets_status ON targets(status)',
      'CREATE INDEX IF NOT EXISTS idx_targets_unfollowat ON targets(unfollowAt)',
      'CREATE INDEX IF NOT EXISTS idx_actions_account ON engagement_actions(accountId)',
      'CREATE INDEX IF NOT EXISTS idx_actions_timestamp ON engagement_actions(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(isActive)'
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

  async getAllAccounts(): Promise<InstagramAccount[]> {
    const rows = await this.allQuery('SELECT * FROM accounts ORDER BY createdAt DESC');
    return rows.map(this.mapAccount);
  }

  async getAccount(id: string): Promise<InstagramAccount | null> {
    const row = await this.getQuery('SELECT * FROM accounts WHERE id = ?', [id]);
    return row ? this.mapAccount(row) : null;
  }

  async updateAccount(id: string, updates: Partial<InstagramAccount>): Promise<void> {
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    await this.runQuery(
      `UPDATE accounts SET ${setClause}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id]
    );
  }

  // Competitor methods
  async createCompetitor(competitor: Omit<Competitor, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await this.runQuery(
      'INSERT INTO competitors (id, username, displayName, isMonitoring, lastCheck, followerCount, followingCount, postCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, competitor.username, competitor.displayName, competitor.isMonitoring ? 1 : 0, competitor.lastCheck, competitor.followerCount, competitor.followingCount, competitor.postCount]
    );
    return id;
  }

  async getAllCompetitors(): Promise<Competitor[]> {
    const rows = await this.allQuery('SELECT * FROM competitors ORDER BY createdAt DESC');
    return rows.map(this.mapCompetitor);
  }

  async getCompetitor(id: string): Promise<Competitor | null> {
    const row = await this.getQuery('SELECT * FROM competitors WHERE id = ?', [id]);
    return row ? this.mapCompetitor(row) : null;
  }

  async updateCompetitor(id: string, updates: Partial<Competitor>): Promise<void> {
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    await this.runQuery(
      `UPDATE competitors SET ${setClause}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id]
    );
  }

  // Target methods
  async createTarget(target: Omit<Target, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = `tgt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await this.runQuery(
      'INSERT INTO targets (id, username, competitorId, accountId, isFollowed, isLiked, isCommented, isCloseFriend, followedAt, unfollowAt, engagedAt, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, target.username, target.competitorId, target.accountId, target.isFollowed ? 1 : 0, target.isLiked ? 1 : 0, target.isCommented ? 1 : 0, target.isCloseFriend ? 1 : 0, target.followedAt, target.unfollowAt, target.engagedAt, target.status]
    );
    return id;
  }

  async getTargetsForUnfollow(): Promise<Target[]> {
    const rows = await this.allQuery(
      'SELECT * FROM targets WHERE unfollowAt <= ? AND isFollowed = 1',
      [new Date()]
    );
    return rows.map(this.mapTarget);
  }

  async updateTarget(id: string, updates: Partial<Target>): Promise<void> {
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    await this.runQuery(
      `UPDATE targets SET ${setClause}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id]
    );
  }

  // Engagement action methods
  async logAction(action: Omit<EngagementAction, 'id'>): Promise<string> {
    const id = `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await this.runQuery(
      'INSERT INTO engagement_actions (id, accountId, targetUsername, action, success, errorMessage, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, action.accountId, action.targetUsername, action.action, action.success ? 1 : 0, action.errorMessage, action.timestamp]
    );
    return id;
  }

  async getActions(accountId?: string, limit: number = 100): Promise<EngagementAction[]> {
    let query = 'SELECT * FROM engagement_actions';
    const params: any[] = [];
    
    if (accountId) {
      query += ' WHERE accountId = ?';
      params.push(accountId);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit.toString());
    
    const rows = await this.allQuery(query, params);
    return rows.map(this.mapAction);
  }

  // Proxy methods (similar to inbox app)
  async getAllProxies(): Promise<Proxy[]> {
    const rows = await this.allQuery('SELECT * FROM proxies ORDER BY createdAt DESC');
    return rows.map(this.mapProxy);
  }

  async createProxy(proxy: Omit<Proxy, 'id' | 'createdAt'>): Promise<string> {
    const id = `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await this.runQuery(
      'INSERT INTO proxies (id, name, host, port, username, password, type, isActive, lastUsed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, proxy.name, proxy.host, proxy.port, proxy.username, proxy.password, proxy.type, proxy.isActive ? 1 : 0, proxy.lastUsed]
    );
    return id;
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

  // Mapping functions
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

  private mapCompetitor(row: any): Competitor {
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      isMonitoring: Boolean(row.isMonitoring),
      lastCheck: new Date(row.lastCheck),
      followerCount: row.followerCount,
      followingCount: row.followingCount,
      postCount: row.postCount,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }

  private mapTarget(row: any): Target {
    return {
      id: row.id,
      username: row.username,
      competitorId: row.competitorId,
      accountId: row.accountId,
      isFollowed: Boolean(row.isFollowed),
      isLiked: Boolean(row.isLiked),
      isCommented: Boolean(row.isCommented),
      isCloseFriend: Boolean(row.isCloseFriend),
      followedAt: row.followedAt ? new Date(row.followedAt) : undefined,
      unfollowAt: row.unfollowAt ? new Date(row.unfollowAt) : undefined,
      engagedAt: row.engagedAt ? new Date(row.engagedAt) : undefined,
      status: row.status,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }

  private mapAction(row: any): EngagementAction {
    return {
      id: row.id,
      accountId: row.accountId,
      targetUsername: row.targetUsername,
      action: row.action,
      success: Boolean(row.success),
      errorMessage: row.errorMessage,
      timestamp: new Date(row.timestamp)
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