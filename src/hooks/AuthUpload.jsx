import React, { useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const SERVICES = [
  { key: 'DOCREC', label: 'Document Received' },
  { key: 'ENROLLMENT', label: 'Enrollment' },
  { key: 'DEGREE', label: 'Degree' },
  { key: 'MIGRATION', label: 'Migration' },
  { key: 'VERIFICATION', label: 'Verification' },
  { key: 'PROVISIONAL', label: 'Provisional' },
];

export default function AuthUpload() {
  // We don't expose token in context; read it at call time from localStorage
  const { user } = useAuth();
  const [service, setService] = useState('ENROLLMENT');
  const [file, setFile] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const apiBase = '/api';

  const downloadTemplate = async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      alert('You must be logged in to download templates.');
      return;
    }
    try {
      const url = `${apiBase}/bulk-upload/?service=${service}${sheetName ? `&sheet_name=${encodeURIComponent(sheetName)}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        // Try to extract server error details
        const ct = res.headers.get('content-type') || '';
        const errMsg = ct.includes('application/json') ? JSON.stringify(await res.json()) : await res.text();
        throw new Error(`Download failed (${res.status}): ${errMsg}`);
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      const objectUrl = window.URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = `template_${service.toLowerCase()}${sheetName ? `_${sheetName}` : ''}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(objectUrl);
    } catch (e) {
      alert('Failed to download template: ' + e.message);
    }
  };

  const onPreview = async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      alert('You must be logged in to preview uploads.');
      return;
    }
    if (!file) return alert('Select a file');
    const fd = new FormData();
    fd.append('service', service);
      if (sheetName) fd.append('sheet_name', sheetName);
    fd.append('file', file);
    try {
      const res = await fetch(`${apiBase}/bulk-upload/?action=preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const ct = res.headers.get('content-type') || '';
        const errMsg = ct.includes('application/json') ? JSON.stringify(await res.json()) : await res.text();
        throw new Error(`Preview failed (${res.status}): ${errMsg}`);
      }
      const data = await res.json();
      setPreview(data);
    } catch (e) {
      alert(e.message);
    }
  };

  const onUpload = async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      alert('You must be logged in to upload.');
      return;
    }
    if (!file) return alert('Select a file');
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('service', service);
        if (sheetName) fd.append('sheet_name', sheetName);
      fd.append('file', file);
      const res = await fetch(`${apiBase}/bulk-upload/?action=confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const ct = res.headers.get('content-type') || '';
        const errMsg = ct.includes('application/json') ? JSON.stringify(await res.json()) : await res.text();
        throw new Error(`Upload failed (${res.status}): ${errMsg}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      alert('Upload failed: ' + e.message);
    } finally {
      setUploading(false);
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
        <label className="ml-3 font-semibold">Sheet Name:</label>
        <input value={sheetName} onChange={(e) => setSheetName(e.target.value)} placeholder="Optional" className="border rounded p-1 text-black" />
        <button onClick={downloadTemplate} className="ml-2 px-3 py-1 bg-blue-600 text-white rounded">Download Sample</button>
      </div>

      <div className="flex items-center gap-2">
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button onClick={onPreview} className="px-3 py-1 bg-gray-700 text-white rounded">Preview</button>
        <button onClick={onUpload} disabled={uploading} className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-50">
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        {uploading && (
          <span className="ml-2 animate-spin inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
        )}
      </div>

      {preview && (
        <div className="bg-gray-800 rounded p-3 overflow-auto" style={{ maxHeight: 280 }}>
          <div className="text-sm mb-2">Sheet: {preview.sheet} | Total rows: {preview.count}</div>
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                {preview.preview[0] && Object.keys(preview.preview[0]).map((k) => (
                  <th key={k} className="text-left pr-4 pb-1 border-b border-gray-700">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.preview.map((row, i) => (
                <tr key={i} className="border-b border-gray-700">
                  {Object.values(row).map((v, j) => (
                    <td key={j} className="pr-4 py-1">{String(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="text-sm">OK: {result.summary?.ok} | Fail: {result.summary?.fail} | Total: {result.summary?.total}</div>
          {result.log_url && (
            <a href={result.log_url} target="_blank" rel="noreferrer" className="text-blue-400 underline">Download Log</a>
          )}
          <div className="bg-gray-800 rounded p-3 overflow-auto" style={{ maxHeight: 220 }}>
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">Row</th>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">Key</th>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">Status</th>
                  <th className="text-left pr-4 pb-1 border-b border-gray-700">Message</th>
                </tr>
              </thead>
              <tbody>
                {result.results?.map((r, i) => (
                  <tr key={i} className="border-b border-gray-700">
                    <td className="pr-4 py-1">{r.row}</td>
                    <td className="pr-4 py-1">{r.key}</td>
                    <td className="pr-4 py-1">{r.status}</td>
                    <td className="pr-4 py-1">{r.message}</td>
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
