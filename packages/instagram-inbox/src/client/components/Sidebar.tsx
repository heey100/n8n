import React from 'react';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  accounts: any[];
  unreadCount: number;
  isConnected: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onViewChange,
  accounts,
  unreadCount,
  isConnected
}) => {
  const menuItems = [
    { id: 'inbox', label: 'Unified Inbox', icon: 'fas fa-inbox', badge: unreadCount },
    { id: 'accounts', label: 'Accounts', icon: 'fab fa-instagram', badge: accounts.length },
    { id: 'proxies', label: 'Proxies', icon: 'fas fa-globe', badge: null },
    { id: 'settings', label: 'Settings', icon: 'fas fa-cog', badge: null },
  ];

  return (
    <div className="w-64 bg-white shadow-lg flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <i className="fab fa-instagram text-white text-xl"></i>
          </div>
          <div className="ml-3">
            <h1 className="text-lg font-semibold text-gray-900">IG Inbox</h1>
            <p className="text-xs text-gray-500">Unified Manager</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors ${
                  currentView === item.id
                    ? 'bg-purple-50 text-purple-700 border-r-2 border-purple-500'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <i className={`${item.icon} w-5 text-center mr-3`}></i>
                <span className="flex-1">{item.label}</span>
                {item.badge !== null && item.badge > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Account List */}
      <div className="p-4 border-t border-gray-200">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Active Accounts</h3>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {accounts.slice(0, 5).map((account) => (
            <div
              key={account.id}
              className="flex items-center p-2 bg-gray-50 rounded-lg"
            >
              <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {account.username.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  @{account.username}
                </p>
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-1 ${
                    account.isOnline ? 'bg-green-500' : 'bg-gray-400'
                  }`}></div>
                  <span className="text-xs text-gray-500">
                    {account.isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
              {account.proxy && (
                <i className="fas fa-globe text-xs text-blue-500" title="Using Proxy"></i>
              )}
            </div>
          ))}
          {accounts.length > 5 && (
            <div className="text-xs text-gray-500 text-center py-2">
              +{accounts.length - 5} more accounts
            </div>
          )}
          {accounts.length === 0 && (
            <div className="text-xs text-gray-500 text-center py-4">
              No accounts added yet
            </div>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2 ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className="text-xs text-gray-600">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {accounts.filter(acc => acc.isOnline).length}/{accounts.length} online
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;