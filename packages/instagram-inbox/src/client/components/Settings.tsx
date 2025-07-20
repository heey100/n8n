import React from 'react';

const Settings: React.FC = () => {
  return (
    <div className="h-full p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Settings</h2>

      <div className="text-center py-12">
        <i className="fas fa-cog text-4xl text-gray-300 mb-4"></i>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Application Settings</h3>
        <p className="text-gray-600">Configure your Instagram unified inbox preferences.</p>
      </div>
    </div>
  );
};

export default Settings;