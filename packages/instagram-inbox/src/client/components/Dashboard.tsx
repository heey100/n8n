import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import Sidebar from './Sidebar';
import UnifiedInbox from './UnifiedInbox';
import AccountManager from './AccountManager';
import ProxyManager from './ProxyManager';
import Settings from './Settings';

type ViewType = 'inbox' | 'accounts' | 'proxies' | 'settings';

const Dashboard: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewType>('inbox');
  const [accounts, setAccounts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { user, logout, token } = useAuth();
  const { socket, isConnected } = useSocket();

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/accounts', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setAccounts(data);
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await fetch('/api/messages/unread/count', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.totalUnread);
      }
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchUnreadCount();
  }, [token]);

  useEffect(() => {
    if (socket) {
      socket.on('new-message', () => {
        fetchUnreadCount();
      });

      socket.on('message-sent', () => {
        fetchUnreadCount();
      });

      return () => {
        socket.off('new-message');
        socket.off('message-sent');
      };
    }
  }, [socket]);

  const renderView = () => {
    switch (currentView) {
      case 'inbox':
        return <UnifiedInbox />;
      case 'accounts':
        return <AccountManager onAccountsUpdate={fetchAccounts} />;
      case 'proxies':
        return <ProxyManager />;
      case 'settings':
        return <Settings />;
      default:
        return <UnifiedInbox />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        accounts={accounts}
        unreadCount={unreadCount}
        isConnected={isConnected}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <h1 className="text-2xl font-semibold text-gray-900 capitalize">
                {currentView === 'inbox' ? 'Unified Inbox' : currentView}
              </h1>
              {currentView === 'inbox' && unreadCount > 0 && (
                <span className="ml-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Welcome, {user?.username}</span>
                <button
                  onClick={logout}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  <i className="fas fa-sign-out-alt"></i>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          {renderView()}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;