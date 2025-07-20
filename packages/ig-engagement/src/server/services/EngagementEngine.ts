import { Server } from 'socket.io';
import { InstagramBot } from './InstagramBot';
import { DatabaseManager, Target, Campaign, EngagementAction } from './DatabaseManager';
import _ from 'lodash';

interface EngagementSettings {
  followDelay: { min: number; max: number }; // seconds
  likeDelay: { min: number; max: number };
  commentDelay: { min: number; max: number };
  unfollowAfter: number; // hours
  maxFollowsPerHour: number;
  maxLikesPerHour: number;
  maxCommentsPerHour: number;
  targetStories: boolean;
  addToCloseFriends: boolean;
  commentMessages: string[];
  storyComments: string[];
  workingHours: { start: number; end: number }; // 0-23
  skipBusinessAccounts: boolean;
  skipVerifiedAccounts: boolean;
  minFollowers: number;
  maxFollowers: number;
}

interface CampaignStats {
  totalTargets: number;
  followed: number;
  unfollowed: number;
  liked: number;
  commented: number;
  storiesViewed: number;
  storiesCommented: number;
  closeFriendsAdded: number;
  errors: number;
  lastRun: Date;
}

export class EngagementEngine {
  private instagramBot: InstagramBot;
  private dbManager: DatabaseManager;
  private io: Server;
  private activeCampaigns: Map<string, NodeJS.Timeout> = new Map();
  private actionQueues: Map<string, any[]> = new Map();
  private rateLimits: Map<string, { follows: number; likes: number; comments: number; lastReset: Date }> = new Map();

  constructor(instagramBot: InstagramBot, dbManager: DatabaseManager, io: Server) {
    this.instagramBot = instagramBot;
    this.dbManager = dbManager;
    this.io = io;
    
    // Initialize rate limiting
    this.resetRateLimits();
    setInterval(() => this.resetRateLimits(), 60 * 60 * 1000); // Reset every hour
  }

  private resetRateLimits(): void {
    this.rateLimits.clear();
    console.log('🔄 Rate limits reset');
  }

  private getRateLimit(accountId: string): { follows: number; likes: number; comments: number; lastReset: Date } {
    if (!this.rateLimits.has(accountId)) {
      this.rateLimits.set(accountId, {
        follows: 0,
        likes: 0,
        comments: 0,
        lastReset: new Date()
      });
    }
    return this.rateLimits.get(accountId)!;
  }

  private canPerformAction(accountId: string, action: 'follow' | 'like' | 'comment', settings: EngagementSettings): boolean {
    const limits = this.getRateLimit(accountId);
    
    switch (action) {
      case 'follow':
        return limits.follows < settings.maxFollowsPerHour;
      case 'like':
        return limits.likes < settings.maxLikesPerHour;
      case 'comment':
        return limits.comments < settings.maxCommentsPerHour;
      default:
        return false;
    }
  }

  private incrementActionCount(accountId: string, action: 'follow' | 'like' | 'comment'): void {
    const limits = this.getRateLimit(accountId);
    limits[action === 'follow' ? 'follows' : action === 'like' ? 'likes' : 'comments']++;
  }

  private isWithinWorkingHours(settings: EngagementSettings): boolean {
    const currentHour = new Date().getHours();
    if (settings.workingHours.start <= settings.workingHours.end) {
      return currentHour >= settings.workingHours.start && currentHour <= settings.workingHours.end;
    } else {
      // Handle overnight working hours (e.g., 22-6)
      return currentHour >= settings.workingHours.start || currentHour <= settings.workingHours.end;
    }
  }

  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private getRandomComment(comments: string[]): string {
    return comments[Math.floor(Math.random() * comments.length)];
  }

  async startCampaign(campaignId: string): Promise<void> {
    try {
      const campaign = await this.dbManager.getQuery(
        'SELECT * FROM campaigns WHERE id = ?', 
        [campaignId]
      );
      
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const settings: EngagementSettings = JSON.parse(campaign.settings);
      
      // Stop existing campaign if running
      this.stopCampaign(campaignId);
      
      // Mark campaign as active
      await this.dbManager.runQuery(
        'UPDATE campaigns SET isActive = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [campaignId]
      );

      // Start campaign execution
      const interval = setInterval(async () => {
        await this.executeCampaignCycle(campaignId, campaign, settings);
      }, 60000); // Run every minute

      this.activeCampaigns.set(campaignId, interval);
      
      this.io.emit('campaign-started', { campaignId, name: campaign.name });
      console.log(`🚀 Started campaign: ${campaign.name}`);
      
    } catch (error) {
      console.error(`Failed to start campaign ${campaignId}:`, error);
      throw error;
    }
  }

  async stopCampaign(campaignId: string): Promise<void> {
    const interval = this.activeCampaigns.get(campaignId);
    if (interval) {
      clearInterval(interval);
      this.activeCampaigns.delete(campaignId);
    }

    // Mark campaign as inactive
    await this.dbManager.runQuery(
      'UPDATE campaigns SET isActive = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [campaignId]
    );

    this.io.emit('campaign-stopped', { campaignId });
    console.log(`⏹️ Stopped campaign: ${campaignId}`);
  }

  private async executeCampaignCycle(campaignId: string, campaign: any, settings: EngagementSettings): Promise<void> {
    try {
      // Check if within working hours
      if (!this.isWithinWorkingHours(settings)) {
        return;
      }

      // Get new targets from competitor followers
      const newTargets = await this.instagramBot.getCompetitorFollowers(
        campaign.competitorId,
        campaign.accountId,
        50 // Limit per cycle
      );

      // Process each target
      for (const target of newTargets) {
        await this.processTarget(target, campaign.accountId, settings);
        
        // Add delay between targets
        const delay = this.getRandomDelay(30, 60) * 1000; // 30-60 seconds
        await this.sleep(delay);
      }

      // Update campaign stats
      await this.updateCampaignStats(campaignId);
      
    } catch (error) {
      console.error(`Campaign cycle error for ${campaignId}:`, error);
    }
  }

  private async processTarget(target: any, accountId: string, settings: EngagementSettings): Promise<void> {
    try {
      // Check if target meets criteria
      if (!await this.isValidTarget(target, settings)) {
        return;
      }

      const targetId = await this.dbManager.createTarget({
        username: target.username,
        competitorId: target.competitorId,
        accountId: accountId,
        isFollowed: false,
        isLiked: false,
        isCommented: false,
        isCloseFriend: false,
        status: 'discovered'
      });

      // Execute engagement sequence
      await this.executeEngagementSequence(targetId, target, accountId, settings);
      
    } catch (error) {
      console.error(`Failed to process target ${target.username}:`, error);
      
      await this.dbManager.logAction({
        accountId,
        targetUsername: target.username,
        action: 'follow',
        success: false,
        errorMessage: (error as Error).message,
        timestamp: new Date()
      });
    }
  }

  private async isValidTarget(target: any, settings: EngagementSettings): Promise<boolean> {
    // Check follower count
    if (target.followerCount < settings.minFollowers || target.followerCount > settings.maxFollowers) {
      return false;
    }

    // Check if business account (if skip enabled)
    if (settings.skipBusinessAccounts && target.isBusinessAccount) {
      return false;
    }

    // Check if verified account (if skip enabled)
    if (settings.skipVerifiedAccounts && target.isVerified) {
      return false;
    }

    return true;
  }

  private async executeEngagementSequence(targetId: string, target: any, accountId: string, settings: EngagementSettings): Promise<void> {
    try {
      // Step 1: Like recent posts
      if (settings.maxLikesPerHour > 0 && this.canPerformAction(accountId, 'like', settings)) {
        await this.likeRecentPosts(target, accountId, settings);
        this.incrementActionCount(accountId, 'like');
        
        await this.dbManager.updateTarget(targetId, { isLiked: true, engagedAt: new Date() });
        
        // Delay before next action
        const delay = this.getRandomDelay(settings.likeDelay.min, settings.likeDelay.max) * 1000;
        await this.sleep(delay);
      }

      // Step 2: View and comment on stories (if enabled)
      if (settings.targetStories) {
        await this.engageWithStories(target, accountId, settings);
        
        // Delay before next action
        const delay = this.getRandomDelay(30, 60) * 1000;
        await this.sleep(delay);
      }

      // Step 3: Follow the user
      if (settings.maxFollowsPerHour > 0 && this.canPerformAction(accountId, 'follow', settings)) {
        const followSuccess = await this.instagramBot.followUser(accountId, target.username);
        
        if (followSuccess) {
          const unfollowAt = new Date(Date.now() + settings.unfollowAfter * 60 * 60 * 1000);
          
          await this.dbManager.updateTarget(targetId, {
            isFollowed: true,
            followedAt: new Date(),
            unfollowAt: unfollowAt,
            status: 'following'
          });

          this.incrementActionCount(accountId, 'follow');
          
          await this.dbManager.logAction({
            accountId,
            targetUsername: target.username,
            action: 'follow',
            success: true,
            timestamp: new Date()
          });

          // Step 4: Add to close friends (if enabled)
          if (settings.addToCloseFriends) {
            await this.addToCloseFriends(target, accountId);
            await this.dbManager.updateTarget(targetId, { isCloseFriend: true });
          }

          console.log(`✅ Successfully engaged with ${target.username}`);
        }
        
        // Delay before next action
        const delay = this.getRandomDelay(settings.followDelay.min, settings.followDelay.max) * 1000;
        await this.sleep(delay);
      }

      // Step 5: Comment on recent posts (if enabled)
      if (settings.maxCommentsPerHour > 0 && settings.commentMessages.length > 0 && this.canPerformAction(accountId, 'comment', settings)) {
        await this.commentOnRecentPosts(target, accountId, settings);
        this.incrementActionCount(accountId, 'comment');
        
        await this.dbManager.updateTarget(targetId, { isCommented: true });
        
        // Delay after commenting
        const delay = this.getRandomDelay(settings.commentDelay.min, settings.commentDelay.max) * 1000;
        await this.sleep(delay);
      }

    } catch (error) {
      console.error(`Engagement sequence failed for ${target.username}:`, error);
      throw error;
    }
  }

  private async likeRecentPosts(target: any, accountId: string, settings: EngagementSettings): Promise<void> {
    try {
      const posts = await this.instagramBot.getUserRecentPosts(target.username, 3); // Like up to 3 recent posts
      
      for (const post of posts) {
        const success = await this.instagramBot.likePost(accountId, post.id);
        
        await this.dbManager.logAction({
          accountId,
          targetUsername: target.username,
          action: 'like',
          success,
          timestamp: new Date()
        });

        if (success) {
          console.log(`❤️ Liked post by ${target.username}`);
        }

        // Small delay between likes
        await this.sleep(this.getRandomDelay(5, 15) * 1000);
      }
    } catch (error) {
      console.error(`Failed to like posts for ${target.username}:`, error);
    }
  }

  private async commentOnRecentPosts(target: any, accountId: string, settings: EngagementSettings): Promise<void> {
    try {
      const posts = await this.instagramBot.getUserRecentPosts(target.username, 1); // Comment on 1 recent post
      
      for (const post of posts) {
        const comment = this.getRandomComment(settings.commentMessages);
        const success = await this.instagramBot.commentOnPost(accountId, post.id, comment);
        
        await this.dbManager.logAction({
          accountId,
          targetUsername: target.username,
          action: 'comment',
          success,
          timestamp: new Date()
        });

        if (success) {
          console.log(`💬 Commented on ${target.username}'s post: "${comment}"`);
        }
      }
    } catch (error) {
      console.error(`Failed to comment on posts for ${target.username}:`, error);
    }
  }

  private async engageWithStories(target: any, accountId: string, settings: EngagementSettings): Promise<void> {
    try {
      const stories = await this.instagramBot.getUserStories(target.username);
      
      for (const story of stories.slice(0, 3)) { // Engage with up to 3 stories
        // View the story
        const viewSuccess = await this.instagramBot.viewStory(accountId, story.id);
        
        await this.dbManager.logAction({
          accountId,
          targetUsername: target.username,
          action: 'story_view',
          success: viewSuccess,
          timestamp: new Date()
        });

        if (viewSuccess) {
          console.log(`👀 Viewed ${target.username}'s story`);
        }

        // Comment on story (if enabled and has story comments)
        if (settings.storyComments && settings.storyComments.length > 0 && Math.random() < 0.3) { // 30% chance
          const comment = this.getRandomComment(settings.storyComments);
          const commentSuccess = await this.instagramBot.commentOnStory(accountId, story.id, comment);
          
          await this.dbManager.logAction({
            accountId,
            targetUsername: target.username,
            action: 'story_comment',
            success: commentSuccess,
            timestamp: new Date()
          });

          if (commentSuccess) {
            console.log(`💬 Commented on ${target.username}'s story: "${comment}"`);
          }
        }

        // Small delay between stories
        await this.sleep(this.getRandomDelay(3, 8) * 1000);
      }
    } catch (error) {
      console.error(`Failed to engage with stories for ${target.username}:`, error);
    }
  }

  private async addToCloseFriends(target: any, accountId: string): Promise<void> {
    try {
      const success = await this.instagramBot.addToCloseFriends(accountId, target.username);
      
      await this.dbManager.logAction({
        accountId,
        targetUsername: target.username,
        action: 'close_friend_add',
        success,
        timestamp: new Date()
      });

      if (success) {
        console.log(`⭐ Added ${target.username} to close friends`);
      }
    } catch (error) {
      console.error(`Failed to add ${target.username} to close friends:`, error);
    }
  }

  async runUnfollowCleanup(): Promise<void> {
    try {
      const targetsToUnfollow = await this.dbManager.getTargetsForUnfollow();
      
      for (const target of targetsToUnfollow) {
        try {
          const success = await this.instagramBot.unfollowUser(target.accountId, target.username);
          
          if (success) {
            await this.dbManager.updateTarget(target.id, {
              isFollowed: false,
              status: 'unfollowed'
            });

            await this.dbManager.logAction({
              accountId: target.accountId,
              targetUsername: target.username,
              action: 'unfollow',
              success: true,
              timestamp: new Date()
            });

            console.log(`👋 Unfollowed ${target.username}`);
          }
          
          // Delay between unfollows
          await this.sleep(this.getRandomDelay(30, 60) * 1000);
          
        } catch (error) {
          console.error(`Failed to unfollow ${target.username}:`, error);
          
          await this.dbManager.logAction({
            accountId: target.accountId,
            targetUsername: target.username,
            action: 'unfollow',
            success: false,
            errorMessage: (error as Error).message,
            timestamp: new Date()
          });
        }
      }

      if (targetsToUnfollow.length > 0) {
        this.io.emit('unfollow-cleanup-completed', { count: targetsToUnfollow.length });
      }
      
    } catch (error) {
      console.error('Unfollow cleanup failed:', error);
    }
  }

  async runActiveCampaigns(): Promise<void> {
    // This is called by the cron job - campaigns run their own cycles
    console.log(`⚡ ${this.activeCampaigns.size} active campaigns running`);
  }

  async updateDailyStats(): Promise<void> {
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Get stats for each account
      const accounts = await this.dbManager.getAllAccounts();
      
      for (const account of accounts) {
        const actions = await this.dbManager.getActions(account.id, 1000);
        const yesterdayActions = actions.filter(a => a.timestamp >= yesterday);
        
        const stats = {
          follows: yesterdayActions.filter(a => a.action === 'follow' && a.success).length,
          unfollows: yesterdayActions.filter(a => a.action === 'unfollow' && a.success).length,
          likes: yesterdayActions.filter(a => a.action === 'like' && a.success).length,
          comments: yesterdayActions.filter(a => a.action === 'comment' && a.success).length,
          storyViews: yesterdayActions.filter(a => a.action === 'story_view' && a.success).length,
          storyComments: yesterdayActions.filter(a => a.action === 'story_comment' && a.success).length,
          closeFriendsAdded: yesterdayActions.filter(a => a.action === 'close_friend_add' && a.success).length,
          errors: yesterdayActions.filter(a => !a.success).length
        };

        this.io.emit('daily-stats-updated', { accountId: account.id, stats });
      }
      
      console.log('📊 Daily stats updated');
      
    } catch (error) {
      console.error('Failed to update daily stats:', error);
    }
  }

  private async updateCampaignStats(campaignId: string): Promise<void> {
    try {
      // Get current campaign stats from database
      const campaign = await this.dbManager.getQuery('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
      if (!campaign) return;

      const targets = await this.dbManager.allQuery(
        'SELECT * FROM targets WHERE competitorId = ? AND accountId = ?',
        [campaign.competitorId, campaign.accountId]
      );

      const stats: CampaignStats = {
        totalTargets: targets.length,
        followed: targets.filter((t: any) => t.isFollowed).length,
        unfollowed: targets.filter((t: any) => t.status === 'unfollowed').length,
        liked: targets.filter((t: any) => t.isLiked).length,
        commented: targets.filter((t: any) => t.isCommented).length,
        storiesViewed: 0, // Would need separate tracking
        storiesCommented: 0, // Would need separate tracking
        closeFriendsAdded: targets.filter((t: any) => t.isCloseFriend).length,
        errors: 0, // Would need to count from actions
        lastRun: new Date()
      };

      await this.dbManager.runQuery(
        'UPDATE campaigns SET stats = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify(stats), campaignId]
      );

      this.io.emit('campaign-stats-updated', { campaignId, stats });
      
    } catch (error) {
      console.error(`Failed to update campaign stats for ${campaignId}:`, error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get campaign statistics
  async getCampaignStats(campaignId: string): Promise<CampaignStats | null> {
    try {
      const campaign = await this.dbManager.getQuery('SELECT stats FROM campaigns WHERE id = ?', [campaignId]);
      return campaign ? JSON.parse(campaign.stats) : null;
    } catch (error) {
      console.error(`Failed to get campaign stats for ${campaignId}:`, error);
      return null;
    }
  }

  // Get active campaigns count
  getActiveCampaignsCount(): number {
    return this.activeCampaigns.size;
  }
}