import React, { useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import AdminBulkUpload from '../components/AdminBulkUpload.jsx';

const SERVICES = [
  { key: 'DOCREC', label: 'Document Received' },
  { key: 'ENROLLMENT', label: 'Enrollment' },
  { key: 'DEGREE', label: 'Degree' },
  { key: 'MIGRATION', label: 'Migration' },
  { key: 'VERIFICATION', label: 'Verification' },
  { key: 'PROVISIONAL', label: 'Provisional' },
  { key: 'STUDENT_FEES', label: 'Student Fees' },
  { key: 'STUDENT_PROFILE', label: 'Student Profile' },
  { key: 'INSTITUTIONAL_VERIFICATION', label: 'Institutional Verification' },
  { key: 'LEAVE', label: 'Leave Entry' },
  { key: 'EMP_PROFILE', label: 'EMP Profile' },
];

export default function AuthUpload() {
  // We don't expose token in context; read it at call time from localStorage
  const { user } = useAuth();
  const [service, setService] = useState('DEGREE');
  const [file, setFile] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [autoCreateDocRec, setAutoCreateDocRec] = useState(false);

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
      // Enable auto-create for both VERIFICATION and PROVISIONAL
      if ((service === 'VERIFICATION' || service === 'PROVISIONAL') && autoCreateDocRec) {
        fd.append('auto_create_docrec', '1');
      }
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

      <div>
        <AdminBulkUpload
          service={service}
          uploadApi="/api/bulk-upload/"
          sheetName={sheetName}
          onServiceChange={setService}
        />
      </div>
    </div>
  );
}
