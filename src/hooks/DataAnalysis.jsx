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
  const [duplicates, setDuplicates] = useState(null); // list of records for a selected duplicate key
  const [selectedIds, setSelectedIds] = useState(new Set());
  const apiBase = '/api';

  const runAnalysis = async () => {
    try {
      const res = await fetch(`${apiBase}/data-analysis/?service=${service}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setReport(data);
      setDuplicates(null);
      setSelectedIds(new Set());
    } catch (e) {
      alert('Failed: ' + e.message);
    }
  };

  const loadRecordsForKey = async (key) => {
    try {
      setDuplicates(null);
      setSelectedIds(new Set());
      const res = await fetch(`${apiBase}/provisional/?search=${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch records');
      const data = await res.json();
      setDuplicates(data.results || data);
    } catch (e) {
      alert('Failed to load records: ' + e.message);
    }
  };

  const toggleSelect = (id) => {
    const s = new Set(selectedIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedIds(s);
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return alert('No rows selected');
    if (!confirm(`Delete ${selectedIds.size} selected provisional record(s)? This cannot be undone.`)) return;
    try {
      for (const id of Array.from(selectedIds)) {
        const res = await fetch(`${apiBase}/provisional/${id}/`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) console.warn('Failed to delete', id, await res.text());
      }
      // refresh list and analysis
      setSelectedIds(new Set());
      if (duplicates && duplicates.length) {
        const key = duplicates[0].prv_number || '';
        await loadRecordsForKey(key);
      }
      await runAnalysis();
    } catch (e) { alert('Delete error: '+e.message); }
  };

  const deleteDuplicatesKeepOne = async (key) => {
    if (!confirm(`Delete duplicate provisional records for '${key}', keeping one record?`)) return;
    try {
      const res = await fetch(`${apiBase}/provisional/?search=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const rows = data.results || data;
      if (!rows || rows.length <= 1) return alert('No duplicates found');
      // keep first, delete rest
      for (let i = 1; i < rows.length; i++) {
        const id = rows[i].id;
        const dres = await fetch(`${apiBase}/provisional/${id}/`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        if (!dres.ok) console.warn('Failed to delete', id, await dres.text());
      }
      await runAnalysis();
      // if the duplicates view was open for this key, reload it
      if (duplicates && duplicates.length && (duplicates[0].prv_number === key)) await loadRecordsForKey(key);
    } catch (e) { alert('Error deleting duplicates: '+e.message); }
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
                    <td className="pl-4 py-1">
                      {service === 'PROVISIONAL' && (it.type?.includes('DUPLICATE') || it.type === 'DUPLICATE_PRV_NUMBER') && (
                        <div className="flex gap-2">
                          <button onClick={() => loadRecordsForKey(it.key)} className="px-2 py-0.5 bg-green-600 text-white rounded text-xs">View</button>
                          <button onClick={() => deleteDuplicatesKeepOne(it.key)} className="px-2 py-0.5 bg-red-600 text-white rounded text-xs">Delete dup (keep 1)</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {duplicates && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Duplicate records ({duplicates.length})</div>
            <div className="flex gap-2">
              <button onClick={deleteSelected} className="px-3 py-1 bg-red-600 text-white rounded">Delete selected</button>
            </div>
          </div>
          <div className="bg-gray-800 rounded p-3 overflow-auto" style={{ maxHeight: 320 }}>
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">#</th>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">Sel</th>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">ID</th>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">prv_number</th>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">doc_rec_id</th>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">enrollment_no</th>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">student_name</th>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">prv_date</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.map((r, i) => (
                  <tr key={r.id} className="border-b border-gray-700">
                    <td className="pr-4 py-1">{i+1}</td>
                    <td className="pr-4 py-1"><input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                    <td className="pr-4 py-1">{r.id}</td>
                    <td className="pr-4 py-1">{r.prv_number}</td>
                    <td className="pr-4 py-1">{r.doc_rec_id || r.doc_rec || ''}</td>
                    <td className="pr-4 py-1">{r.enrollment_no || r.enrollment || ''}</td>
                    <td className="pr-4 py-1">{r.student_name}</td>
                    <td className="pr-4 py-1">{r.prv_date}</td>
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
