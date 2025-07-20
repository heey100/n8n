# 📱 Instagram API Integration Guide

## 🎯 **Current Status**

The current implementation uses **mock data** for demonstration purposes. To make this work with real Instagram data, you need to integrate with **Instagram's Private API** using the `instagram-private-api` library.

## 🔧 **How We'll Use Instagram API**

### **1. Instagram Private API Library**

We use `instagram-private-api` which is a Node.js library that replicates Instagram's mobile app API:

```bash
npm install instagram-private-api
```

### **2. Real Implementation Structure**

Here's how the actual Instagram API integration works:

```typescript
import { IgApiClient } from 'instagram-private-api';

export class InstagramBot {
  private igClients: Map<string, IgApiClient> = new Map();
  
  async initializeAccount(account: InstagramAccount): Promise<boolean> {
    try {
      // Create Instagram API client
      const ig = new IgApiClient();
      
      // Set proxy if configured (for different IP addresses)
      if (account.proxyId) {
        const proxyAgent = this.proxyManager.getAgent(account.proxyId);
        ig.request.defaults.agent = proxyAgent;
      }
      
      // Set device info (simulate real phone)
      ig.state.generateDevice(account.username);
      
      // Login with credentials
      await ig.account.login(account.username, account.password);
      
      // Store authenticated client
      this.igClients.set(account.id, ig);
      
      console.log(`✅ Instagram API authenticated for ${account.username}`);
      return true;
      
    } catch (error) {
      console.error(`Failed to authenticate ${account.username}:`, error);
      return false;
    }
  }
}
```

## 🔍 **Core API Functions**

### **1. Get Competitor Followers**

```typescript
async getCompetitorFollowersList(
  competitorUsername: string, 
  accountId: string, 
  limit: number = 500
): Promise<FollowerData[]> {
  try {
    // Get authenticated Instagram client
    const ig = this.igClients.get(accountId);
    if (!ig) {
      throw new Error(`No Instagram session for account ${accountId}`);
    }

    // Search for competitor's user ID
    const user = await ig.user.searchExact(competitorUsername);
    if (!user) {
      throw new Error(`User ${competitorUsername} not found`);
    }

    // Get followers feed
    const followersFeed = ig.feed.accountFollowers(user.pk);
    
    // Fetch followers (Instagram returns them in batches)
    const followers = [];
    let items = await followersFeed.items();
    
    while (followers.length < limit && followersFeed.isMoreAvailable()) {
      followers.push(...items);
      items = await followersFeed.items();
    }

    // Convert to our format
    return followers.slice(0, limit).map(follower => ({
      username: follower.username,
      userId: follower.pk.toString(),
      fullName: follower.full_name,
      profilePicUrl: follower.profile_pic_url,
      isVerified: follower.is_verified,
      isBusinessAccount: follower.is_business,
      followerCount: follower.follower_count || 0,
      followingCount: follower.following_count || 0,
      postCount: follower.media_count || 0
    }));

  } catch (error) {
    console.error(`Failed to get followers for ${competitorUsername}:`, error);
    throw error;
  }
}
```

### **2. Follow/Unfollow Users**

```typescript
async followUser(accountId: string, targetUsername: string): Promise<boolean> {
  try {
    const ig = this.igClients.get(accountId);
    if (!ig) throw new Error(`No Instagram session for account ${accountId}`);

    // Get target user ID
    const user = await ig.user.searchExact(targetUsername);
    if (!user) throw new Error(`User ${targetUsername} not found`);

    // Follow the user
    await ig.friendship.create(user.pk);
    
    console.log(`✅ Successfully followed ${targetUsername}`);
    return true;

  } catch (error) {
    console.error(`Failed to follow ${targetUsername}:`, error);
    return false;
  }
}

async unfollowUser(accountId: string, targetUsername: string): Promise<boolean> {
  try {
    const ig = this.igClients.get(accountId);
    if (!ig) throw new Error(`No Instagram session for account ${accountId}`);

    const user = await ig.user.searchExact(targetUsername);
    if (!user) throw new Error(`User ${targetUsername} not found`);

    // Unfollow the user
    await ig.friendship.destroy(user.pk);
    
    console.log(`✅ Successfully unfollowed ${targetUsername}`);
    return true;

  } catch (error) {
    console.error(`Failed to unfollow ${targetUsername}:`, error);
    return false;
  }
}
```

### **3. Like Posts**

```typescript
async likePost(accountId: string, postId: string): Promise<boolean> {
  try {
    const ig = this.igClients.get(accountId);
    if (!ig) throw new Error(`No Instagram session for account ${accountId}`);

    // Like the post
    await ig.media.like({ mediaId: postId });
    
    console.log(`❤️ Successfully liked post ${postId}`);
    return true;

  } catch (error) {
    console.error(`Failed to like post ${postId}:`, error);
    return false;
  }
}

async getUserRecentPosts(username: string, accountId: string): Promise<PostData[]> {
  try {
    const ig = this.igClients.get(accountId);
    if (!ig) throw new Error(`No Instagram session for account ${accountId}`);

    // Get user
    const user = await ig.user.searchExact(username);
    if (!user) throw new Error(`User ${username} not found`);

    // Get user's media feed
    const userFeed = ig.feed.user(user.pk);
    const posts = await userFeed.items();

    return posts.slice(0, 3).map(post => ({
      id: post.id,
      url: `https://instagram.com/p/${post.code}`,
      caption: post.caption?.text || '',
      timestamp: new Date(post.taken_at * 1000),
      likeCount: post.like_count,
      commentCount: post.comment_count
    }));

  } catch (error) {
    console.error(`Failed to get posts for ${username}:`, error);
    return [];
  }
}
```

### **4. Comment on Posts**

```typescript
async commentOnPost(accountId: string, postId: string, comment: string): Promise<boolean> {
  try {
    const ig = this.igClients.get(accountId);
    if (!ig) throw new Error(`No Instagram session for account ${accountId}`);

    // Comment on the post
    await ig.media.comment({ mediaId: postId, text: comment });
    
    console.log(`💬 Successfully commented on post ${postId}: "${comment}"`);
    return true;

  } catch (error) {
    console.error(`Failed to comment on post ${postId}:`, error);
    return false;
  }
}
```

### **5. Story Interactions**

```typescript
async getUserStories(username: string, accountId: string): Promise<StoryData[]> {
  try {
    const ig = this.igClients.get(accountId);
    if (!ig) throw new Error(`No Instagram session for account ${accountId}`);

    const user = await ig.user.searchExact(username);
    if (!user) throw new Error(`User ${username} not found`);

    // Get user's story reel
    const reelsFeed = ig.feed.reelsMedia({ userIds: [user.pk] });
    const reels = await reelsFeed.items();

    if (reels.length === 0) return [];

    const stories = reels[0].items || [];
    
    return stories.map(story => ({
      id: story.id,
      url: story.image_versions2?.candidates?.[0]?.url || '',
      timestamp: new Date(story.taken_at * 1000),
      expiringAt: new Date(story.expiring_at * 1000)
    }));

  } catch (error) {
    console.error(`Failed to get stories for ${username}:`, error);
    return [];
  }
}

async viewStory(accountId: string, storyId: string): Promise<boolean> {
  try {
    const ig = this.igClients.get(accountId);
    if (!ig) throw new Error(`No Instagram session for account ${accountId}`);

    // Mark story as seen
    await ig.story.seen([storyId]);
    
    console.log(`👀 Successfully viewed story ${storyId}`);
    return true;

  } catch (error) {
    console.error(`Failed to view story ${storyId}:`, error);
    return false;
  }
}
```

### **6. Close Friends Management**

```typescript
async addToCloseFriends(accountId: string, targetUsername: string): Promise<boolean> {
  try {
    const ig = this.igClients.get(accountId);
    if (!ig) throw new Error(`No Instagram session for account ${accountId}`);

    const user = await ig.user.searchExact(targetUsername);
    if (!user) throw new Error(`User ${targetUsername} not found`);

    // Add to close friends (this requires special permissions)
    await ig.friendship.setCloseFriend(user.pk);
    
    console.log(`⭐ Successfully added ${targetUsername} to close friends`);
    return true;

  } catch (error) {
    console.error(`Failed to add ${targetUsername} to close friends:`, error);
    return false;
  }
}
```

## 🔒 **Authentication & Security**

### **1. Account Credentials**

```typescript
interface InstagramCredentials {
  username: string;
  password: string;
  twoFactorCode?: string; // If 2FA is enabled
}

// Store encrypted in database
const account = {
  username: 'your_account',
  password: encrypt('your_password'), // Always encrypt passwords
  proxyId: 'proxy_1' // For different IP
};
```

### **2. Session Management**

```typescript
// Save/restore Instagram sessions to avoid repeated logins
async saveSession(accountId: string): Promise<void> {
  const ig = this.igClients.get(accountId);
  if (!ig) return;

  // Serialize session state
  const sessionData = await ig.state.serialize();
  
  // Save to database (encrypted)
  await this.dbManager.saveSession(accountId, encrypt(sessionData));
}

async restoreSession(accountId: string): Promise<boolean> {
  try {
    const sessionData = await this.dbManager.getSession(accountId);
    if (!sessionData) return false;

    const ig = new IgApiClient();
    
    // Restore session state
    await ig.state.deserialize(decrypt(sessionData));
    
    this.igClients.set(accountId, ig);
    return true;

  } catch (error) {
    console.error(`Failed to restore session for ${accountId}:`, error);
    return false;
  }
}
```

## 🌐 **Proxy Integration**

```typescript
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

async initializeWithProxy(account: InstagramAccount): Promise<boolean> {
  const ig = new IgApiClient();
  
  if (account.proxyId) {
    const proxy = await this.dbManager.getProxy(account.proxyId);
    
    // Create proxy agent
    let proxyAgent;
    if (proxy.type === 'socks5') {
      proxyAgent = new SocksProxyAgent(`socks5://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`);
    } else {
      proxyAgent = new HttpsProxyAgent(`http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`);
    }
    
    // Set proxy for all requests
    ig.request.defaults.agent = proxyAgent;
    console.log(`🌐 Using proxy ${proxy.host}:${proxy.port} for ${account.username}`);
  }
  
  // Continue with authentication...
}
```

## ⚠️ **Rate Limiting & Safety**

```typescript
class InstagramRateLimit {
  private actionCounts: Map<string, { [key: string]: number }> = new Map();
  
  // Instagram's actual limits (approximate)
  private limits = {
    follows: { hourly: 60, daily: 400 },
    likes: { hourly: 350, daily: 1000 },
    comments: { hourly: 30, daily: 100 },
    unfollows: { hourly: 60, daily: 400 }
  };
  
  async canPerformAction(accountId: string, action: string): Promise<boolean> {
    const counts = this.actionCounts.get(accountId) || {};
    const limit = this.limits[action];
    
    return counts[action] < limit.hourly;
  }
  
  // Add delays between actions (30-120 seconds)
  async delay(): Promise<void> {
    const delay = Math.random() * 90000 + 30000; // 30-120 seconds
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
```

## 📦 **Installation & Setup**

### **1. Install Dependencies**

```bash
npm install instagram-private-api
npm install socks-proxy-agent https-proxy-agent
npm install crypto-js  # For encryption
```

### **2. Environment Configuration**

```env
# .env
INSTAGRAM_API_ENABLED=true
ENCRYPTION_KEY=your_secret_key_for_encrypting_passwords
SESSION_STORAGE_PATH=./instagram_sessions
```

### **3. Replace Mock Implementation**

```typescript
// In InstagramBot.ts - replace the mock code with real API calls
async getCompetitorFollowersList(
  competitorUsername: string, 
  accountId: string, 
  limit: number = 500
): Promise<FollowerData[]> {
  // Remove the mock implementation
  // Add the real Instagram API code shown above
}
```

## 🚀 **Production Considerations**

### **1. Account Health**
- **Warm up new accounts** gradually (start with 10-20 actions/day)
- **Use phone verification** for better account trust
- **Rotate between accounts** to distribute actions

### **2. Error Handling**
- **Challenge responses** (when Instagram asks for verification)
- **Temporary blocks** (wait and retry with longer delays)
- **Session invalidation** (re-authenticate when needed)

### **3. Monitoring**
- **Track success rates** per account
- **Monitor for unusual activity** flags
- **Log all API interactions** for debugging

## ⚡ **Real vs Mock Implementation**

**Current (Mock):**
```typescript
// Returns fake data for demonstration
const mockFollowers = [
  { username: 'fake_user_1', followerCount: 1000 },
  { username: 'fake_user_2', followerCount: 2000 }
];
```

**Real Implementation:**
```typescript
// Gets actual Instagram data
const ig = this.igClients.get(accountId);
const user = await ig.user.searchExact(competitorUsername);
const followersFeed = ig.feed.accountFollowers(user.pk);
const realFollowers = await followersFeed.items();
```

**To activate real Instagram API**, simply replace the mock functions with the real implementations shown above!

---

## 🎯 **Ready to Go Live?**

1. **Install** `instagram-private-api`
2. **Replace** mock functions with real API calls
3. **Add** your Instagram account credentials
4. **Configure** proxies for different IP addresses
5. **Start** monitoring competitors with real data!

The system architecture is already built - you just need to swap out the mock Instagram API calls with real ones! 🚀