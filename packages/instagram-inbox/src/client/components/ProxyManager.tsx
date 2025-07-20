import React from 'react';

const ProxyManager: React.FC = () => {
  return (
    <div className="h-full p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Proxy Management</h2>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          <i className="fas fa-plus mr-2"></i>
          Add Proxy
        </button>
      </div>

      <div className="text-center py-12">
        <i className="fas fa-globe text-4xl text-gray-300 mb-4"></i>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Proxy Configuration</h3>
        <p className="text-gray-600">Configure different IP addresses for your Instagram accounts.</p>
      </div>
    </div>
  );
};

export default ProxyManager;