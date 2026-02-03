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
  const { user } = useAuth();

  const [service, setService] = useState('DEGREE');
  const [file, setFile] = useState(null); // kept for backward compatibility
  const [sheetName, setSheetName] = useState('');
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [autoCreateDocRec, setAutoCreateDocRec] = useState(false);

  const apiBase = '/api';

  /* ===================== DOWNLOAD TEMPLATE ===================== */

  const downloadTemplate = async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      alert('You must be logged in to download templates.');
      return;
    }

    try {
      const query =
        `${apiBase}/bulk-upload/?service=${service}` +
        (sheetName ? `&sheet_name=${encodeURIComponent(sheetName)}` : '');

      const res = await fetch(query, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const ct = res.headers.get('content-type') || '';
        const errMsg = ct.includes('application/json')
          ? JSON.stringify(await res.json())
          : await res.text();
        throw new Error(errMsg);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `template_${service.toLowerCase()}${sheetName ? `_${sheetName}` : ''}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download template: ' + err.message);
    }
  };

  /* ===================== PREVIEW ===================== */

  const onPreview = async () => {
    const token = localStorage.getItem('access_token');
    if (!token) return alert('You must be logged in to preview uploads.');
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
        const errMsg = ct.includes('application/json')
          ? JSON.stringify(await res.json())
          : await res.text();
        throw new Error(errMsg);
      }

      setPreview(await res.json());
    } catch (err) {
      alert(err.message);
    }
  };

  /* ===================== CONFIRM UPLOAD ===================== */

  const onUpload = async () => {
    const token = localStorage.getItem('access_token');
    if (!token) return alert('You must be logged in to upload.');
    if (!file) return alert('Select a file');

    setUploading(true);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append('service', service);
      if (sheetName) fd.append('sheet_name', sheetName);
      fd.append('file', file);

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
        const errMsg = ct.includes('application/json')
          ? JSON.stringify(await res.json())
          : await res.text();
        throw new Error(errMsg);
      }

      setResult(await res.json());
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  /* ===================== UI (UNCHANGED) ===================== */

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <label className="font-semibold">Service:</label>
        <select
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="border rounded p-1 text-black"
        >
          {SERVICES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>

        <label className="ml-3 font-semibold">Sheet Name:</label>
        <input
          value={sheetName}
          onChange={(e) => setSheetName(e.target.value)}
          placeholder="Optional"
          className="border rounded p-1 text-black"
        />

        <button
          onClick={downloadTemplate}
          className="ml-2 px-3 py-1 bg-blue-600 text-white rounded"
        >
          Download Sample
        </button>
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
