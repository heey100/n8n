import { Server } from 'socket.io';
import { InstagramBot } from './InstagramBot';
import { DatabaseManager, Competitor } from './DatabaseManager';

interface FollowerSnapshot {
  competitorId: string;
  competitorUsername: string;
  followers: Set<string>; // Set of follower usernames
  lastCheck: Date;
  followerCount: number;
}

interface NewFollowerData {
  username: string;
  userId: string;
  fullName: string;
  profilePicUrl: string;
  isVerified: boolean;
  isBusinessAccount: boolean;
  followerCount: number;
  followingCount: number;
  postCount: number;
  competitorId: string;
  competitorUsername: string;
  discoveredAt: Date;
}

export class CompetitorMonitor {
  private instagramBot: InstagramBot;
  private dbManager: DatabaseManager;
  private io: Server;
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private followerSnapshots: Map<string, FollowerSnapshot> = new Map();
  private isMonitoring: Map<string, boolean> = new Map();

  constructor(instagramBot: InstagramBot, dbManager: DatabaseManager, io: Server) {
    this.instagramBot = instagramBot;
    this.dbManager = dbManager;
    this.io = io;
  }

  /**
   * Start monitoring a competitor's followers
   */
  async startMonitoring(competitorUsername: string, accountId: string): Promise<void> {
    try {
      console.log(`🔍 Starting to monitor competitor: ${competitorUsername}`);

      // Get or create competitor record
      let competitor = await this.getCompetitorByUsername(competitorUsername);
      if (!competitor) {
        competitor = await this.createCompetitor(competitorUsername, accountId);
      }

      // Stop existing monitoring if any
      this.stopMonitoring(competitorUsername);

      // Mark as monitoring
      this.isMonitoring.set(competitorUsername, true);
      
      // Update database
      await this.dbManager.updateCompetitor(competitor.id, { 
        isMonitoring: true,
        lastCheck: new Date()
      });

      // Get initial follower snapshot
      await this.createInitialSnapshot(competitor, accountId);

      // Start monitoring interval (check every 5 minutes)
      const interval = setInterval(async () => {
        await this.checkForNewFollowers(competitor, accountId);
      }, 5 * 60 * 1000); // 5 minutes

      this.monitoringIntervals.set(competitorUsername, interval);

      // Emit monitoring started event
      this.io.emit('monitoring-started', {
        competitorUsername,
        competitorId: competitor.id,
        message: `Started monitoring ${competitorUsername} for new followers`
      });

      console.log(`✅ Successfully started monitoring ${competitorUsername}`);

    } catch (error) {
      console.error(`Failed to start monitoring ${competitorUsername}:`, error);
      throw error;
    }
  }

  /**
   * Stop monitoring a competitor
   */
  stopMonitoring(competitorUsername: string): void {
    const interval = this.monitoringIntervals.get(competitorUsername);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(competitorUsername);
    }

    this.isMonitoring.set(competitorUsername, false);
    this.followerSnapshots.delete(competitorUsername);

    this.io.emit('monitoring-stopped', {
      competitorUsername,
      message: `Stopped monitoring ${competitorUsername}`
    });

    console.log(`⏹️ Stopped monitoring ${competitorUsername}`);
  }

  /**
   * Create initial follower snapshot for a competitor
   */
  private async createInitialSnapshot(competitor: Competitor, accountId: string): Promise<void> {
    try {
      console.log(`📸 Creating initial snapshot for ${competitor.username}`);

      // Get current followers from Instagram
      const followersData = await this.instagramBot.getCompetitorFollowersList(
        competitor.username, 
        accountId,
        1000 // Initial snapshot limit
      );

      // Create follower set for fast lookup
      const followerUsernames = new Set(followersData.map(f => f.username));

      // Store snapshot
      const snapshot: FollowerSnapshot = {
        competitorId: competitor.id,
        competitorUsername: competitor.username,
        followers: followerUsernames,
        lastCheck: new Date(),
        followerCount: followersData.length
      };

      this.followerSnapshots.set(competitor.username, snapshot);

      // Update competitor stats in database
      await this.dbManager.updateCompetitor(competitor.id, {
        followerCount: followersData.length,
        lastCheck: new Date()
      });

      console.log(`✅ Initial snapshot created: ${followersData.length} followers for ${competitor.username}`);

    } catch (error) {
      console.error(`Failed to create initial snapshot for ${competitor.username}:`, error);
      throw error;
    }
  }

  /**
   * Check for new followers since last check
   */
  private async checkForNewFollowers(competitor: Competitor, accountId: string): Promise<void> {
    try {
      if (!this.isMonitoring.get(competitor.username)) {
        return; // Monitoring was stopped
      }

      console.log(`🔍 Checking for new followers of ${competitor.username}`);

      // Get current snapshot
      const previousSnapshot = this.followerSnapshots.get(competitor.username);
      if (!previousSnapshot) {
        console.log(`No previous snapshot found for ${competitor.username}, creating initial snapshot`);
        await this.createInitialSnapshot(competitor, accountId);
        return;
      }

      // Get current followers from Instagram
      const currentFollowersData = await this.instagramBot.getCompetitorFollowersList(
        competitor.username,
        accountId,
        500 // Check recent followers
      );

      const currentFollowerUsernames = new Set(currentFollowersData.map(f => f.username));

      // Find new followers (in current but not in previous)
      const newFollowers: NewFollowerData[] = [];
      
      for (const followerData of currentFollowersData) {
        if (!previousSnapshot.followers.has(followerData.username)) {
          // This is a new follower!
          newFollowers.push({
            username: followerData.username,
            userId: followerData.userId,
            fullName: followerData.fullName,
            profilePicUrl: followerData.profilePicUrl,
            isVerified: followerData.isVerified,
            isBusinessAccount: followerData.isBusinessAccount,
            followerCount: followerData.followerCount,
            followingCount: followerData.followingCount,
            postCount: followerData.postCount,
            competitorId: competitor.id,
            competitorUsername: competitor.username,
            discoveredAt: new Date()
          });
        }
      }

      // Process new followers
      if (newFollowers.length > 0) {
        console.log(`🎯 Found ${newFollowers.length} new followers for ${competitor.username}`);
        
        for (const newFollower of newFollowers) {
          await this.processNewFollower(newFollower, accountId);
        }

        // Emit new followers event
        this.io.emit('new-followers-detected', {
          competitorUsername: competitor.username,
          competitorId: competitor.id,
          newFollowers: newFollowers.map(f => ({
            username: f.username,
            fullName: f.fullName,
            followerCount: f.followerCount,
            isVerified: f.isVerified
          })),
          count: newFollowers.length
        });
      }

      // Update snapshot
      const updatedSnapshot: FollowerSnapshot = {
        competitorId: competitor.id,
        competitorUsername: competitor.username,
        followers: currentFollowerUsernames,
        lastCheck: new Date(),
        followerCount: currentFollowersData.length
      };

      this.followerSnapshots.set(competitor.username, updatedSnapshot);

      // Update competitor stats
      await this.dbManager.updateCompetitor(competitor.id, {
        followerCount: currentFollowersData.length,
        lastCheck: new Date()
      });

      console.log(`✅ Monitoring check complete for ${competitor.username}. Found ${newFollowers.length} new followers`);

    } catch (error) {
      console.error(`Error checking followers for ${competitor.username}:`, error);
      
      // Emit error event
      this.io.emit('monitoring-error', {
        competitorUsername: competitor.username,
        error: (error as Error).message
      });
    }
  }

  /**
   * Process a newly discovered follower
   */
  private async processNewFollower(followerData: NewFollowerData, accountId: string): Promise<void> {
    try {
      // Check if we already have this target
      const existingTarget = await this.dbManager.getQuery(
        'SELECT id FROM targets WHERE username = ? AND competitorId = ? AND accountId = ?',
        [followerData.username, followerData.competitorId, accountId]
      );

      if (existingTarget) {
        console.log(`Target ${followerData.username} already exists, skipping`);
        return;
      }

      // Create new target in database
      const targetId = await this.dbManager.createTarget({
        username: followerData.username,
        competitorId: followerData.competitorId,
        accountId: accountId,
        isFollowed: false,
        isLiked: false,
        isCommented: false,
        isCloseFriend: false,
        status: 'discovered'
      });

      console.log(`🎯 New target discovered: ${followerData.username} (followed ${followerData.competitorUsername})`);

      // Emit new target event for real-time updates
      this.io.emit('new-target-discovered', {
        targetId,
        target: followerData,
        message: `${followerData.username} started following ${followerData.competitorUsername}`
      });

      // Log the discovery
      await this.dbManager.logAction({
        accountId,
        targetUsername: followerData.username,
        action: 'follow',
        success: true,
        timestamp: new Date()
      });

    } catch (error) {
      console.error(`Failed to process new follower ${followerData.username}:`, error);
    }
  }

  /**
   * Get competitor by username or create if doesn't exist
   */
  private async getCompetitorByUsername(username: string): Promise<Competitor | null> {
    const result = await this.dbManager.getQuery(
      'SELECT * FROM competitors WHERE username = ?',
      [username]
    );
    
    return result ? this.mapCompetitor(result) : null;
  }

  /**
   * Create a new competitor record
   */
  private async createCompetitor(username: string, accountId: string): Promise<Competitor> {
    try {
      // Get competitor profile info from Instagram
      const profileInfo = await this.instagramBot.getUserProfile(username, accountId);
      
      const competitorId = await this.dbManager.createCompetitor({
        username: username,
        displayName: profileInfo.fullName || username,
        isMonitoring: false,
        lastCheck: new Date(),
        followerCount: profileInfo.followerCount || 0,
        followingCount: profileInfo.followingCount || 0,
        postCount: profileInfo.postCount || 0
      });

      const competitor = await this.dbManager.getCompetitor(competitorId);
      if (!competitor) {
        throw new Error('Failed to create competitor');
      }

      console.log(`✅ Created new competitor: ${username}`);
      return competitor;

    } catch (error) {
      console.error(`Failed to create competitor ${username}:`, error);
      throw error;
    }
  }

  /**
   * Run monitoring for all active competitors
   */
  async runAllMonitoring(): Promise<void> {
    try {
      const competitors = await this.dbManager.getAllCompetitors();
      const activeCompetitors = competitors.filter(c => c.isMonitoring);

      console.log(`🔄 Running monitoring check for ${activeCompetitors.length} competitors`);

      for (const competitor of activeCompetitors) {
        // Find an account that can be used to check this competitor
        const accounts = await this.dbManager.getAllAccounts();
        const activeAccount = accounts.find(acc => acc.isActive);
        
        if (activeAccount) {
          await this.checkForNewFollowers(competitor, activeAccount.id);
        }
      }

    } catch (error) {
      console.error('Failed to run monitoring for all competitors:', error);
    }
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStats(): {
    totalCompetitors: number;
    activeMonitoring: number;
    totalSnapshots: number;
    lastActivity: Date | null;
  } {
    const competitors = Array.from(this.isMonitoring.keys());
    const activeCount = Array.from(this.isMonitoring.values()).filter(Boolean).length;
    
    let lastActivity: Date | null = null;
    for (const snapshot of this.followerSnapshots.values()) {
      if (!lastActivity || snapshot.lastCheck > lastActivity) {
        lastActivity = snapshot.lastCheck;
      }
    }

    return {
      totalCompetitors: competitors.length,
      activeMonitoring: activeCount,
      totalSnapshots: this.followerSnapshots.size,
      lastActivity
    };
  }

  /**
   * Get current follower count for a competitor
   */
  getCurrentFollowerCount(competitorUsername: string): number {
    const snapshot = this.followerSnapshots.get(competitorUsername);
    return snapshot ? snapshot.followerCount : 0;
  }

  /**
   * Check if currently monitoring a competitor
   */
  isCurrentlyMonitoring(competitorUsername: string): boolean {
    return this.isMonitoring.get(competitorUsername) || false;
  }

  /**
   * Get list of currently monitored competitors
   */
  getMonitoredCompetitors(): string[] {
    return Array.from(this.isMonitoring.entries())
      .filter(([_, isActive]) => isActive)
      .map(([username, _]) => username);
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
}