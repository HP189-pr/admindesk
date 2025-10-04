import React, { useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const SERVICES = [
  { key: 'ENROLLMENT', label: 'Enrollment' },
  { key: 'MIGRATION', label: 'Migration' },
  { key: 'VERIFICATION', label: 'Verification' },
  { key: 'PROVISIONAL', label: 'Provisional' },
];

export default function DataAnalysis() {
  const { token } = useAuth();
  const [service, setService] = useState('ENROLLMENT');
  const [report, setReport] = useState(null);
  const apiBase = '/api';

  const runAnalysis = async () => {
    try {
      const res = await fetch(`${apiBase}/data-analysis/?service=${service}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setReport(data);
    } catch (e) {
      alert('Failed: ' + e.message);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <label className="font-semibold">Service:</label>
        <select value={service} onChange={(e) => setService(e.target.value)} className="border rounded p-1 text-black">
          {SERVICES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <button onClick={runAnalysis} className="ml-2 px-3 py-1 bg-blue-600 text-white rounded">Run Analysis</button>
      </div>

      {report && (
        <div className="space-y-3">
          <div>
            <div className="text-sm">Total issues: {report.summary?.total_issues}</div>
            <div className="text-sm">By type:</div>
            <ul className="list-disc ml-6 text-sm">
              {report.summary && report.summary.by_type && Object.entries(report.summary.by_type).map(([k, v]) => (
                <li key={k}>{k}: {v}</li>
              ))}
            </ul>
          </div>
          <div className="bg-gray-800 rounded p-3 overflow-auto" style={{ maxHeight: 320 }}>
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">Type</th>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">Key</th>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">Message</th>
                </tr>
              </thead>
              <tbody>
                {report.issues?.map((it, i) => (
                  <tr key={i} className="border-b border-gray-700">
                    <td className="pr-4 py-1">{it.type}</td>
                    <td className="pr-4 py-1">{it.key}</td>
                    <td className="pr-4 py-1">{it.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
