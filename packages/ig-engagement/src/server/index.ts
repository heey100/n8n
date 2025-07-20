import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';

import { DatabaseManager } from './services/DatabaseManager';
import { InstagramBot } from './services/InstagramBot';
import { CompetitorMonitor } from './services/CompetitorMonitor';
import { EngagementEngine } from './services/EngagementEngine';
import { ProxyManager } from './services/ProxyManager';

import authRoutes from './routes/auth';
import accountRoutes from './routes/accounts';
import competitorRoutes from './routes/competitors';
import campaignRoutes from './routes/campaigns';
import analyticsRoutes from './routes/analytics';
import settingsRoutes from './routes/settings';

import { authenticateToken } from './middleware/auth';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3002;

// Initialize core services
const dbManager = new DatabaseManager();
const proxyManager = new ProxyManager();
const instagramBot = new InstagramBot(proxyManager, io);
const competitorMonitor = new CompetitorMonitor(instagramBot, dbManager, io);
const engagementEngine = new EngagementEngine(instagramBot, dbManager, io);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client')));
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', authenticateToken, accountRoutes);
app.use('/api/competitors', authenticateToken, competitorRoutes);
app.use('/api/campaigns', authenticateToken, campaignRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);
app.use('/api/settings', authenticateToken, settingsRoutes);

// WebSocket handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('start-monitoring', (data) => {
    competitorMonitor.startMonitoring(data.competitorUsername, data.accountId);
  });
  
  socket.on('stop-monitoring', (data) => {
    competitorMonitor.stopMonitoring(data.competitorUsername);
  });
  
  socket.on('start-campaign', (data) => {
    engagementEngine.startCampaign(data.campaignId);
  });
  
  socket.on('stop-campaign', (data) => {
    engagementEngine.stopCampaign(data.campaignId);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Instagram Engagement Bot'
  });
});

// Catch-all handler for production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
  });
}

// Scheduled tasks
function setupCronJobs() {
  // Run competitor monitoring every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('🔍 Running scheduled competitor monitoring...');
    await competitorMonitor.runAllMonitoring();
  });

  // Run engagement campaigns every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('🚀 Running scheduled engagement campaigns...');
    await engagementEngine.runActiveCampaigns();
  });

  // Run unfollow cleanup every hour
  cron.schedule('0 * * * *', async () => {
    console.log('🧹 Running scheduled unfollow cleanup...');
    await engagementEngine.runUnfollowCleanup();
  });

  // Daily analytics update at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('📊 Running daily analytics update...');
    await engagementEngine.updateDailyStats();
  });
}

// Initialize and start server
async function startServer() {
  try {
    await dbManager.initialize();
    
    // Load proxies
    const proxies = await dbManager.getAllProxies();
    proxyManager.loadProxiesFromDB(proxies);
    
    // Initialize Instagram accounts
    await instagramBot.initializeAllAccounts();
    
    // Setup scheduled tasks
    setupCronJobs();
    
    server.listen(PORT, () => {
      console.log(`🤖 Instagram Engagement Bot running on port ${PORT}`);
      console.log(`🔗 Loaded ${proxies.filter(p => p.isActive).length} active proxies`);
      console.log(`📱 Initialized ${instagramBot.getActiveAccounts().length} Instagram accounts`);
      console.log(`⚡ Automation engine is ready!`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();