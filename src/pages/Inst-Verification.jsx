import React, { useEffect, useState } from "react";
import PageTopbar from "../components/PageTopbar";
import { isoToDMY, dmyToISO } from "../utils/date";

const ACTIONS = ["➕", "✏️ Edit", "🔍", "📄 Report"];

const apiBase = "/api";

function authHeaders() {
  const token = localStorage.getItem("access_token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

const InstitutionalVerification = () => {
  const [selectedTopbarMenu, setSelectedTopbarMenu] = useState("🔍");
  const [q, setQ] = useState("");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // Main (inst_verification_main)
  const emptyMain = { id: null, doc_rec: "", inst_veri_number: "", inst_veri_date: "", institute: "", rec_by: "", doc_rec_date: "", rec_inst_name: "", rec_inst_address_1: "", rec_inst_address_2: "", rec_inst_location: "", rec_inst_city: "", rec_inst_pin: "", rec_inst_email: "", doc_types: "", inst_ref_no: "", ref_date: "" };
  const [mform, setMForm] = useState(emptyMain);

  // Students for selected main
  const [srows, setSrows] = useState([]);
  const [recInstSuggestions, setRecInstSuggestions] = useState([]);
  const [recInstLoading, setRecInstLoading] = useState(false);
  
  // helper: keep pin numeric (remove decimals and non-digits)
  function sanitizePin(v) {
    if (v == null) return "";
    // convert number-like strings like '560001.0' or '560001.00' to '560001'
    const s = String(v);
    // remove decimal part if present
    const withoutDecimal = s.indexOf('.') >= 0 ? s.split('.')[0] : s;
    // remove non-digit characters
    return withoutDecimal.replace(/\D/g, '');
  }

  // helper: accept either dd-mm-yyyy or yyyy-mm-dd and return yyyy-mm-dd for <input type=date>
  function toISOForInput(v) {
    if (!v) return '';
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const iso = dmyToISO(s);
    return iso || '';
  }

  useEffect(() => {
    loadList();
  }, []);

  function handleTopbarSelect(action) {
    setSelectedTopbarMenu(action);
    if (action === "➕") {
      // Use existing topbar + to start a new record
      setMForm(emptyMain);
      setSrows([]);
      setIsNewRecord(true);
      // prefill next inst_veri_number for convenience
      fetchNextInstVeriNumber().then((v) => {
        if (v) setMForm((m) => ({ ...m, inst_veri_number: v }));
      }).catch(() => {});
      // prefill next doc_rec for institutional verification
      fetchNextDocRec().then((d) => { if (d) setMForm((m) => ({ ...m, doc_rec: d })); }).catch(() => {});
    }
  }

  async function fetchNextInstVeriNumber() {
    try {
      // fetch most recent record (API returns array or paginated results)
      const url = `${apiBase}/inst-verification-main/?ordering=-id`;
      const res = await fetch(url, { credentials: 'include', headers: authHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      const item = Array.isArray(data) ? data[0] : (data.results && data.results[0]) || data[0] || null;
      const last = item && item.inst_veri_number ? String(item.inst_veri_number).trim() : null;
      const now = new Date();
      const curYear = String(now.getFullYear());
      if (!last) return `${curYear}/001`;
      // try parse formats like 2025/021 or 2025-021
      const m = last.match(/^(\d{4})[\/\-](\d+)$/);
      if (m) {
        const [, y, seq] = m;
        const nextSeqNum = parseInt(seq, 10) + 1;
        // keep same padding as previous sequence
        const pad = seq.length;
        const nextSeqStr = String(nextSeqNum).padStart(pad, '0');
        // if year differs, use same year as last (per examples) — else use current year
        const year = y || curYear;
        return `${year}/${nextSeqStr}`;
      }
      // fallback: try extract trailing number
      const m2 = last.match(/(\d+)$/);
      if (m2) {
        const seq = m2[1];
        const nextSeq = String(parseInt(seq, 10) + 1).padStart(seq.length, '0');
        return `${curYear}/${nextSeq}`;
      }
      return `${curYear}/001`;
    } catch (e) {
      console.error('fetchNextInstVeriNumber failed', e);
      return null;
    }
  }

  async function fetchNextDocRec() {
    try {
      const url = `${apiBase}/inst-verification-main/?ordering=-id`;
      const res = await fetch(url, { credentials: 'include', headers: authHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      const item = Array.isArray(data) ? data[0] : (data.results && data.results[0]) || data[0] || null;
      const last = item && (item.doc_rec || item.doc_rec_id) ? String(item.doc_rec || item.doc_rec_id).trim() : null;
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      if (!last) return `iv_${yy}_001`;
      // pattern: iv_YY_SEQ
      const m = last.match(/^iv_(\d{2})_(\d+)$/i);
      if (m) {
        const [, lastYY, seq] = m;
        const nextSeqNum = parseInt(seq, 10) + 1;
        const pad = seq.length;
        const nextSeqStr = String(nextSeqNum).padStart(pad, '0');
        // keep same year as last record
        return `iv_${lastYY}_${nextSeqStr}`;
      }
      // fallback: try extract numeric suffix
      const m2 = last.match(/(\d+)$/);
      if (m2) {
        const seq = m2[1];
        const nextSeq = String(parseInt(seq, 10) + 1).padStart(seq.length, '0');
        return `iv_${yy}_${nextSeq}`;
      }
      return `iv_${yy}_001`;
    } catch (e) {
      console.error('fetchNextDocRec failed', e);
      return null;
    }
  }

  async function loadList() {
    setLoading(true);
    try {
      const url = `${apiBase}/inst-verification-main/?search=${encodeURIComponent(q || "")}`;
      const res = await fetch(url, { credentials: "include", headers: authHeaders() });
      if (!res.ok) throw new Error(`Failed to load list: ${res.status}`);
      const data = await res.json();
      setList(Array.isArray(data) ? data : data.results || []);
    } catch (e) {
      console.error(e);
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  async function openEdit(record) {
    // If the passed record is partial (missing some fields like dates), fetch full record from API
    async function fetchFullMain(rec) {
      try {
        if (!rec) return rec;
        if (rec.id) {
          const r = await fetch(`${apiBase}/inst-verification-main/${rec.id}/`, { credentials: 'include', headers: authHeaders() });
          if (r.ok) return await r.json();
        }
        // fallback: try fetch by doc_rec
        const docKey = rec.doc_rec || rec.doc_rec_id || (rec.doc_rec && rec.doc_rec.doc_rec_id) || '';
        if (docKey) {
          const r2 = await fetch(`${apiBase}/inst-verification-main/?doc_rec=${encodeURIComponent(docKey)}`, { credentials: 'include', headers: authHeaders() });
          if (r2.ok) {
            const d = await r2.json();
            const arr = Array.isArray(d) ? d : (d.results || []);
            if (arr.length > 0) return arr[0];
          }
        }
      } catch (e) {
        console.error('Failed to fetch full main record', e);
      }
      return rec;
    }

    record = await fetchFullMain(record);

    // convert dates for UI (dd-mm-yyyy) and ensure rec_inst fields exist
    // some API responses may return dates as string, object or timestamp — normalize
    function extractDateField(obj, fieldName) {
      if (!obj) return '';
      const v = obj[fieldName];
      if (!v && v !== 0) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'number') return new Date(v).toISOString().split('T')[0];
      if (typeof v === 'object') {
        // try common properties
        return v.iso || v.date || v.value || (v.toString && v.toString());
      }
      return '';
    }

  // prefer inst_veri_date, but fall back to doc_rec_date (some uploads use that column)
  const rawInstDate = record ? (record.inst_veri_date ?? extractDateField(record, 'inst_veri_date') ?? '') : '';
  const rawDocRecDate = record ? (record.doc_rec_date ?? extractDateField(record, 'doc_rec_date') ?? '') : '';
  const rawRefDate = record ? (record.ref_date ?? extractDateField(record, 'ref_date') ?? '') : '';

    const prepared = {
      ...(record || emptyMain),
      inst_veri_date: rawInstDate ? isoToDMY(rawInstDate) : '',
      doc_rec_date: rawDocRecDate ? isoToDMY(rawDocRecDate) : '',
      ref_date: rawRefDate ? isoToDMY(rawRefDate) : '',
      rec_by: record?.rec_by || '',
      rec_inst_address_1: record?.rec_inst_address_1 || '',
      rec_inst_address_2: record?.rec_inst_address_2 || '',
      rec_inst_location: record?.rec_inst_location || '',
      rec_inst_city: record?.rec_inst_city || '',
      rec_inst_pin: sanitizePin(record?.rec_inst_pin || ''),
      doc_types: record?.doc_types || '',
      rec_inst_email: record?.rec_inst_email || '',
    };
    setMForm(prepared);
  setIsNewRecord(false);
  console.log('openEdit loaded main record:', record, 'prepared form:', prepared);
    // load students for this doc_rec
    const docKey = record ? (record.doc_rec || record.doc_rec_id || (record.doc_rec && record.doc_rec.doc_rec_id) || '') : '';
    if (!docKey) {
      setSrows([]);
      return;
    }
    // load students only for this doc_rec
    try {
      const url = `${apiBase}/inst-verification-student/?doc_rec=${encodeURIComponent(docKey)}`;
      const res = await fetch(url, { credentials: "include", headers: authHeaders() });
      if (!res.ok) throw new Error(`Failed to load students: ${res.status}`);
      const data = await res.json();
      setSrows(Array.isArray(data) ? data : data.results || []);
      console.log('loaded students for', docKey, data);
    } catch (e) {
      console.error(e);
      setSrows([]);
    }

    // autocomplete suggestions are handled by top-level helpers
  }

  // helper: create main record (POST) and return saved main (without opening)
  async function createMainRecord() {
    try {
      const payload = { ...mform };
      if (payload.inst_veri_date && (payload.inst_veri_date.includes("-") || payload.inst_veri_date.includes("/"))) payload.inst_veri_date = dmyToISO(payload.inst_veri_date);
      if (payload.ref_date && (payload.ref_date.includes("-") || payload.ref_date.includes("/"))) payload.ref_date = dmyToISO(payload.ref_date);
      if (payload.doc_rec_date && (payload.doc_rec_date.includes("-") || payload.doc_rec_date.includes("/"))) payload.doc_rec_date = dmyToISO(payload.doc_rec_date);
      if (payload.rec_inst_pin) payload.rec_inst_pin = sanitizePin(payload.rec_inst_pin);

      const res = await fetch(`${apiBase}/inst-verification-main/`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Create main failed: ${res.status}`);
      const saved = await res.json();
      return saved;
    } catch (e) {
      console.error('Failed to create main record', e);
      throw e;
    }
  }

  // autocomplete for rec_inst_name (top-level so JSX can call it)
  async function fetchRecInstSuggestions(q) {
    if (!q || q.length < 3) {
      setRecInstSuggestions([]);
      return;
    }
    setRecInstLoading(true);
    try {
      const res = await fetch(`${apiBase}/institutes/?search=${encodeURIComponent(q)}`, { credentials: 'include', headers: authHeaders() });
      if (!res.ok) throw new Error(`Inst search failed: ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.results || []);
      setRecInstSuggestions(list);
    } catch (e) {
      console.error(e);
      setRecInstSuggestions([]);
    } finally {
      setRecInstLoading(false);
    }
  }

  function applyRecInstSuggestion(item) {
    // map institute model fields to our rec_inst_* fields
    setMForm((m) => ({
      ...m,
      rec_inst_name: item.institute_name || item.institute_code || '',
      rec_inst_address_1: item.institute_address || '',
      rec_inst_address_2: item.institute_campus || '',
      rec_inst_location: item.institute_campus || '',
      rec_inst_city: item.institute_city || '',
      rec_inst_pin: item.institute_pin || '',
    }));
    setRecInstSuggestions([]);
  }

  async function saveMain() {
    try {
      const payload = { ...mform };
      // normalize dates to ISO if present
  // accept dd-mm-yyyy or dd/mm/yyyy formats in UI and convert to ISO
  if (payload.inst_veri_date && (payload.inst_veri_date.includes("-") || payload.inst_veri_date.includes("/"))) payload.inst_veri_date = dmyToISO(payload.inst_veri_date);
  if (payload.ref_date && (payload.ref_date.includes("-") || payload.ref_date.includes("/"))) payload.ref_date = dmyToISO(payload.ref_date);
  if (payload.doc_rec_date && (payload.doc_rec_date.includes("-") || payload.doc_rec_date.includes("/"))) payload.doc_rec_date = dmyToISO(payload.doc_rec_date);
  // sanitize pin before sending
  if (payload.rec_inst_pin) payload.rec_inst_pin = sanitizePin(payload.rec_inst_pin);

      let res;
      if (mform.id) {
        res = await fetch(`${apiBase}/inst-verification-main/${mform.id}/`, {
          method: "PATCH",
          credentials: "include",
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${apiBase}/inst-verification-main/`, {
          method: "POST",
          credentials: "include",
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      const saved = await res.json();
      // refresh list and select saved
      await loadList();
      // ensure UI shows saved values (dates in dd-mm-yyyy and sanitized pin)
      const toOpen = { ...saved, inst_veri_date: saved.inst_veri_date ? isoToDMY(saved.inst_veri_date) : '', ref_date: saved.ref_date ? isoToDMY(saved.ref_date) : '', rec_inst_pin: sanitizePin(saved.rec_inst_pin || '') };
      openEdit(toOpen);
    } catch (e) {
      console.error(e);
      alert("Failed to save main record. See console for details.");
    }
  }

  // Student add form state
  const emptyStudent = { id: null, student_name: "", type_of_credential: "", month_year: "", verification_status: "" };
  const [sform, setSForm] = useState(emptyStudent);

  async function addStudent() {
    // Ensure main exists: if new record, create main first
    try {
      if (!mform || !mform.doc_rec) {
        // try to create main from current mform
        const created = await createMainRecord();
        // update mform and UI
        const toOpen = { ...created, inst_veri_date: created.inst_veri_date ? isoToDMY(created.inst_veri_date) : '', ref_date: created.ref_date ? isoToDMY(created.ref_date) : '', rec_inst_pin: sanitizePin(created.rec_inst_pin || '') };
        await loadList();
        openEdit(toOpen);
      }
    } catch (err) {
      console.error(err);
      return alert('Failed to create main record before adding student.');
    }
    try {
  const payload = { ...sform, doc_rec: mform.doc_rec };
      const res = await fetch(`${apiBase}/inst-verification-student/`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Add student failed: ${res.status}`);
      const saved = await res.json();
      // re-fetch students for this doc_rec to keep UI consistent
      try {
        const url = `${apiBase}/inst-verification-student/?doc_rec=${encodeURIComponent(mform.doc_rec)}`;
        const fres = await fetch(url, { credentials: "include", headers: authHeaders() });
        if (fres.ok) {
          const fdata = await fres.json();
          setSrows(Array.isArray(fdata) ? fdata : (fdata.results || []));
        } else {
          // fallback: append the saved row
          setSrows((s) => [...s, saved]);
        }
      } catch (ee) {
        console.error('Failed to refresh students after add', ee);
        setSrows((s) => [...s, saved]);
      }
      setSForm(emptyStudent);
    } catch (e) {
      console.error(e);
      alert("Failed to add student. See console for details.");
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 h-full">
      <PageTopbar
        titleSlot={<div className="mr-2 select-none"><h2 className="text-lg md:text-xl font-extrabold">Inst-Verification</h2></div>}
        actions={ACTIONS}
        selected={selectedTopbarMenu}
        onSelect={handleTopbarSelect}
        actionsOnLeft
        rightSlot={<a href="/" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-white ml-2">🏠 Home</a>}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Panel 1: Main form / details */}
        <div className="md:col-span-1 bg-white rounded p-4 shadow">
          <h3 className="font-semibold mb-2">Institute</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div>
                  <label className="text-xs text-gray-500">Doc Rec</label>
                  <input className="w-full border rounded px-2 py-1 text-sm" value={mform.doc_rec || ""} onChange={(e) => setMForm({ ...mform, doc_rec: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Inst Veri No</label>
                  <input className="w-full border rounded px-2 py-1 text-sm" value={mform.inst_veri_number || ""} onChange={(e) => setMForm({ ...mform, inst_veri_number: e.target.value })} onFocus={async () => { if (isNewRecord && !mform.inst_veri_number) { const v = await fetchNextInstVeriNumber(); if (v) setMForm((m) => ({ ...m, inst_veri_number: v })); } }} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Doc Rec</label>
                  <input className="w-full border rounded px-2 py-1 text-sm" value={mform.doc_rec || ""} onChange={(e) => setMForm({ ...mform, doc_rec: e.target.value })} onFocus={async () => { if (isNewRecord && !mform.doc_rec) { const d = await fetchNextDocRec(); if (d) setMForm((m) => ({ ...m, doc_rec: d })); } }} />
                </div>

                <div>
                  <label className="text-xs text-gray-500">Inst Veri Date</label>
                  <input type="date" className="w-full border rounded px-2 py-1 text-sm" value={toISOForInput(mform.inst_veri_date)} onChange={(e) => setMForm({ ...mform, inst_veri_date: isoToDMY(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Institute (ID)</label>
                  <input className="w-full border rounded px-2 py-1 text-sm" value={mform.institute || ""} onChange={(e) => setMForm({ ...mform, institute: e.target.value })} />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-500">Rec Inst Name</label>
                  <input className="w-full border rounded px-2 py-1 text-sm" value={mform.rec_inst_name || ""} onChange={(e) => { setMForm({ ...mform, rec_inst_name: e.target.value }); fetchRecInstSuggestions(e.target.value); }} placeholder="Type at least 3 characters to search" />
                  {recInstSuggestions.length > 0 && (
                    <div className="border bg-white mt-1 max-h-40 overflow-auto">
                      {recInstSuggestions.map((it) => (
                        <div key={it.institute_id} className="px-2 py-1 hover:bg-gray-100 cursor-pointer" onClick={() => applyRecInstSuggestion(it)}>
                          <div className="font-medium">{it.institute_name}</div>
                          <div className="text-xs text-gray-500">{it.institute_city} — {it.institute_code}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-gray-500">Rec By</label>
                  <input className="w-full border rounded px-2 py-1 text-sm" value={mform.rec_by || ""} onChange={(e) => setMForm({ ...mform, rec_by: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Doc Types</label>
                  <input className="w-full border rounded px-2 py-1 text-sm" value={mform.doc_types || ""} onChange={(e) => setMForm({ ...mform, doc_types: e.target.value })} placeholder="Comma-separated types (e.g., degree,marksheet)" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Doc Rec Date</label>
                  <input type="date" className="w-full border rounded px-2 py-1 text-sm" value={toISOForInput(mform.doc_rec_date)} onChange={(e) => setMForm({ ...mform, doc_rec_date: isoToDMY(e.target.value) })} />
                </div>

                <div>
                  <label className="text-xs text-gray-500">Rec Inst Address 1</label>
                  <input className="w-full border rounded px-2 py-1 text-sm" value={mform.rec_inst_address_1 || ""} onChange={(e) => setMForm({ ...mform, rec_inst_address_1: e.target.value })} />
                <div>
                  <label className="text-xs text-gray-500">Ref Date</label>
                  <input type="date" className="w-full border rounded px-2 py-1 text-sm" value={toISOForInput(mform.ref_date)} onChange={(e) => setMForm({ ...mform, ref_date: isoToDMY(e.target.value) })} />
                </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Rec Inst Location</label>
                  <input className="w-full border rounded px-2 py-1 text-sm" value={mform.rec_inst_location || ""} onChange={(e) => setMForm({ ...mform, rec_inst_location: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Rec Inst City</label>
                  <input className="w-full border rounded px-2 py-1 text-sm" value={mform.rec_inst_city || ""} onChange={(e) => setMForm({ ...mform, rec_inst_city: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Rec Inst Pin</label>
                  <input className="w-full border rounded px-2 py-1 text-sm" value={mform.rec_inst_pin || ""} onChange={(e) => setMForm({ ...mform, rec_inst_pin: e.target.value })} onBlur={(e) => setMForm({ ...mform, rec_inst_pin: sanitizePin(e.target.value) })} />
                </div>

                <div className="sm:col-span-2 flex gap-2 mt-1">
                  <button className="px-3 py-1 bg-green-600 text-white rounded text-sm" onClick={saveMain}>Save Main</button>
                  <button className="px-3 py-1 bg-gray-200 rounded text-sm" onClick={() => { setMForm(emptyMain); setSrows([]); }}>Clear</button>
                </div>
              </div>
        </div>

        {/* Panel 2: Students list + add form */}
        <div className="md:col-span-2 bg-white rounded p-4 shadow">
          <h3 className="font-semibold mb-2">Student Details</h3>
          <div className="mb-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input placeholder="Student name" className="border rounded p-1" value={sform.student_name} onChange={(e) => setSForm({ ...sform, student_name: e.target.value })} />
              <input placeholder="Type of credential" className="border rounded p-1" value={sform.type_of_credential} onChange={(e) => setSForm({ ...sform, type_of_credential: e.target.value })} />
              <input placeholder="Month/Year" className="border rounded p-1" value={sform.month_year} onChange={(e) => setSForm({ ...sform, month_year: e.target.value })} />
            </div>
            <div className="flex gap-2 mt-2">
              <input placeholder="Verification status" className="border rounded p-1" value={sform.verification_status} onChange={(e) => setSForm({ ...sform, verification_status: e.target.value })} />
              <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={addStudent}>Add Student</button>
            </div>
          </div>

          <div className="overflow-auto max-h-64">
            {Array.isArray(srows) && srows.length > 0 ? (
              (() => {
                const cols = Object.keys(srows[0]);
                return (
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr>
                        {cols.map((c) => (
                          <th key={c} className="text-left pr-4 pb-1 border-b">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {srows.map((row, i) => (
                        <tr key={row.id || i} className="border-b">
                          {cols.map((c) => (
                            <td key={c} className="pr-4 py-1">{(row[c] === null || row[c] === undefined) ? '-' : (typeof row[c] === 'object' ? JSON.stringify(row[c]) : String(row[c]))}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()
            ) : (
              <div className="py-4 text-gray-500">No students for selected record</div>
            )}
          </div>
        </div>
      </div>

      {/* Records list */}
      <div className="bg-white shadow rounded p-4 overflow-auto mt-4">
        <div className="flex gap-2 mb-3">
          <input className="flex-1 border rounded p-2" placeholder="Search by Doc Rec / Inst Name / Ref no…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={loadList}>Search</button>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-2 px-3">Doc Rec</th>
              <th className="text-left py-2 px-3">Inst Veri No</th>
              <th className="text-left py-2 px-3">Date</th>
              <th className="text-left py-2 px-3">Institute</th>
              <th className="text-left py-2 px-3">Rec By</th>
              <th className="text-left py-2 px-3">Rec Inst Name</th>
              <th className="text-left py-2 px-3">Ref No</th>
                <th className="text-left py-2 px-3">Doc Types</th>
                <th className="text-left py-2 px-3">Ref Date</th>
              <th className="text-left py-2 px-3">City</th>
              <th className="text-left py-2 px-3">Email</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && !loading ? (
              <tr><td className="py-6 px-3 text-center text-gray-500" colSpan={10}>No records</td></tr>
            ) : list.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(r)}>
                <td className="py-2 px-3">{r.doc_rec || "-"}</td>
                <td className="py-2 px-3">{r.inst_veri_number || "-"}</td>
                <td className="py-2 px-3">{r.inst_veri_date ? isoToDMY(r.inst_veri_date) : "-"}</td>
                <td className="py-2 px-3">{r.institute || "-"}</td>
                <td className="py-2 px-3">{r.rec_by || "-"}</td>
                <td className="py-2 px-3">{r.rec_inst_name || "-"}</td>
                <td className="py-2 px-3">{r.inst_ref_no || "-"}</td>
                <td className="py-2 px-3">{r.doc_types || "-"}</td>
                <td className="py-2 px-3">{r.ref_date ? isoToDMY(r.ref_date) : "-"}</td>
                <td className="py-2 px-3">{r.rec_inst_city || "-"}</td>
                <td className="py-2 px-3">{r.rec_inst_email || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InstitutionalVerification;
