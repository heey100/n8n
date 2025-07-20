# Instagram Unified Inbox

A powerful unified inbox for managing multiple Instagram accounts with proxy support. This application allows you to:

- **Manage up to 10 Instagram accounts** from a single dashboard
- **Assign different IP addresses** (proxies) to each account
- **View all messages** in one unified inbox
- **Send and receive messages** in real-time
- **Monitor account status** and activity

## Features

- 📱 **Multi-Account Management**: Handle multiple Instagram accounts simultaneously
- 🔗 **Proxy Support**: Route each account through different IP addresses
- 💬 **Unified Inbox**: See all messages from all accounts in one place
- ⚡ **Real-time Updates**: Instant message synchronization with WebSockets
- 🔐 **Secure Authentication**: JWT-based user authentication
- 📊 **Dashboard Analytics**: Monitor account activity and message statistics

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Application
```bash
# Development mode (runs both server and client)
npm run dev

# Or run separately:
npm run dev:server  # Backend on port 3001
npm run dev:client  # Frontend on port 3000
```

### 3. Access the Application
- Open your browser to `http://localhost:3000`
- Create an account or login
- Add your Instagram accounts with optional proxy configurations

## Configuration

### Environment Variables
Create a `.env` file in the root directory:

```env
PORT=3001
JWT_SECRET=your-super-secret-jwt-key
NODE_ENV=development
```

### Database
The application uses SQLite by default. The database file will be created automatically in the `data/` directory.

## Usage

### Adding Instagram Accounts
1. Navigate to the "Accounts" section
2. Click "Add Account"
3. Enter your Instagram credentials
4. Optionally select a proxy for the account
5. The account will be authenticated and added to your dashboard

### Setting Up Proxies
1. Go to the "Proxies" section
2. Click "Add Proxy"
3. Configure your proxy settings:
   - Name: A friendly name for the proxy
   - Host: Proxy server IP/hostname
   - Port: Proxy server port
   - Type: HTTP, HTTPS, SOCKS4, or SOCKS5
   - Username/Password: If authentication is required

### Managing Messages
- **Unified Inbox**: View all messages from all accounts
- **Real-time Updates**: New messages appear instantly
- **Send Messages**: Reply to conversations directly from the interface
- **Account Filtering**: Filter messages by specific accounts

## API Endpoints

The application provides a REST API for programmatic access:

- `POST /api/auth/login` - User authentication
- `GET /api/accounts` - List Instagram accounts
- `POST /api/accounts` - Add new Instagram account
- `GET /api/messages` - Retrieve messages
- `POST /api/messages/send` - Send a message
- `GET /api/proxies` - List proxy configurations
- `POST /api/proxies` - Add new proxy

## Security Considerations

⚠️ **Important Security Notes:**
- Always use strong passwords for your accounts
- Keep your JWT secret secure
- Use HTTPS in production
- Consider using environment variables for sensitive data
- Instagram may detect unusual activity - use proxies responsibly

## Production Deployment

### Build for Production
```bash
npm run build
npm start
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

## Troubleshooting

### Common Issues

1. **Instagram Login Failed**
   - Check credentials
   - Instagram may require 2FA - this is not currently supported
   - Try using a proxy from a different location

2. **Proxy Connection Issues**
   - Verify proxy credentials and settings
   - Test proxy connectivity
   - Some proxies may be blocked by Instagram

3. **Database Errors**
   - Ensure the `data/` directory is writable
   - Check SQLite installation

## Legal Notice

This application is for educational and personal use only. Please ensure you comply with Instagram's Terms of Service and all applicable laws in your jurisdiction. The developers are not responsible for any misuse of this software.

## Support

For issues and questions, please check the troubleshooting section or create an issue in the repository.