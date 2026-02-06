import React, { useState } from 'react';
import EnrollmentState from '../utils/EnrollmentState';

const Record = () => {
  const [activeTab, setActiveTab] = useState('Enrollment');

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Page Header & Tabs */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-6 pt-5">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Office Records</h1>
        <div className="flex space-x-6">
          <button
            onClick={() => setActiveTab('Enrollment')}
            className={`pb-3 px-2 text-sm font-medium transition-colors duration-200 ${
              activeTab === 'Enrollment'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Enrollment State
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'Enrollment' && <EnrollmentState />}
      </div>
    </div>
  );
};

export default Record;