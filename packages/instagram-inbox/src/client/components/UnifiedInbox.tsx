import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const UnifiedInbox: React.FC = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  const fetchMessages = async () => {
    try {
      const response = await fetch('/api/messages?limit=50', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">
          <i className="fas fa-spinner fa-spin text-2xl mr-2"></i>
          Loading messages...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">All Messages</h2>
        <p className="text-sm text-gray-600 mt-1">
          {messages.length} messages from all accounts
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <i className="fas fa-inbox text-4xl text-gray-300 mb-4"></i>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No messages yet</h3>
            <p className="text-gray-600">Add some Instagram accounts to start receiving messages.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message: any) => (
              <div
                key={message.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-red-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">
                        {message.accountUsername?.charAt(0).toUpperCase() || 'A'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">
                          @{message.accountUsername}
                        </span>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          message.direction === 'incoming' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {message.direction === 'incoming' ? 'Received' : 'Sent'}
                        </span>
                        {!message.isRead && message.direction === 'incoming' && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        )}
                      </div>
                      <p className="text-gray-700 mt-1">{message.content}</p>
                      <div className="flex items-center mt-2 text-xs text-gray-500">
                        <i className="fas fa-clock mr-1"></i>
                        {new Date(message.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedInbox;