import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { InstagramManager } from './services/InstagramManager';
import { DatabaseManager } from './services/DatabaseManager';
import { ProxyManager } from './services/ProxyManager';
import accountRoutes, { initializeManagers } from './routes/accounts';
import messageRoutes, { initializeInstagramManager } from './routes/messages';
import proxyRoutes, { initializeProxyManager } from './routes/proxies';
import authRoutes from './routes/auth';
import { authenticateToken } from './middleware/auth';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

// Initialize managers
const dbManager = new DatabaseManager();
const proxyManager = new ProxyManager();
const instagramManager = new InstagramManager(proxyManager, io);

// Initialize route managers
initializeManagers(instagramManager, proxyManager);
initializeInstagramManager(instagramManager);
initializeProxyManager(proxyManager);

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
app.use('/api/messages', authenticateToken, messageRoutes);
app.use('/api/proxies', authenticateToken, proxyRoutes);

// WebSocket handling
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  // Add token verification here
  next();
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-account', (accountId: string) => {
    socket.join(`account-${accountId}`);
  });
  
  socket.on('send-message', async (data) => {
    try {
      await instagramManager.sendMessage(data.accountId, data.recipientId, data.message);
    } catch (error) {
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Catch-all handler for production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
  });
}

// Initialize database and start server
async function startServer() {
  try {
    await dbManager.initialize();
    
    // Load proxies from database
    const proxies = await dbManager.getAllProxies();
    proxyManager.loadProxiesFromDB(proxies);
    
    // Initialize Instagram accounts
    await instagramManager.initializeAllAccounts();
    
    server.listen(PORT, () => {
      console.log(`🚀 Instagram Inbox server running on port ${PORT}`);
      console.log(`📱 Managing Instagram accounts with proxy support`);
      console.log(`🔗 Loaded ${proxies.filter(p => p.isActive).length} active proxies`);
      console.log(`📊 Initialized ${instagramManager.getActiveAccounts().length} active Instagram accounts`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();