import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

// Generic admin bulk upload UI. Props:
// - service: service key string (e.g., 'MIGRATION')
// - uploadApi: URL to POST to (defaults to '/api/bulk-upload/')
export default function AdminBulkUpload({ service = 'VERIFICATION', uploadApi = '/api/bulk-upload/', sheetName: preferredSheetProp = '', resetKey = null }) {
  const [step, setStep] = useState(0);
  const [sheets, setSheets] = useState([]);
  const [sheet, setSheet] = useState('');
  const [columns, setColumns] = useState([]);
  const [file, setFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [message, setMessage] = useState('');
  const [uploadPct, setUploadPct] = useState(0);
  const [result, setResult] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headersForFetch = token ? { Authorization: `Bearer ${token}` } : {};

  const postForm = (fd) => fetch(uploadApi + (uploadApi.includes('?') ? '&' : '?') + 'action=init', { method: 'POST', body: fd, credentials: 'same-origin', headers: headersForFetch });

  const postGeneric = (fd) => fetch(uploadApi + (uploadApi.includes('?') ? '&' : '?') + 'action=preview', { method: 'POST', body: fd, credentials: 'same-origin', headers: headersForFetch });

  const postWithProgress = (fd, onProgress) => {
    return new Promise((resolve, reject)=>{
      const xhr = new XMLHttpRequest();
        const url = uploadApi + (uploadApi.includes('?') ? '&' : '?') + 'action=commit';
        xhr.open('POST', url, true);
        xhr.withCredentials = true;
        // set Authorization header if token present
        try{ if(token) xhr.setRequestHeader('Authorization', `Bearer ${token}`); }catch(e){}
      xhr.upload.onprogress = (e)=>{ if(e.lengthComputable && onProgress) onProgress(Math.round((e.loaded/e.total)*100)); };
      xhr.onreadystatechange = ()=>{ if(xhr.readyState===4){ try{ resolve(JSON.parse(xhr.responseText||'{}')); }catch(e){ reject(e); } } };
      xhr.onerror = (e)=> reject(e);
      xhr.send(fd);
    });
  };

  const handleFetch = async () => {
    // Read sheets client-side using xlsx to avoid extra server roundtrip and support immediate UI
    if (!file) { setMessage('Choose a file'); return; }
    try{
      // Try modern arrayBuffer API first
      let arr;
      if (file.arrayBuffer) {
        arr = await file.arrayBuffer();
      } else {
        // Fallback to FileReader for older browsers
        arr = await new Promise((resolve, reject)=>{
          const fr = new FileReader();
          fr.onload = (ev)=> resolve(ev.target.result);
          fr.onerror = (ev)=> reject(ev);
          fr.readAsArrayBuffer(file);
        });
      }
      const wb = XLSX.read(arr, { type: 'array' });
      const names = wb.SheetNames || [];
      setSheets(names);
      const preferred = preferredSheetProp && names.includes(preferredSheetProp) ? preferredSheetProp : names[0] || '';
      setSheet(preferred);
      setMessage('Sheets loaded');
      setStep(1);
    }catch(e){
      console.error('Fetch sheets error', e);
      setMessage('Fetch sheets failed: ' + (e && e.message ? e.message : String(e)));
    }
  };

  // Reset UI when service or preferred sheet changes (so user sees a fresh file selector)
  useEffect(()=>{
    setStep(0);
    setSheets([]);
    setSheet(preferredSheetProp || '');
    setColumns([]);
    setFile(null);
    setPreviewRows([]);
    setMessage('');
    setUploadPct(0);
    setResult(null);
    setIsUploading(false);
    // if resetKey provided, also listen - resetting handled here
  }, [service, preferredSheetProp, resetKey]);

  const loadColumns = async () => {
    if (!file) return setMessage('Choose a file');
    try{
      const arr = await file.arrayBuffer();
      const wb = XLSX.read(arr, { type: 'array' });
      const ws = wb.Sheets[sheet];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      // header row is first row if present, otherwise derive generic column names
      const headerRow = rows && rows.length ? rows[0] : [];
      const cols = headerRow.map(h => String(h).trim()).filter((x,i,a)=>x!=='' || a.length===1);
      setColumns(cols.length ? cols : headerRow.map((_,i)=>`col_${i+1}`));
      setMessage('Columns loaded'); setStep(2);
    }catch(e){ setMessage('Load columns failed: '+String(e)); }
  };

  const doPreview = async (selected) => {
    if (!file) return setMessage('Choose a file');
    try{
      const arr = await file.arrayBuffer();
      const wb = XLSX.read(arr, { type: 'array' });
      const ws = wb.Sheets[sheet];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      // Build preview as array of objects using selected columns
      const header = rows[0] || [];
      const dataRows = rows.slice(1, 51); // first 50 rows
      const preview = dataRows.map(r => {
        const obj = {};
        selected.forEach(col => {
          const idx = header.findIndex(h => String(h).trim() === String(col).trim());
          obj[col] = idx >= 0 ? (r[idx] ?? '') : '';
        });
        return obj;
      });
      setPreviewRows(preview); setMessage('Preview ready'); setStep(3);
    }catch(e){ setMessage('Preview failed: '+String(e)); }
  };

  const doCommit = async (selected, extra) => {
    const fd = new FormData(); fd.append('service', service); fd.append('action', 'confirm'); if (sheet) fd.append('sheet_name', sheet); fd.append('file', file);
    selected.forEach(c=>fd.append('columns[]', c));
    if (extra && extra.auto_create_docrec) fd.append('auto_create_docrec','1');
    try{
      setUploadPct(0); setMessage('Uploading...'); setIsUploading(true);
      const data = await postWithProgress(fd, (pct)=>{ setUploadPct(pct); });
      if (data.error) return setMessage(data.detail || 'Upload error');
      setResult(data); setMessage('Upload complete'); setStep(4);
      // handle base64 xlsx log if returned
      if (data.log_xlsx && data.log_name){
        try{
          const bytes = atob(data.log_xlsx);
          const buf = new Uint8Array(bytes.length);
          for(let i=0;i<bytes.length;i++) buf[i]=bytes.charCodeAt(i);
          const blob = new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
          const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=data.log_name || 'upload_log.xlsx'; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(url); a.remove();},500);
        }catch(e){ console.warn('Failed to download xlsx log', e); }
      }
    }catch(e){ setMessage('Commit failed: '+String(e)); }
    finally{ setIsUploading(false); }
  };

  return (
    <div className="p-3 border rounded bg-white">
      <h3 className="font-semibold mb-2">{service} Bulk Upload</h3>
      <div className="mb-2 text-sm">{message}</div>
      <div className="mb-2">
        <input type="file" accept=".xlsx,.xls,.csv" onChange={e=>setFile(e.target.files?.[0]||null)} />
        <span style={{marginLeft:8}}>{file ? file.name : 'No file chosen'}</span>
        <button className="ml-2 px-3 py-1 bg-blue-600 text-white rounded" onClick={handleFetch} disabled={!file}>Fetch Sheets</button>
      </div>

      {step >= 1 && (
        <div className="mb-2">
          <label>Sheet: <select value={sheet} onChange={e=>setSheet(e.target.value)}>
            <option value="">-</option>
            {sheets.map(s=> <option key={s} value={s}>{s}</option>)}
          </select></label>
          <button className="ml-2 px-3 py-1 bg-green-600 text-white rounded" onClick={loadColumns}>Load Columns</button>
        </div>
      )}

      {step >= 2 && (
        <div className="mb-2">
          <div>Columns (click to toggle)</div>
          <div style={{maxHeight:220, overflow:'auto', border:'1px solid #ddd', padding:8}}>
            {columns.map(c=>(<label key={c} style={{display:'block'}}><input defaultChecked type="checkbox" value={c} /> {c}</label>))}
          </div>
          <button
            className="mt-2"
            onClick={()=>{ const selected=[...document.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value); doPreview(selected); }}
            style={{padding:'8px 14px', background:'#0f172a', color:'#fff', borderRadius:6, fontWeight:600, marginRight:12}}
          >
            🔎 Preview
          </button>
        </div>
      )}

      {step >= 3 && (
        <div>
          <div style={{maxHeight:220, overflow:'auto'}}>
            <table className="min-w-full"><thead>
              <tr>{previewRows[0] && Object.keys(previewRows[0]).map(k=> <th key={k} className="text-left pr-4 pb-1 border-b">{k}</th>)}</tr>
            </thead><tbody>
              {previewRows.map((r,idx)=>(<tr key={idx}>{Object.values(r).map((c,i)=>(<td key={i} className="p-1 border">{String(c)}</td>))}</tr>))}
            </tbody></table>
          </div>
          <div className="mt-2">
            <label style={{display:'inline-flex', alignItems:'center', gap:8}}><input type="checkbox" id="auto-create" /> Auto-create missing DocRec</label>
            <div style={{display:'inline-block', marginLeft:12, verticalAlign:'middle'}}>
              {/* Circular progress */}
              <div style={{width:56, height:56, position:'relative', display:'inline-block'}} aria-hidden>
                <svg viewBox="0 0 36 36" style={{transform:'rotate(-90deg)'}}>
                  <path d="M18 2.0845a15.9155 15.9155 0 1 1 0 31.831" fill="none" stroke="#e6eef8" strokeWidth="3.8"/>
                  <path d="M18 2.0845a15.9155 15.9155 0 1 1 0 31.831" fill="none" stroke="url(#g)" strokeWidth="3.8" strokeDasharray={`${uploadPct},100`} strokeLinecap="round" />
                  <defs>
                    <linearGradient id="g" x1="0%" x2="100%"><stop offset="0%" stopColor="#4aa3ff"/><stop offset="100%" stopColor="#2b8dd6"/></linearGradient>
                  </defs>
                </svg>
                <div style={{position:'absolute', left:0, right:0, top:0, bottom:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700}}>{uploadPct}%</div>
              </div>
            </div>
            <button
              disabled={isUploading || columns.filter(c=>document.querySelector(`input[value="${c}"]`)?.checked).length===0}
              onClick={()=>{ const selected=[...document.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value); const auto=document.getElementById('auto-create')?.checked; doCommit(selected, {auto_create_docrec: !!auto}); }}
              style={{marginLeft:16, padding:'8px 16px', background:'#16a34a', color:'#fff', borderRadius:6, fontWeight:700, boxShadow:'0 2px 6px rgba(0,0,0,0.12)'}}
            >
              <span style={{display:'inline-block', marginRight:8}}>⬆️</span> {isUploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="mt-2">
          <div className="text-sm">OK: {result.summary?.ok} | Fail: {result.summary?.fail} | Total: {result.summary?.total}</div>
          {result.log_url && (<a className="text-blue-500 underline" href={result.log_url} target="_blank" rel="noreferrer">Download Log (server)</a>)}
        </div>
      )}
    </div>
  );
}
