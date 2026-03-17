import React, { useState } from 'react';
import EnrollmentState from '../utils/EnrollmentState';

const Record = () => {
  const [activeTab, setActiveTab] = useState('Enrollment');

  return (
    <div className="flex h-full flex-col bg-slate-100 p-4 md:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 pt-5 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-slate-800">Office Records</h1>
        <div className="mt-4 flex items-center gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('Enrollment')}
            className={`-mb-px rounded-t-xl px-4 py-2.5 text-sm font-medium transition-colors duration-200 ${
              activeTab === 'Enrollment'
                ? 'border border-slate-200 border-b-white bg-white font-semibold text-blue-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Enrollment State
          </button>
        </div>
      </div>

      <div className="mt-4 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-full overflow-auto p-4 md:p-5">
          {activeTab === 'Enrollment' && <EnrollmentState />}
        </div>
      </div>
    </div>
  );
};

export default Record;