import React, { useState, useEffect, useMemo } from 'react';
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
  const failRows = useMemo(() => {
    if (!result?.results) return [];
    return result.results.filter((r) => String(r.status || '').toUpperCase() === 'FAIL');
  }, [result]);

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headersForFetch = token ? { Authorization: `Bearer ${token}` } : {};

  // Use credentials: 'include' to allow cross-origin cookies to be sent when
  // frontend runs on a different origin (Vite dev server) than the Django backend.
  const postForm = (fd) => fetch(uploadApi + (uploadApi.includes('?') ? '&' : '?') + 'action=init', { method: 'POST', body: fd, credentials: 'include', headers: headersForFetch });

  const postGeneric = (fd) => fetch(uploadApi + (uploadApi.includes('?') ? '&' : '?') + 'action=preview', { method: 'POST', body: fd, credentials: 'include', headers: headersForFetch });

  const postWithProgress = (fd, onProgress) => {
    return new Promise((resolve, reject)=>{
      const xhr = new XMLHttpRequest();
        const url = uploadApi + (uploadApi.includes('?') ? '&' : '?') + 'action=commit';
        xhr.open('POST', url, true);
        xhr.withCredentials = true;
        // set Authorization header if token present
        try{ if(token) xhr.setRequestHeader('Authorization', `Bearer ${token}`); }catch(e){}
      xhr.upload.onprogress = (e)=>{ if(e.lengthComputable && onProgress) onProgress(Math.round((e.loaded/e.total)*100)); };
      // Tolerant JSON parsing: sometimes server may return HTML wrapper (Django error page)
      // so attempt to extract JSON substring if direct parse fails.
      xhr.onreadystatechange = ()=>{ if(xhr.readyState===4){ try{ resolve(JSON.parse(xhr.responseText||'{}')); }catch(e){
          try{
            const txt = xhr.responseText||'';
            const first = txt.indexOf('{');
            const last = txt.lastIndexOf('}');
            if(first>=0 && last>first){
              const sub = txt.substring(first, last+1);
              return resolve(JSON.parse(sub));
            }
          }catch(_){ /* fallthrough */ }
          // if still failing, resolve with raw text so caller can display it
          return resolve({error:true, detail: 'Invalid JSON response from server', raw: xhr.responseText});
        } } };
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
          let val = idx >= 0 ? (r[idx] ?? '') : '';
          // Normalize passing_year: if numeric (Excel serial) convert to MON-YYYY
          if (String(col).trim().toLowerCase() === 'passing_year' && val !== ''){
            try{
              if (typeof val === 'number'){
                // use XLSX.SSF.parse_date_code when available
                const parsed = XLSX.SSF ? XLSX.SSF.parse_date_code(val) : null;
                if (parsed && parsed.y){
                  const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
                  const monAbbrev = monthNames[(parsed.m-1)] || parsed.m;
                  val = `${monAbbrev}-${parsed.y}`;
                } else {
                  // fallback: convert serial to JS Date (Excel epoch 1899-12-30)
                  const epoch = new Date(Date.UTC(1899,11,30));
                  const dt = new Date(epoch.getTime() + (val * 24 * 60 * 60 * 1000));
                  const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
                  val = `${monthNames[dt.getUTCMonth()]}-${dt.getUTCFullYear()}`;
                }
              } else {
                // try parse string like 'Jul-16' or '2016-07-01'
                const s = String(val).trim();
                const m = s.match(/([A-Za-z]{3,9})[\s\-_/]*(\d{2,4})/);
                if (m){
                  let mon = m[1].substr(0,3).toUpperCase();
                  let yr = m[2]; if (yr.length===2) yr = String(2000 + parseInt(yr,10));
                  val = `${mon}-${yr}`;
                }
              }
            }catch(e){ /* keep val as-is on error */ }
          }
          // Format numeric "*_number" or prv_number fields without trailing .0
          if ((String(col).trim().toLowerCase().endsWith('_number') || String(col).trim().toLowerCase() === 'prv_number') && val !== ''){
            try{
              if (typeof val === 'number' && Number.isInteger(val)) val = String(val);
              else if (typeof val === 'number') {
                if (Number.isInteger(val)) val = String(val); else val = String(val);
              } else {
                const sv = String(val).trim();
                if (/^\d+\.?0+$/.test(sv)) val = sv.split('.')[0];
              }
            }catch(e){ }
          }
          obj[col] = val;
        });
        return obj;
      });
      setPreviewRows(preview); setMessage('Preview ready'); setStep(3);
    }catch(e){ setMessage('Preview failed: '+String(e)); }
  };

  const downloadBase64Log = (logString, filename = 'upload_log.xlsx') => {
    if (!logString) return;
    try {
      const bytes = atob(logString);
      const buf = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i += 1) buf[i] = bytes.charCodeAt(i);
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 500);
    } catch (err) {
      console.warn('Failed to download log', err);
      setMessage('Log download failed: ' + (err?.message || err));
    }
  };

  const doCommit = async (selected, extra) => {
    if (!file) { setMessage('Choose a file'); return; }
    const fd = new FormData(); fd.append('service', service); fd.append('action', 'confirm'); if (sheet) fd.append('sheet_name', sheet); fd.append('file', file);
    selected.forEach(c=>fd.append('columns[]', c));
    if (extra && extra.auto_create_docrec) fd.append('auto_create_docrec','1');
    try{
      setUploadPct(0); setMessage('Preparing upload…'); setIsUploading(true); setResult(null);
      const data = await postWithProgress(fd, (pct)=>{ setUploadPct(pct); setMessage(`Uploading… ${pct}%`); });
      const detail = data?.detail || (data?.raw ? 'Server returned non-JSON response (see console)' : 'Upload error');
      setResult(data || {});
      setStep(4);
      if (data?.error) {
        console.warn('Upload response (error):', data);
        setMessage(detail);
        return;
      }
      setMessage('Upload complete');
      try{
        // notify other tabs/pages that a bulk upload completed so they can refresh
        if (typeof BroadcastChannel !== 'undefined'){
          try{
            const bc = new BroadcastChannel('admindesk-updates');
            bc.postMessage({ type: 'bulk_upload_complete', service, result: data });
            bc.close();
          }catch(e){ /* ignore */ }
        } else if (typeof window !== 'undefined') {
          // fallback: localStorage event
          try{ localStorage.setItem('admindesk_last_bulk', JSON.stringify({ ts: Date.now(), service })); }catch(e){}
        }
      }catch(e){/* ignore */}
    }catch(e){ setMessage('Commit failed: '+String(e)); }
    finally{ setIsUploading(false); }
  };

  return (
    <div className="p-3 border rounded bg-white">
      <h3 className="font-semibold mb-2">{service} Bulk Upload</h3>
      <div className="mb-2 text-sm">{message}</div>
      <div className="mb-2">
        <input type="file" accept=".xlsx,.xls,.csv" onChange={e=>setFile(e.target.files?.[0]||null)} />
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
        <div className="mt-2 space-y-2">
          <div className="text-sm">
            OK: {result.summary?.ok ?? 0} | Fail: {result.summary?.fail ?? 0} | Total: {result.summary?.total ?? previewRows.length}
          </div>
          {result.detail && (
            <div className="text-xs text-red-600">Server message: {result.detail}</div>
          )}
          {(result.log_url || result.log_xlsx) && (
            <div className="flex flex-wrap gap-3 text-sm">
              {result.log_url && (
                <a className="text-blue-600 underline" href={result.log_url} target="_blank" rel="noreferrer">
                  Download Log (server)
                </a>
              )}
              {result.log_xlsx && result.log_name && (
                <button
                  type="button"
                  className="rounded bg-slate-900 px-3 py-1 text-white"
                  onClick={() => downloadBase64Log(result.log_xlsx, result.log_name)}
                >
                  Download Log (client)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {step === 4 && failRows.length > 0 && (
        <div className="mt-3 border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          <div className="font-semibold text-rose-700">Failed Rows ({failRows.length})</div>
          <div className="mt-2 max-h-48 overflow-auto">
            <table className="min-w-full">
              <thead>
                <tr className="text-left">
                  <th className="pr-3">Row</th>
                  <th className="pr-3">Key / Enrollment</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {failRows.map((r, idx) => (
                  <tr key={`${r.row}-${idx}`} className="align-top">
                    <td className="pr-3">{typeof r.row === 'number' && Number.isFinite(r.row) ? r.row + 1 : (r.row ?? '-')}</td>
                    <td className="pr-3">{r.key || '-'}</td>
                    <td>{r.message || 'Unknown error'}</td>
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
