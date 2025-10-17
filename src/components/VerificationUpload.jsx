import React, { useState } from 'react';

// Simple frontend wrapper to call Django admin's upload-excel endpoint for Verification
// Usage: <VerificationUpload /> anywhere in your admin frontend panel (requires user to be authenticated in admin session)

export default function VerificationUpload() {
  const [step, setStep] = useState(0);
  const [sheets, setSheets] = useState([]);
  const [sheet, setSheet] = useState('');
  const [columns, setColumns] = useState([]);
  const [file, setFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [message, setMessage] = useState('');
  const uploadUrl = '/admin/api/verification/upload-excel/';

  const postForm = (fd) => fetch(uploadUrl, { method: 'POST', body: fd, credentials: 'same-origin' });

  const handleFetch = async () => {
    if (!file) return setMessage('Choose a file');
    const fd = new FormData();
    fd.append('action', 'init');
    fd.append('file', file);
    const res = await postForm(fd);
    const data = await res.json();
    if (data.error) return setMessage(data.error || 'Error');
    setSheets(data.sheets || []);
    setSheet(data.sheets?.[0] || '');
    setMessage('Sheets loaded');
    setStep(1);
  };

  const loadColumns = async () => {
    const fd = new FormData(); fd.append('action', 'columns'); fd.append('sheet', sheet);
    const res = await postForm(fd); const data = await res.json();
    if (data.error) return setMessage(data.error || 'Error');
    setColumns(data.columns || []);
    setMessage('Columns loaded');
    setStep(2);
  };

  const preview = async (selected) => {
    const fd = new FormData(); fd.append('action','preview'); fd.append('sheet', sheet);
    selected.forEach(c => fd.append('columns[]', c));
    const res = await postForm(fd); const data = await res.json();
    if (data.error) return setMessage(data.error || 'Error');
    setPreviewRows(data.rows || []); setMessage('Preview ready'); setStep(3);
  };

  const commit = async (selected, autoCreate) => {
    const fd = new FormData(); fd.append('action','commit'); fd.append('sheet', sheet);
    selected.forEach(c => fd.append('columns[]', c));
    if (autoCreate) fd.append('auto_create_docrec', '1');
    const res = await postForm(fd); const data = await res.json();
    if (data.error) return setMessage(data.error || 'Error');
    setMessage(`Upload complete: ${JSON.stringify(data.counts || {})}`);
    setStep(4);
  };

  return (
    <div className="p-3 border rounded bg-white">
      <h3 className="font-semibold mb-2">Verification Excel Upload</h3>
      <div className="mb-2">{message}</div>
      <div className="mb-2">
        <input type="file" accept=".xlsx,.xls" onChange={e=>setFile(e.target.files?.[0]||null)} />
        <button className="ml-2" onClick={handleFetch}>Fetch Sheets</button>
      </div>

      {step >= 1 && (
        <div className="mb-2">
          <label>Sheet: <select value={sheet} onChange={e=>setSheet(e.target.value)}>
            {sheets.map(s=> <option key={s}>{s}</option>)}
          </select></label>
          <button className="ml-2" onClick={loadColumns}>Load Columns</button>
        </div>
      )}

      {step >= 2 && (
        <div className="mb-2">
          <div>Columns (click to toggle)</div>
          <div style={{maxHeight:180, overflow:'auto', border:'1px solid #ddd', padding:8}}>
            {columns.map(c => (
              <label key={c} style={{display:'block'}}>
                <input defaultChecked type="checkbox" value={c} /> {c}
              </label>
            ))}
          </div>
          <button onClick={()=>{
            const selected=[...document.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value);
            preview(selected);
          }}>Preview</button>
        </div>
      )}

      {step >= 3 && (
        <div>
          <div style={{maxHeight:220, overflow:'auto'}}>
            <table className="min-w-full"><thead></thead><tbody>
              {previewRows.map((r,idx)=>(<tr key={idx}>{r.map((c,i)=>(<td key={i} className="p-1 border">{c}</td>))}</tr>))}
            </tbody></table>
          </div>
          <div className="mt-2">
            <label><input type="checkbox" id="auto-create" /> Auto-create missing DocRec</label>
            <button className="ml-2" onClick={()=>{
              const selected=[...document.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value);
              const auto = document.getElementById('auto-create')?.checked;
              commit(selected, !!auto);
            }}>Upload</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="mt-2">Done. Check logs in admin.</div>
      )}
    </div>
  );
}
