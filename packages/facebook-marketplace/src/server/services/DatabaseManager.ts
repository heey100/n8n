import sqlite3 from 'sqlite3';
import { promisify } from 'util';

export interface FacebookAccount {
  id: string;
  email: string;
  password: string; // Encrypted
  displayName: string;
  isActive: boolean;
  lastLogin?: Date;
  dailyListingsPosted: number;
  maxDailyListings: number;
  profileUrl?: string;
  proxyId?: string;
  cookiesPath?: string;
  status: 'active' | 'suspended' | 'blocked' | 'limited';
  createdAt: Date;
  updatedAt: Date;
}

export interface CarListing {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  mileage: number;
  condition: 'new' | 'used' | 'certified';
  description: string;
  location: string;
  bodyType: string;
  fuelType: string;
  transmission: string;
  color: string;
  features: string[]; // JSON array
  images: string[]; // Array of image paths
  status: 'pending' | 'posted' | 'sold' | 'removed';
  createdAt: Date;
  updatedAt: Date;
}

export interface ListingPost {
  id: string;
  carId: string;
  accountId: string;
  facebookPostId?: string;
  marketplaceUrl?: string;
  status: 'pending' | 'posting' | 'posted' | 'failed' | 'removed';
  postedAt?: Date;
  views?: number;
  inquiries?: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyQuota {
  id: string;
  accountId: string;
  date: string;
  listingsPosted: number;
  listingsFailed: number;
  maxListings: number;
  quotaReached: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListingSchedule {
  id: string;
  carId: string;
  accountIds: string[]; // JSON array of account IDs to post to
  scheduledFor: Date;
  isRecurring: boolean;
  recurringDays?: number; // Days between reposts
  status: 'scheduled' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
}

export class DatabaseManager {
  private db: sqlite3.Database;

  constructor() {
    this.db = new sqlite3.Database('facebook_marketplace.db');
    this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    const runAsync = promisify(this.db.run.bind(this.db));

    try {
      // Facebook Accounts table
      await runAsync(`
        CREATE TABLE IF NOT EXISTS facebook_accounts (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          displayName TEXT NOT NULL,
          isActive BOOLEAN DEFAULT 1,
          lastLogin DATETIME,
          dailyListingsPosted INTEGER DEFAULT 0,
          maxDailyListings INTEGER DEFAULT 7,
          profileUrl TEXT,
          proxyId TEXT,
          cookiesPath TEXT,
          status TEXT DEFAULT 'active',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Car Listings table
      await runAsync(`
        CREATE TABLE IF NOT EXISTS car_listings (
          id TEXT PRIMARY KEY,
          make TEXT NOT NULL,
          model TEXT NOT NULL,
          year INTEGER NOT NULL,
          price REAL NOT NULL,
          mileage INTEGER NOT NULL,
          condition TEXT NOT NULL,
          description TEXT NOT NULL,
          location TEXT NOT NULL,
          bodyType TEXT NOT NULL,
          fuelType TEXT NOT NULL,
          transmission TEXT NOT NULL,
          color TEXT NOT NULL,
          features TEXT, -- JSON array
          images TEXT, -- JSON array of image paths
          status TEXT DEFAULT 'pending',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Listing Posts table (tracks which car was posted to which account)
      await runAsync(`
        CREATE TABLE IF NOT EXISTS listing_posts (
          id TEXT PRIMARY KEY,
          carId TEXT NOT NULL,
          accountId TEXT NOT NULL,
          facebookPostId TEXT,
          marketplaceUrl TEXT,
          status TEXT DEFAULT 'pending',
          postedAt DATETIME,
          views INTEGER DEFAULT 0,
          inquiries INTEGER DEFAULT 0,
          errorMessage TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (carId) REFERENCES car_listings (id),
          FOREIGN KEY (accountId) REFERENCES facebook_accounts (id)
        )
      `);

      // Daily Quotas table
      await runAsync(`
        CREATE TABLE IF NOT EXISTS daily_quotas (
          id TEXT PRIMARY KEY,
          accountId TEXT NOT NULL,
          date TEXT NOT NULL,
          listingsPosted INTEGER DEFAULT 0,
          listingsFailed INTEGER DEFAULT 0,
          maxListings INTEGER DEFAULT 7,
          quotaReached BOOLEAN DEFAULT 0,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (accountId) REFERENCES facebook_accounts (id),
          UNIQUE(accountId, date)
        )
      `);

      // Listing Schedules table
      await runAsync(`
        CREATE TABLE IF NOT EXISTS listing_schedules (
          id TEXT PRIMARY KEY,
          carId TEXT NOT NULL,
          accountIds TEXT NOT NULL, -- JSON array
          scheduledFor DATETIME NOT NULL,
          isRecurring BOOLEAN DEFAULT 0,
          recurringDays INTEGER,
          status TEXT DEFAULT 'scheduled',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (carId) REFERENCES car_listings (id)
        )
      `);

      // Proxies table
      await runAsync(`
        CREATE TABLE IF NOT EXISTS proxies (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          host TEXT NOT NULL,
          port INTEGER NOT NULL,
          username TEXT,
          password TEXT,
          type TEXT DEFAULT 'http',
          isActive BOOLEAN DEFAULT 1,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('✅ Database initialized successfully');

    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  // Facebook Accounts methods
  async createAccount(account: Omit<FacebookAccount, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const runAsync = promisify(this.db.run.bind(this.db));
    const id = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await runAsync(`
      INSERT INTO facebook_accounts (
        id, email, password, displayName, isActive, maxDailyListings, 
        proxyId, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, account.email, account.password, account.displayName,
      account.isActive, account.maxDailyListings, account.proxyId, account.status
    ]);

    return id;
  }

  async getAllAccounts(): Promise<FacebookAccount[]> {
    const allAsync = promisify(this.db.all.bind(this.db));
    const rows = await allAsync('SELECT * FROM facebook_accounts ORDER BY createdAt DESC') as any[];
    
    return rows.map(this.mapAccount);
  }

  async getActiveAccounts(): Promise<FacebookAccount[]> {
    const allAsync = promisify(this.db.all.bind(this.db));
    const rows = await allAsync('SELECT * FROM facebook_accounts WHERE isActive = 1 ORDER BY createdAt DESC') as any[];
    
    return rows.map(this.mapAccount);
  }

  async getAccount(id: string): Promise<FacebookAccount | null> {
    const getAsync = promisify(this.db.get.bind(this.db));
    const row = await getAsync('SELECT * FROM facebook_accounts WHERE id = ?', [id]) as any;
    
    return row ? this.mapAccount(row) : null;
  }

  async updateAccount(id: string, updates: Partial<FacebookAccount>): Promise<void> {
    const runAsync = promisify(this.db.run.bind(this.db));
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    
    await runAsync(`UPDATE facebook_accounts SET ${fields}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id]);
  }

  // Car Listings methods
  async createCarListing(car: Omit<CarListing, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const runAsync = promisify(this.db.run.bind(this.db));
    const id = `car_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await runAsync(`
      INSERT INTO car_listings (
        id, make, model, year, price, mileage, condition, description,
        location, bodyType, fuelType, transmission, color, features, images, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, car.make, car.model, car.year, car.price, car.mileage, car.condition,
      car.description, car.location, car.bodyType, car.fuelType, car.transmission,
      car.color, JSON.stringify(car.features), JSON.stringify(car.images), car.status
    ]);

    return id;
  }

  async getAllCarListings(): Promise<CarListing[]> {
    const allAsync = promisify(this.db.all.bind(this.db));
    const rows = await allAsync('SELECT * FROM car_listings ORDER BY createdAt DESC') as any[];
    
    return rows.map(this.mapCarListing);
  }

  async getPendingCarListings(): Promise<CarListing[]> {
    const allAsync = promisify(this.db.all.bind(this.db));
    const rows = await allAsync('SELECT * FROM car_listings WHERE status = "pending" ORDER BY createdAt ASC') as any[];
    
    return rows.map(this.mapCarListing);
  }

  async updateCarListing(id: string, updates: Partial<CarListing>): Promise<void> {
    const runAsync = promisify(this.db.run.bind(this.db));
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    
    await runAsync(`UPDATE car_listings SET ${fields}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id]);
  }

  // Listing Posts methods
  async createListingPost(post: Omit<ListingPost, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const runAsync = promisify(this.db.run.bind(this.db));
    const id = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await runAsync(`
      INSERT INTO listing_posts (id, carId, accountId, status)
      VALUES (?, ?, ?, ?)
    `, [id, post.carId, post.accountId, post.status]);

    return id;
  }

  async updateListingPost(id: string, updates: Partial<ListingPost>): Promise<void> {
    const runAsync = promisify(this.db.run.bind(this.db));
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    
    await runAsync(`UPDATE listing_posts SET ${fields}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id]);
  }

  async getListingPostsByAccount(accountId: string): Promise<ListingPost[]> {
    const allAsync = promisify(this.db.all.bind(this.db));
    const rows = await allAsync('SELECT * FROM listing_posts WHERE accountId = ? ORDER BY createdAt DESC', [accountId]) as any[];
    
    return rows.map(this.mapListingPost);
  }

  // Daily Quotas methods
  async getDailyQuota(accountId: string, date: string): Promise<DailyQuota | null> {
    const getAsync = promisify(this.db.get.bind(this.db));
    const row = await getAsync('SELECT * FROM daily_quotas WHERE accountId = ? AND date = ?', [accountId, date]) as any;
    
    return row ? this.mapDailyQuota(row) : null;
  }

  async createOrUpdateDailyQuota(accountId: string, date: string, listingsPosted: number, listingsFailed: number = 0): Promise<void> {
    const runAsync = promisify(this.db.run.bind(this.db));
    const account = await this.getAccount(accountId);
    const maxListings = account?.maxDailyListings || 7;
    const quotaReached = listingsPosted >= maxListings;

    await runAsync(`
      INSERT OR REPLACE INTO daily_quotas (
        id, accountId, date, listingsPosted, listingsFailed, maxListings, quotaReached
      ) VALUES (
        COALESCE((SELECT id FROM daily_quotas WHERE accountId = ? AND date = ?), ?),
        ?, ?, ?, ?, ?, ?
      )
    `, [
      accountId, date, `quota_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      accountId, date, listingsPosted, listingsFailed, maxListings, quotaReached
    ]);
  }

  async canPostToday(accountId: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];
    const quota = await this.getDailyQuota(accountId, today);
    const account = await this.getAccount(accountId);
    
    if (!quota) return true;
    
    return quota.listingsPosted < (account?.maxDailyListings || 7);
  }

  // Analytics methods
  async getDailyStats(date?: string): Promise<{
    totalListings: number;
    successfulPosts: number;
    failedPosts: number;
    accountsUsed: number;
    averagePostsPerAccount: number;
  }> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const allAsync = promisify(this.db.all.bind(this.db));
    
    const stats = await allAsync(`
      SELECT 
        COUNT(*) as totalListings,
        SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) as successfulPosts,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedPosts,
        COUNT(DISTINCT accountId) as accountsUsed
      FROM listing_posts 
      WHERE DATE(createdAt) = ?
    `, [targetDate]) as any[];

    const result = stats[0] || { totalListings: 0, successfulPosts: 0, failedPosts: 0, accountsUsed: 0 };
    
    return {
      ...result,
      averagePostsPerAccount: result.accountsUsed > 0 ? result.totalListings / result.accountsUsed : 0
    };
  }

  // Utility methods
  private mapAccount(row: any): FacebookAccount {
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      displayName: row.displayName,
      isActive: Boolean(row.isActive),
      lastLogin: row.lastLogin ? new Date(row.lastLogin) : undefined,
      dailyListingsPosted: row.dailyListingsPosted,
      maxDailyListings: row.maxDailyListings,
      profileUrl: row.profileUrl,
      proxyId: row.proxyId,
      cookiesPath: row.cookiesPath,
      status: row.status,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }

  private mapCarListing(row: any): CarListing {
    return {
      id: row.id,
      make: row.make,
      model: row.model,
      year: row.year,
      price: row.price,
      mileage: row.mileage,
      condition: row.condition,
      description: row.description,
      location: row.location,
      bodyType: row.bodyType,
      fuelType: row.fuelType,
      transmission: row.transmission,
      color: row.color,
      features: JSON.parse(row.features || '[]'),
      images: JSON.parse(row.images || '[]'),
      status: row.status,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }

  private mapListingPost(row: any): ListingPost {
    return {
      id: row.id,
      carId: row.carId,
      accountId: row.accountId,
      facebookPostId: row.facebookPostId,
      marketplaceUrl: row.marketplaceUrl,
      status: row.status,
      postedAt: row.postedAt ? new Date(row.postedAt) : undefined,
      views: row.views,
      inquiries: row.inquiries,
      errorMessage: row.errorMessage,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }

  private mapDailyQuota(row: any): DailyQuota {
    return {
      id: row.id,
      accountId: row.accountId,
      date: row.date,
      listingsPosted: row.listingsPosted,
      listingsFailed: row.listingsFailed,
      maxListings: row.maxListings,
      quotaReached: Boolean(row.quotaReached),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}