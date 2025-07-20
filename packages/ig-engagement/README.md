# Instagram Engagement Automation Bot

🤖 **Advanced Instagram engagement automation software** that monitors competitors, automatically engages with their followers, and tracks comprehensive daily engagement statistics.

## 🚀 Key Features

### 📊 **Daily Engagement Tracking**
- **Set daily engagement limits** (e.g., 3,000 engagements per day)
- **Real-time tracking** of all engagement activities
- **Profile-specific engagement limits** (e.g., engage with each profile 3 times)
- **Comprehensive daily reports** showing exact engagement counts
- **Live progress monitoring** towards daily goals

### 🎯 **Competitor Monitoring**
- **Monitor unlimited competitors** and their followers
- **Real-time follower tracking** - when someone follows your competitor
- **Automatic discovery** of new potential targets
- **Smart filtering** by follower count, account type, verification status

### ⚡ **Smart Engagement Automation**
- **Auto-follow** competitor followers
- **Auto-like** recent posts (1-3 posts per profile)
- **Auto-comment** with randomized messages
- **Story engagement** - view and comment on stories
- **Close friends management** - automatically add engaged users
- **Scheduled unfollows** after preset time periods

### 🔗 **Multi-Account & Proxy Support**
- **Manage multiple Instagram accounts** simultaneously
- **Different IP addresses** (proxy support) for each account
- **Account-specific engagement limits** and settings
- **Proxy rotation** and IP management

### 📈 **Advanced Analytics**
- **Daily engagement statistics** (follows, likes, comments, story views)
- **Profile engagement tracking** (how many times you've engaged with each user)
- **Campaign performance metrics**
- **Success/failure rates** and error tracking
- **Real-time dashboard** with live statistics

## 🎮 **How It Works**

### 1. **Competitor Setup**
```
Add competitors to monitor:
- @competitor1 (Fashion influencer)
- @competitor2 (Fitness brand)
- @competitor3 (Similar business)
```

### 2. **Engagement Configuration**
```json
{
  "maxEngagementsPerDay": 3000,
  "maxFollowsPerDay": 400,
  "maxLikesPerDay": 1200,
  "maxCommentsPerDay": 200,
  "maxStoryViewsPerDay": 800,
  "maxStoryCommentsPerDay": 100,
  
  "engagementsPerProfile": 3,
  "profileEngagementSpread": 8,
  
  "workingHours": { "start": 8, "end": 22 },
  "unfollowAfter": 72,
  
  "commentMessages": [
    "Love this! 😍",
    "Amazing content! 🔥",
    "So inspiring! ✨"
  ],
  
  "storyComments": [
    "🔥🔥🔥",
    "Love this!",
    "Amazing! ✨"
  ]
}
```

### 3. **Automated Workflow**

#### **Target Discovery**
1. Monitor competitor followers in real-time
2. When someone follows your competitor:
   - Extract their profile information
   - Check if they meet your criteria (follower count, account type)
   - Add them to engagement queue

#### **Smart Engagement Sequence**
For each new target, the bot will:

1. **🔍 Profile Analysis**
   - Check follower/following ratio
   - Verify account meets criteria
   - Check if already engaged (max 3 times per profile)

2. **❤️ Post Engagement**
   - Like 1-3 recent posts
   - Add random delays (30-120 seconds between actions)
   - Track each like in daily stats

3. **👀 Story Engagement**
   - View their stories
   - 30% chance to comment on stories
   - Track story views and comments

4. **👥 Follow Action**
   - Follow the user
   - Set automatic unfollow timer (e.g., 72 hours)
   - Track follow in daily stats

5. **💬 Comment Engagement**
   - Comment on their recent post
   - Use randomized messages
   - Track comment in daily stats

6. **⭐ Close Friends**
   - Add to close friends list
   - Track addition in daily stats

### 4. **Daily Tracking Example**

```
📊 Daily Engagement Report - March 15, 2024

Account: @mybusiness_account
├── Total Engagements: 2,847 / 3,000 (94.9%)
├── Follows: 387 / 400 (96.8%)
├── Likes: 1,156 / 1,200 (96.3%)
├── Comments: 194 / 200 (97%)
├── Story Views: 763 / 800 (95.4%)
├── Story Comments: 89 / 100 (89%)
├── Close Friends Added: 387
├── Profiles Engaged: 387
└── Errors: 12

🎯 Target: 153 engagements remaining
⏰ Time: 14:30 (7.5 hours remaining)
📈 Pace: On track to reach 3,000 engagements
```

## 🛠️ **Configuration Options**

### **Daily Limits**
- `maxEngagementsPerDay`: Total daily engagement limit (e.g., 3000)
- `maxFollowsPerDay`: Maximum follows per day (e.g., 400)
- `maxLikesPerDay`: Maximum likes per day (e.g., 1200)
- `maxCommentsPerDay`: Maximum comments per day (e.g., 200)
- `maxStoryViewsPerDay`: Maximum story views per day (e.g., 800)
- `maxStoryCommentsPerDay`: Maximum story comments per day (e.g., 100)

### **Profile Engagement**
- `engagementsPerProfile`: How many times to engage with each profile (e.g., 3)
- `profileEngagementSpread`: Hours to spread engagements across (e.g., 8)

### **Timing & Delays**
- `workingHours`: Active hours (e.g., 8 AM to 10 PM)
- `followDelay`: Delay between follows (30-120 seconds)
- `likeDelay`: Delay between likes (15-45 seconds)
- `commentDelay`: Delay between comments (60-180 seconds)
- `unfollowAfter`: Hours before auto-unfollow (e.g., 72)

### **Targeting Filters**
- `minFollowers`: Minimum follower count (e.g., 100)
- `maxFollowers`: Maximum follower count (e.g., 50000)
- `skipBusinessAccounts`: Skip business accounts (true/false)
- `skipVerifiedAccounts`: Skip verified accounts (true/false)

## 📱 **Multi-Account Management**

```json
{
  "accounts": [
    {
      "username": "@account1",
      "dailyLimit": 3000,
      "proxy": "proxy1",
      "competitors": ["@competitor1", "@competitor2"]
    },
    {
      "username": "@account2", 
      "dailyLimit": 2500,
      "proxy": "proxy2",
      "competitors": ["@competitor3", "@competitor4"]
    }
  ]
}
```

## 🔗 **Proxy Configuration**

```json
{
  "proxies": [
    {
      "name": "US-Proxy-1",
      "host": "proxy1.example.com",
      "port": 8080,
      "username": "user1",
      "password": "pass1",
      "type": "http"
    }
  ]
}
```

## 📊 **Real-Time Dashboard**

The dashboard shows:
- **Live engagement counter** (updates every action)
- **Progress bars** for each engagement type
- **Hourly pace tracking** 
- **Account performance comparison**
- **Error monitoring and alerts**
- **Campaign status and controls**

## 🚀 **Quick Start**

### 1. Installation
```bash
cd packages/ig-engagement
npm install
```

### 2. Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

### 3. Start the Bot
```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

### 4. Access Dashboard
- Open `http://localhost:3002`
- Login with your credentials
- Add Instagram accounts and proxies
- Configure competitors and campaigns
- Start automation!

## ⚡ **API Endpoints**

### **Engagement Stats**
- `GET /api/analytics/daily/:accountId` - Get daily engagement stats
- `GET /api/analytics/summary` - Get summary across all accounts
- `POST /api/analytics/reset` - Reset daily stats

### **Campaign Management**
- `POST /api/campaigns` - Create new campaign
- `PUT /api/campaigns/:id/start` - Start campaign
- `PUT /api/campaigns/:id/stop` - Stop campaign
- `GET /api/campaigns/:id/stats` - Get campaign statistics

### **Real-Time Updates**
WebSocket events:
- `engagement-stats-update` - Real-time engagement updates
- `daily-engagement-completed` - Daily goal reached
- `campaign-started` - Campaign started
- `target-engaged` - New profile engaged

## ⚠️ **Important Notes**

### **Rate Limiting**
- Built-in Instagram rate limiting protection
- Smart delays between actions (randomized)
- Hourly and daily limits to prevent blocks
- Working hours configuration

### **Safety Features**
- Account health monitoring
- Error tracking and recovery
- Proxy rotation for IP diversity
- Human-like behavior patterns

### **Legal Compliance**
- Use responsibly and ethically
- Follow Instagram's Terms of Service
- Respect user privacy and consent
- Monitor for policy changes

## 📈 **Success Metrics**

Track your growth with:
- **Daily engagement targets** (e.g., 3,000 engagements)
- **Follow-back rates** from engaged profiles
- **Story engagement rates**
- **Profile visit increases**
- **Overall account growth**

## 🎯 **Use Cases**

Perfect for:
- **Influencers** wanting to grow their following
- **Small businesses** competing with larger brands
- **Marketing agencies** managing multiple clients
- **Personal brands** in competitive niches
- **E-commerce stores** targeting competitor customers

---

**Start growing your Instagram presence with intelligent automation! 🚀**