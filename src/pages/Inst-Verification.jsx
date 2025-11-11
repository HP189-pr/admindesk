import React, { useEffect, useState } from "react";
import PageTopbar from "../components/PageTopbar";
import { isoToDMY, dmyToISO } from "../utils/date";

const ACTIONS = ["➕", "✏️ Edit", "🔍", "📄 Report"];

const apiBase = "/api";

function authHeaders() {
  const token = localStorage.getItem("access_token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // include CSRF token when available (session auth)
  try {
    const csrf = (typeof getCookie === 'function') ? (getCookie('csrftoken') || getCookie('csrf') || getCookie('CSRF-TOKEN')) : null;
    if (csrf) headers['X-CSRFToken'] = csrf;
  } catch (e) {
    // ignore
  }
  return headers;
}

// Read a cookie value (used to pick up Django CSRF token)
function getCookie(name) {
  try {
    const v = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
    if (!v) return null;
    return decodeURIComponent(v.split('=')[1]);
  } catch (e) {
    return null;
  }
}

// Include CSRF token for POST requests when using session authentication.
// Callers use `authHeaders()` when building fetch headers so this will ensure
// safe POSTs include X-CSRFToken if the csrftoken cookie is present.
function authHeadersWithCSRF() {
  const headers = authHeaders();
  const csrf = getCookie('csrftoken') || getCookie('csrf') || getCookie('CSRF-TOKEN');
  if (csrf) headers['X-CSRFToken'] = csrf;
  return headers;
}

const InstitutionalVerification = () => {
  const [selectedTopbarMenu, setSelectedTopbarMenu] = useState("🔍");
  const [q, setQ] = useState("");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // Main (inst_verification_main)
  const emptyMain = { id: null, doc_rec: "", inst_veri_number: "", inst_veri_date: "", institute: "", rec_by: "", doc_rec_date: "", rec_inst_name: "", rec_inst_sfx_name: "", rec_inst_address_1: "", rec_inst_address_2: "", rec_inst_location: "", rec_inst_city: "", rec_inst_pin: "", rec_inst_email: "", doc_types: "", study_mode: "", iv_status: "", inst_ref_no: "", ref_date: "" };
  const [mform, setMForm] = useState(emptyMain);

  // Students for selected main
  const [srows, setSrows] = useState([]);
  const [recInstSuggestions, setRecInstSuggestions] = useState([]);
  const [recInstLoading, setRecInstLoading] = useState(false);
  // Print dialog state
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printMode, setPrintMode] = useState('single'); // 'single' or 'range'
  const [printBy, setPrintBy] = useState('record_no'); // only 'record_no' supported in UI
  const [printYear, setPrintYear] = useState(String(new Date().getFullYear()));
  const [printNumber, setPrintNumber] = useState('001');
  const [printStartNumber, setPrintStartNumber] = useState('001');
  const [printEndNumber, setPrintEndNumber] = useState('005');
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState('');
  // Preview modal state
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewMain, setPreviewMain] = useState(null);
  const [previewDebugData, setPreviewDebugData] = useState(null);
  const [previewShowDebug, setPreviewShowDebug] = useState(false);
  
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
      rec_inst_sfx_name: record?.rec_inst_sfx_name || '',
      study_mode: record?.study_mode || '',
      iv_status: record?.iv_status || '',
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

  // --- Printing helpers ----------------------------------------------------
  // Generic resolver: try to find a field in an object by exact or partial key match (case-insensitive)
  function resolveField(obj, hint) {
    if (!obj || !hint) return '';
    const h = String(hint).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(obj, hint)) return obj[hint];
    // direct property case-insensitive
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() === h) return obj[k];
    }
    // partial match
    for (const k of Object.keys(obj)) {
      const kl = k.toLowerCase();
      if (kl.includes(h) || h.includes(kl)) return obj[k];
    }
    return '';
  }

  // Fallback: return first non-empty primitive (string/number) value from the object
  function firstNonEmptyValue(obj) {
    if (!obj || typeof obj !== 'object') return '';
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v === null || v === undefined) continue;
      if (typeof v === 'string' && v.trim() !== '') return v;
      if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
    }
    return '';
  }

  // Sanitize template values client-side so print HTML never shows importer
  // placeholders like numeric-only codes or 'nan'. Mirrors backend sanitizer.
  function sanitizeForTemplate(val) {
    try {
      if (val === null || val === undefined) return '';
      if (Array.isArray(val) || val instanceof Set) {
        const cleaned = [];
        for (const item of val) {
          const c = sanitizeForTemplate(item);
          if (c) cleaned.push(c);
        }
        if (!cleaned.length) return '';
        return Array.from(new Set(cleaned)).join(', ');
      }
      const s = String(val).trim();
      if (!s) return '';
      if (/^\[\s*\]$/.test(s)) return '';
      let inner = s.replace(/^\[\s*|\s*\]$/g, '').trim();
      inner = inner.replace(/^\[\s*|\s*\]$/g, '').trim();
      if (!inner) return '';
      if (/^\d+\.\d+$/.test(inner)) inner = inner.replace(/0+$/, '').replace(/\.$/, '');
      if (/^\d+$/.test(inner) && inner.length <= 2) return '';
      if (['nan', 'none', 'null', 'n/a'].includes(inner.toLowerCase())) return '';
      if (/^\[?\s*\]?$/i.test(s)) return '';
      return inner;
    } catch (e) {
      return '';
    }
  }

  // Try resolve by hint, else fall back to first non-empty primitive in the object
  function displayOrFirst(obj, hint) {
    const v = resolveField(obj, hint);
    const sv = sanitizeForTemplate(v);
    if (sv !== '') return sv;
    const f = firstNonEmptyValue(obj) || '';
    return sanitizeForTemplate(f);
  }
  function buildTemplateHeader(main) {
    // Header matching requested Ref layout and Registrar office block
    // Normalize main: some code paths may pass an object with `serialized` or `main` wrapper
    const normMain = (main && typeof main === 'object') ? (main.serialized || main.main || main) : (main || {});
  const instDateRaw = displayOrFirst(normMain, 'inst_veri_date') || displayOrFirst(normMain, 'doc_rec_date') || '';
  const instDate = instDateRaw ? isoToDMY(instDateRaw) : '';
    const refDateRaw = displayOrFirst(normMain, 'ref_date') || '';
    const refDate = refDateRaw ? isoToDMY(refDateRaw) : '';
    const sfx = displayOrFirst(normMain, 'rec_inst_sfx_name') || displayOrFirst(normMain, 'sfx_name') || '';
    const name = displayOrFirst(normMain, 'rec_inst_name') || displayOrFirst(normMain, 'inst_name') || displayOrFirst(normMain, 'institute_name') || '';
    const addr1 = displayOrFirst(normMain, 'rec_inst_address_1') || displayOrFirst(normMain, 'address') || '';
    const addr2 = displayOrFirst(normMain, 'rec_inst_address_2') || '';
    const loc = displayOrFirst(normMain, 'rec_inst_location') || '';
    const city = displayOrFirst(normMain, 'rec_inst_city') || '';
    const pin = displayOrFirst(normMain, 'rec_inst_pin') || displayOrFirst(normMain, 'rec_inst_pincode') || '';
  const docTypes = displayOrFirst(normMain, 'doc_types') || displayOrFirst(normMain, 'doc_type') || '';
  const baseDocDisplay = docTypes || 'Certificate';
  const hasCertificateWord = baseDocDisplay.toLowerCase().includes('certificate');
  const subjectDocText = hasCertificateWord ? baseDocDisplay : `${baseDocDisplay} certificate`;
  const detailDocText = hasCertificateWord ? baseDocDisplay : `${baseDocDisplay} Certificate`;
  // fallback: if inst_veri_number is missing, use doc_rec (frontend-friendly placeholder)
    const instVeriNo = displayOrFirst(normMain, 'inst_veri_number') || displayOrFirst(normMain, 'inst_veri_no') || (normMain && (normMain.doc_rec || normMain.doc_rec_id) ? String(normMain.doc_rec || normMain.doc_rec_id) : '');
    const instRef = displayOrFirst(normMain, 'inst_ref_no') || displayOrFirst(normMain, 'inst_ref') || '';
    const recBy = displayOrFirst(normMain, 'rec_by') || '';
  const certificateLabel = detailDocText;

    const locationLineParts = [addr2, loc, city, pin].filter(Boolean);
    const locationLine = locationLineParts.length ? locationLineParts.join(', ') : '';

    const issuerBlock = `
      <div style="text-align:right; line-height:1.4; margin-top:16px; font-weight:bold;">
        <div>Office of the Registrar,</div>
        <div>Kadi Sarva Vishwavidyalaya,</div>
        <div>Sector -15,</div>
        <div>Gandhinagar- 382015</div>
      </div>
    `;

    const instituteLines = [];
    if (name) {
      instituteLines.push(`<div style="font-weight:bold;">${name}</div>`);
    }
    const recipientDetailLines = [sfx, addr1, locationLine].filter(Boolean);
    if (recipientDetailLines.length) {
      instituteLines.push(`
        <div style="font-weight:normal;">
          ${recipientDetailLines.filter(Boolean).map((line) => `<div>${line}</div>`).join('')}
        </div>
      `);
    }

    const refMetaLeft = instVeriNo ? `Ref: KSV/${instVeriNo}` : 'Ref: KSV/';
    const refMetaRight = instDate || '';

    const refValueSegments = [];
    if (instRef) refValueSegments.push(`<strong>${sanitizeForTemplate(instRef)}</strong>`);
    if (recBy) refValueSegments.push(`<strong>${sanitizeForTemplate(recBy)}</strong>`);
    if (!instRef && !recBy) refValueSegments.push('<strong>N/A</strong>');
    const refLineText = `Your Ref ${refValueSegments.join(' ')}`;
    const refDateHtml = refDate ? ` Dated on <strong>${refDate}</strong>` : '';

    return `
  <div style="font-size:12pt;">
        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:14pt;">
          <div>${refMetaLeft}</div>
          <div>${refMetaRight}</div>
        </div>
  ${issuerBlock}
  <div style="margin-top:12px; line-height:1.8;">
          ${instituteLines.join('')}
        </div>
  <div style="margin:12px 0 2px 3.5cm; font-weight:bold;">
          Sub: Educational Verification of <strong>${subjectDocText}</strong>.
        </div>
  <div style="margin:0 0 0 3.5cm; font-weight:bold;">
          Ref: <span style="font-weight:normal;">${refLineText}</span>${refDateHtml ? `<span style="font-weight:normal;">${refDateHtml}</span>` : ''}
        </div>
  <div style="height:16px"></div>
  <div style="font-size:12pt; line-height:1.7; text-align:justify;">
          Regarding the subject and reference mentioned above, I am delighted to confirm that upon thorough verification, the documents pertaining to the candidate in question have been meticulously examined and found to be in accordance with our office records. Below are the details of the provided <strong>${certificateLabel}</strong>:
        </div>
        <div style="height:8px"></div>
      </div>
    `;
  }

  function rowsToTableRows(rows, offset = 0) {
    return rows.map((r, i) => {
      const enrollment = r.enrollment_no || r.enrolment_no || r.enrollment || displayOrFirst(r, 'enrollment') || '-';
      const branch = r.iv_degree_name || r.degree_name || r.branch || displayOrFirst(r, 'branch') || '';
      const credential = r.type_of_credential || displayOrFirst(r, 'type_of_credential') || displayOrFirst(r, 'marksheet') || '';
      const monthYear = r.month_year || displayOrFirst(r, 'month_year') || displayOrFirst(r, 'month') || displayOrFirst(r, 'year') || credential;
      const studentName = r.student_name || displayOrFirst(r, 'student_name') || displayOrFirst(r, 'name') || '-';
      return `
      <tr>
  <td style="padding:8px 10px;border:1px solid #bfbfbf;text-align:center;vertical-align:top;white-space:normal;word-break:break-word;">${offset + i + 1}</td>
  <td style="padding:8px 10px;border:1px solid #bfbfbf;text-align:left;vertical-align:top;white-space:normal;word-break:break-word;font-weight:bold;">${studentName}</td>
  <td style="padding:8px 10px;border:1px solid #bfbfbf;text-align:center;vertical-align:top;white-space:normal;word-break:break-word;font-weight:bold;">${enrollment}</td>
  <td style="padding:8px 10px;border:1px solid #bfbfbf;text-align:center;vertical-align:top;white-space:normal;word-break:break-word;font-weight:bold;">${branch}</td>
  <td style="padding:8px 10px;border:1px solid #bfbfbf;text-align:center;vertical-align:top;white-space:normal;word-break:break-word;font-weight:bold;">${monthYear}</td>
      </tr>
    `;
    }).join('\n');
  }

  function generatePrintHtml(main, students) {
  const firstPage = students.slice(0, 5);
  const annex = students.slice(5);
    const header = buildTemplateHeader(main);
    const sampleRow = firstPage[0] || students[0] || {};
    const credentialHeader = displayOrFirst(sampleRow, 'type_of_credential') || displayOrFirst(main, 'type_of_credential') || 'Type of Credential';
    const tableHeader = `
  <table style="border-collapse:collapse;width:100%;font-size:12pt;margin-top:8px;">
        <thead>
          <tr>
            <th style="padding:8px 10px;border:1px solid #bfbfbf;text-align:center;vertical-align:middle;">Sr. No.</th>
            <th style="padding:8px 10px;border:1px solid #bfbfbf;text-align:center;vertical-align:middle; width:36%;">Candidate Name</th>
            <th style="padding:8px 10px;border:1px solid #bfbfbf;text-align:center;vertical-align:middle; width:21%;">Enrollment Number</th>
            <th style="padding:8px 10px;border:1px solid #bfbfbf;text-align:center;vertical-align:middle; width:21%;">Branch</th>
            <th style="padding:8px 10px;border:1px solid #bfbfbf;text-align:center;vertical-align:middle; width:16%;">${credentialHeader}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsToTableRows(firstPage, 0)}
        </tbody>
      </table>
    `;

    // Annexure table (if any)
    const annexHtml = annex.length > 0 ? `
      <div class="page-break"></div>
      <div class="annex">
        <h3 style="margin:0 0 8px 0;">Annexure — Continued Records</h3>
    <p style="font-size:12pt;margin:0 0 6px 0;">(This is Annexure: remaining ${annex.length} record(s))</p>
  <table style="border-collapse:collapse;width:100%;font-size:12pt;margin-top:8px;">
          <thead>
            <tr>
              <th style="padding:8px 10px;border:1px solid #bfbfbf;text-align:center;vertical-align:middle;">Sr. No.</th>
              <th style="padding:8px 10px;border:1px solid #bfbfbf;text-align:center;vertical-align:middle; width:36%;">Candidate Name</th>
              <th style="padding:8px 10px;border:1px solid #bfbfbf;text-align:center;vertical-align:middle; width:21%;">Enrollment Number</th>
              <th style="padding:8px 10px;border:1px solid #bfbfbf;text-align:center;vertical-align:middle; width:21%;">Branch</th>
              <th style="padding:8px 10px;border:1px solid #bfbfbf;text-align:center;vertical-align:middle; width:16%;">${credentialHeader}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsToTableRows(annex, firstPage.length)}
          </tbody>
        </table>
      </div>
    ` : '';


    const remarkBlock = `
  <div style="margin-top:16px;font-size:12pt;">
        <div><strong>Remark:</strong> The above record has been verified and found correct as per university records.</div>
      </div>
      <div style="height:22px"></div>
  <div style="font-size:12pt;">Should you require any additional information or have further inquiries, please do not hesitate to reach out to us.</div>
  <div style="height:74px"></div>
  <div style="font-size:12pt;">Registrar</div>
    `;
    // Full HTML including print styles for A4 and top margin ~5cm
    return `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
  <title>Verification_Multiple_Records</title>
        <style>
          @page { size: A4; margin: 5cm 0.6cm 0.6cm 1cm; }
          html,body { height:100%; }
          body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; color:#000; font-size:12pt; line-height:1.7; letter-spacing:0.1px; padding-bottom:16px; }
          .header { text-align:left; margin-bottom:6px; }
          .page-break { page-break-before: always; }
          table { width:100%; border-collapse:collapse; }
          th { background:#f3f3f3; text-align:center; }
          /* Ensure content does not expand beyond A4 size when printed */
          .container { box-sizing:border-box; }
          /* Footer that repeats at the bottom of every printed page */
          .print-footer { position:fixed; left:0; right:0; bottom:0; text-align:center; font-size:11px; color:#111; }
          /* Make sure page content leaves room for footer */
          .container { padding-bottom:20px; }
        </style>
      </head>
      <body>
        <div class="container">
          ${header}
          ${tableHeader}
          ${annexHtml}
          ${remarkBlock}
          <div class="print-footer">Email: verification@ksv.ac.in &nbsp;&nbsp; Contact No.: 9408801690 / 079-23244690</div>
        </div>
      </body>
      </html>
    `;
  }

  function handlePrint() {
    // open print dialog UI (modal) to choose single or range
    setShowPrintDialog(true);
  }

  // Fetch candidate doc_rec ids. Accepts either (year, number) or a single numeric iv_record_no
  async function fetchDocRecSuggestions(yearOrNumber, maybeNumber) {
    setSuggestLoading(true);
    setSuggestions([]);
    setSelectedSuggestion('');
    try {
      let qs = '';
      if (maybeNumber === undefined) {
        // single-argument form: caller passed the number (may be iv_record_no like 25001)
        qs = `?number=${encodeURIComponent(String(yearOrNumber))}`;
      } else {
        const year = String(yearOrNumber || '').trim();
        const number = String(maybeNumber || '').trim();
        qs = `?year=${encodeURIComponent(year)}&number=${encodeURIComponent(number)}`;
      }
      const url = `${apiBase}/inst-verification/suggest-doc-rec/${qs}`;
  const res = await fetch(url, { credentials: 'include', headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch suggestions');
  const data = await res.json();
  const found = data.candidates || [];
  setSuggestions(found);
  if (found && found.length === 1) setSelectedSuggestion(found[0]);
  return found;
    } catch (e) {
      console.error('suggest fetch failed', e);
      setSuggestions([]);
      return [];
    } finally {
      setSuggestLoading(false);
    }
  }

  // Fetch a main record by doc_rec (returns object or null)
  async function fetchMainByDocRec(doc_rec) {
    try {
      const url = `${apiBase}/inst-verification-main/?doc_rec=${encodeURIComponent(doc_rec)}`;
      const res = await fetch(url, { credentials: 'include', headers: authHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data.results || []);
      return arr.length ? arr[0] : null;
    } catch (e) {
      console.error('fetchMainByDocRec', e);
      return null;
    }
  }

  // Fetch main record using inst_veri_number field (exact match)
  async function fetchMainByInstVeriNumber(ivnum) {
    try {
      const url = `${apiBase}/inst-verification-main/?inst_veri_number=${encodeURIComponent(ivnum)}`;
      const res = await fetch(url, { credentials: 'include', headers: authHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data.results || []);
      return arr.length ? arr[0] : null;
    } catch (e) {
      console.error('fetchMainByInstVeriNumber', e);
      return null;
    }
  }

  // Fetch students for a doc_rec
  async function fetchStudentsForDocRec(doc_rec) {
    try {
      const url = `${apiBase}/inst-verification-student/?doc_rec=${encodeURIComponent(doc_rec)}`;
      const res = await fetch(url, { credentials: 'include', headers: authHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.results || []);
    } catch (e) {
      console.error('fetchStudentsForDocRec', e);
      return [];
    }
  }

  // Build HTML for a single record (main page + annexure if students > page limit)
  function buildRecordHtml(mainObj, students) {
    const main = mainObj || {};
    const firstPageStudents = students.slice(0, 5);
    const annex = students.slice(5);
    const header = buildTemplateHeader(main);
    const sampleRow = firstPageStudents[0] || students[0] || {};
    const credentialHeader = displayOrFirst(sampleRow, 'type_of_credential') || displayOrFirst(main, 'type_of_credential') || 'Type of Credential';
    const table = `
  <table style="border-collapse:collapse;width:100%;font-size:12pt;margin-top:8px;">
        <thead>
          <tr>
            <th style="padding:6px;border:1px solid #ccc;vertical-align:middle;">Sr. No.</th>
            <th style="padding:6px;border:1px solid #ccc;vertical-align:middle;">Candidate Name</th>
            <th style="padding:6px;border:1px solid #ccc;vertical-align:middle;">Enrollment Number</th>
            <th style="padding:6px;border:1px solid #ccc;vertical-align:middle;">Branch</th>
            <th style="padding:6px;border:1px solid #ccc;vertical-align:middle;">${credentialHeader}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsToTableRows(firstPageStudents, 0)}
        </tbody>
      </table>
    `;
    const annexHtml = annex.length > 0 ? `
      <div class="page-break"></div>
      <div class="annex">
        <h3 style="margin:0 0 8px 0;">Annexure — Continued Records for ${main.doc_rec || ''}</h3>
  <p style="font-size:12pt;margin:0 0 6px 0;">(Remaining ${annex.length} record(s))</p>
  <table style="border-collapse:collapse;width:100%;font-size:12pt;margin-top:8px;">
          <thead>
            <tr>
              <th style="padding:6px;border:1px solid #ccc;vertical-align:middle;">Sr. No.</th>
              <th style="padding:6px;border:1px solid #ccc;vertical-align:middle;">Candidate Name</th>
              <th style="padding:6px;border:1px solid #ccc;vertical-align:middle;">Enrollment Number</th>
              <th style="padding:6px;border:1px solid #ccc;vertical-align:middle;">Branch</th>
              <th style="padding:6px;border:1px solid #ccc;vertical-align:middle;">${credentialHeader}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsToTableRows(annex, firstPageStudents.length)}
          </tbody>
        </table>
      </div>
    ` : '';
    const remarkBlock = `
      <div style="height:16px"></div>
  <div style="font-size:12pt;">
        <div><strong>Remark:</strong> The above record has been verified and found correct as per university records.</div>
      </div>
      <div style="height:22px"></div>
  <div style="text-align:left;margin-top:12px;font-size:12pt;">
  <div>Should you require any additional information or have further inquiries, please do not hesitate to reach out to us.</div>
  <div style="height:74px"></div>
        <div>Registrar</div>
      </div>
    `;
    return `
      <div class="record-page">
        ${header}
        ${table}
        ${annexHtml}
        ${remarkBlock}
      </div>
    `;
  }

  function generateBatchHtml(pagesHtml) {
    return `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
  <title>Verification_Multiple_Records</title>
        <style>
          @page { size: A4; margin: 5cm 2cm 2cm 2cm; }
          body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; color:#000; }
          .page-break { page-break-before: always; }
          table { width:100%; border-collapse:collapse; }
          th { background:#f3f3f3; text-align:left; }
          .record-page { page-break-after: always; }
        </style>
      </head>
      <body>
        ${pagesHtml.join('\n')}
      </body>
      </html>
    `;
  }

  async function submitPrint() {
    // Build list of doc_rec ids
    setShowPrintDialog(false);
    const pages = [];
    let debugMainForPreview = null;
  const debugDocMap = {};
  let fallbackHtml = '';
    const applyDebugResults = (arr) => {
      if (!Array.isArray(arr)) return;
      for (const r of arr) {
        if (!r || !r.found || !r.actual_doc_rec) continue;
        const key = String(r.actual_doc_rec);
        if (!debugDocMap[key]) {
          debugDocMap[key] = {
            main: r.main || null,
            students: Array.isArray(r.students) ? r.students : [],
          };
        }
      }
    };

    if (printMode === 'single') {
      const num = String(printNumber).trim();
      if (printBy === 'record_no') {
        // Treat the entered number as iv_record_no. First try server-side PDF generation
        // which will merge multiple doc_rec rows under the same iv_record_no. If the
        // server PDF endpoint is not available or fails, fall back to client-side
        // merging: resolve doc_rec ids, fetch mains and students and build merged HTML.
        const ivnum = num;
  let docList = [];
  let serverHtml = '';
        try {
          // Try server-side PDF generation (prefer deterministic merge there)
          const url = `${apiBase}/inst-verification/generate-pdf/`;
          const res = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify({ iv_record_no: ivnum }),
          });
          const contentType = res.headers.get('content-type') || '';
          if (res.ok && contentType.includes('application/pdf')) {
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const w = window.open(blobUrl, '_blank');
            if (!w) return alert('Popup blocked. Allow popups to print.');
            // Give the browser time to open then call print
            setTimeout(() => { try { w.focus(); w.print(); } catch (e) { console.error('print failed', e); } }, 700);
            return;
          }
          if (contentType.includes('application/json')) {
            const data = await res.json().catch(() => null);
            if (data) {
              if (Array.isArray(data.debug_results)) applyDebugResults(data.debug_results);
              if (Array.isArray(data.results)) applyDebugResults(data.results);
              if (Array.isArray(data.doc_recs)) docList.push(...data.doc_recs.filter(Boolean));
              if (typeof data.html === 'string' && data.html.trim()) serverHtml = data.html;
            }
          }
          // If server returned JSON or error, we'll fall back below
        } catch (e) {
          console.warn('Server PDF generation failed, falling back to client merge', e);
        }

        // Fallback: resolve doc_rec ids for this iv_record_no and merge mains/students client-side
        if (!docList || docList.length === 0) {
          docList = await fetchDocRecSuggestions(ivnum).catch(() => []);
        }
        // If suggest-doc-rec returned nothing, try server debug POST to gather matching doc_rec values (requires auth)
        if ((!docList || docList.length === 0)) {
          try {
            const dbgUrl = `${apiBase}/inst-verification/generate-pdf/?debug=1`;
            const dbgRes = await fetch(dbgUrl, { method: 'POST', credentials: 'include', headers: authHeaders(), body: JSON.stringify({ iv_record_no: ivnum }) });
            if (dbgRes && dbgRes.ok) {
              const j = await dbgRes.json().catch(()=>null);
              if (j && Array.isArray(j.results)) {
                const found = [];
                for (const r of j.results) {
                  if (r && r.found && r.actual_doc_rec) found.push(r.actual_doc_rec);
                }
                applyDebugResults(j.results);
                if (found.length) docList = found;
              }
            }
          } catch (e) {
            console.warn('server debug lookup failed', e);
          }
        }
        const debugDocRecs = Object.keys(debugDocMap);
        if (debugDocRecs.length) {
          const merged = [...(docList || []), ...debugDocRecs];
          docList = Array.from(new Set(merged.filter(Boolean)));
        }
        // If still empty, try fetching main record(s) by iv_record_no directly (requires auth)
        if ((!docList || docList.length === 0)) {
          try {
            const url = `${apiBase}/inst-verification-main/?iv_record_no=${encodeURIComponent(ivnum)}`;
            const r = await fetch(url, { credentials: 'include', headers: authHeaders() });
            if (r && r.ok) {
              const d = await r.json().catch(()=>null);
              const arr = Array.isArray(d) ? d : (d && d.results ? d.results : []);
              if (arr && arr.length) {
                const found = [];
                for (const m of arr) {
                  const dr = m.doc_rec || m.doc_rec_id || (m.doc_rec && m.doc_rec.doc_rec_id) || '';
                  if (dr) found.push(dr);
                }
                if (found.length) docList = found;
              }
            } else if (r) {
              console.warn('fetch main by iv_record_no returned', r.status);
            }
          } catch (e) {
            console.warn('fetch main by iv_record_no failed', e);
          }
        }
  docList = Array.from(new Set((docList || []).filter(Boolean)));
  if (!fallbackHtml && serverHtml) fallbackHtml = serverHtml;
  // If still empty, but the UI currently has the matching main loaded (mform) and students (srows),
        // use those as a local fallback so preview/print works even when suggestion API is blocked by auth.
        if ((!docList || docList.length === 0) && mform && ((mform.iv_record_no && String(mform.iv_record_no) === String(ivnum)) || (String(mform.doc_rec || '').includes(String(ivnum))))) {
          // Use client-side main and students
          const localMain = { ...mform };
          const localStudents = Array.isArray(srows) ? srows : [];
          if (!debugMainForPreview) debugMainForPreview = localMain;
          pages.push(buildRecordHtml(localMain, localStudents));
          // skip the rest of the client-side merge logic for this ivnum
          setPreviewHtml(generateBatchHtml(pages));
          setPreviewDebugData(debugMainForPreview);
          setPreviewMain({ inst_veri_number: String(ivnum) });
          setPreviewVisible(true);
          return;
        }
        if (!docList || docList.length === 0) {
          pages.push(`
            <div style="page-break-after:always;padding:20px;font-family:'Calibri','Segoe UI',Arial,sans-serif;">Record No <strong>${ivnum}</strong> not found.</div>
          `);
        } else {
          // fetch all mains and students for these doc_rec ids and merge
          const allStudents = [];
          let repMain = null;
          for (const dr of docList) {
            const cached = debugDocMap[dr] || debugDocMap[String(dr)];
            const m = cached && cached.main ? cached.main : await fetchMainByDocRec(dr);
            if (!repMain && m) repMain = m;
            let studs = cached && Array.isArray(cached.students) ? cached.students : null;
            if (!studs || studs.length === 0) {
              studs = await fetchStudentsForDocRec(dr);
            }
            // attach source and push
            for (const s of studs || []) {
              allStudents.push({ ...s, _source_doc_rec: dr });
            }
          }
          // dedupe students by enrollment_no or student_name
          const seen = new Set();
          const merged = [];
          for (const s of allStudents) {
            const key = (s.enrollment_no || s.enrollment || s.enrollment_no_text || s.student_name || JSON.stringify(s)).toString();
            if (seen.has(key)) continue;
            seen.add(key);
            const copy = { ...s };
            delete copy._source_doc_rec;
            merged.push(copy);
          }
          if (!repMain) repMain = { inst_veri_number: ivnum, rec_inst_name: '', doc_types: '', inst_ref_no: '', rec_by: '', inst_veri_date: '' };
          if (!debugMainForPreview) debugMainForPreview = repMain;
          pages.push(buildRecordHtml(repMain, merged));
        }
      } else if (printBy === 'doc_rec') {
        // If user selected a suggested doc_rec, use it directly
        let doc_rec = selectedSuggestion && selectedSuggestion.length ? selectedSuggestion : null;
        if (!doc_rec) {
          // If user entered a long numeric string like '25001', treat it as iv_record_no
          if (/^\d{4,}$/.test(num)) {
            // attempt to fetch doc_rec suggestions for this iv_record_no synchronously
            const found = await fetchDocRecSuggestions(num);
            if (found && found.length) {
              doc_rec = found[0];
              setSelectedSuggestion(found[0]);
            }
          }
          if (!doc_rec) {
            // ensure numeric part uses same padding as user provided (e.g. '001')
            const padLen = String(printNumber).length || num.length;
            const numStr = String(num).padStart(padLen, '0');
            // Per backend conventions, frontend inputs Year=2025, Number=002 should map to iv_25_002
            const year2 = String(printYear).trim().slice(-2);
            doc_rec = `iv_${year2}_${numStr}`;
          }
        }
        const mainObj = await fetchMainByDocRec(doc_rec);
        const students = await fetchStudentsForDocRec(doc_rec);
        console.log('fetch result for', doc_rec, { main: mainObj, students });
        if (!mainObj && (!students || students.length === 0)) {
          // push a 'not found' page
          pages.push(`
            <div style="page-break-after:always;padding:20px;font-family:'Calibri','Segoe UI',Arial,sans-serif;">Record <strong>${doc_rec}</strong> not found.</div>
          `);
        } else {
          if (!debugMainForPreview) debugMainForPreview = mainObj;
          pages.push(buildRecordHtml(mainObj, students));
        }
  } else {
        // lookup by inst_veri_number exact match
        const ivnum = num;
        const mainObj = await fetchMainByInstVeriNumber(ivnum);
        if (!mainObj) {
          pages.push(`
            <div style="page-break-after:always;padding:20px;font-family:'Calibri','Segoe UI',Arial,sans-serif;">Record with Inst Veri No <strong>${ivnum}</strong> not found.</div>
          `);
        } else {
          const doc_rec = mainObj.doc_rec || mainObj.doc_rec_id || '';
          const students = doc_rec ? await fetchStudentsForDocRec(doc_rec) : [];
          if (!debugMainForPreview) debugMainForPreview = mainObj;
          pages.push(buildRecordHtml(mainObj, students));
        }
      }
    } else {
      const s = parseInt(String(printStartNumber).trim(), 10);
      const e = parseInt(String(printEndNumber).trim(), 10);
      if (isNaN(s) || isNaN(e) || s > e) return alert('Invalid range');
      const pad = Math.max(String(printStartNumber).length, String(printEndNumber).length);
      const max = 200;
      if (e - s + 1 > max) return alert(`Range too large; limit ${max} records`);

      if (printBy === 'record_no') {
        // Build list of iv_record_no values and attempt server-side batch PDF generation first
        const ivList = [];
        for (let i = s; i <= e; i++) ivList.push(String(i));
        try {
          const url = `${apiBase}/inst-verification/generate-pdf/`;
          const res = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify({ iv_record_nos: ivList }),
          });
          const contentType = res.headers.get('content-type') || '';
          if (res.ok && contentType.includes('application/pdf')) {
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const w = window.open(blobUrl, '_blank');
            if (!w) return alert('Popup blocked. Allow popups to print.');
            setTimeout(() => { try { w.focus(); w.print(); } catch (e) { console.error('print failed', e); } }, 700);
            return;
          }
        } catch (e) {
          console.warn('Server batch PDF generation failed, falling back to client merge', e);
        }

        // Fallback: for each iv_record_no, resolve doc_rec ids and build merged pages client-side
        for (let i = s; i <= e; i++) {
          const ivnum = String(i);
          const docList = await fetchDocRecSuggestions(ivnum).catch(() => []);
          if (!docList || docList.length === 0) {
            pages.push(`
              <div style="page-break-after:always;padding:20px;font-family:'Calibri','Segoe UI',Arial,sans-serif;">Record No <strong>${ivnum}</strong> not found.</div>
            `);
            continue;
          }
          const allStudents = [];
          let repMain = null;
          for (const dr of docList) {
            const m = await fetchMainByDocRec(dr);
            if (!repMain && m) repMain = m;
            const studs = await fetchStudentsForDocRec(dr);
            for (const srow of studs || []) allStudents.push({ ...srow, _source_doc_rec: dr });
          }
          const seen = new Set();
          const merged = [];
          for (const srow of allStudents) {
            const key = (srow.enrollment_no || srow.enrollment || srow.enrollment_no_text || srow.student_name || JSON.stringify(srow)).toString();
            if (seen.has(key)) continue;
            seen.add(key);
            const copy = { ...srow };
            delete copy._source_doc_rec;
            merged.push(copy);
          }
          if (!repMain) repMain = { inst_veri_number: ivnum, rec_inst_name: '', doc_types: '', inst_ref_no: '', rec_by: '', inst_veri_date: '' };
          if (!debugMainForPreview) debugMainForPreview = repMain;
          pages.push(buildRecordHtml(repMain, merged));
        }
      } else {
        for (let i = s; i <= e; i++) {
          const numStr = String(i).padStart(pad, '0');
          const year2 = String(printYear).trim().slice(-2);
          const doc_rec = `iv_${year2}_${numStr}`;
          const mainObj = await fetchMainByDocRec(doc_rec);
          const students = await fetchStudentsForDocRec(doc_rec);
          console.log('fetch result for', doc_rec, { main: mainObj, students });
          if (!mainObj && (!students || students.length === 0)) {
            pages.push(`
              <div style="page-break-after:always;padding:20px;font-family:'Calibri','Segoe UI',Arial,sans-serif;">Record <strong>${doc_rec}</strong> not found.</div>
            `);
          } else {
            if (!debugMainForPreview) debugMainForPreview = mainObj;
            pages.push(buildRecordHtml(mainObj, students));
          }
        }
      }
    }
  const html = pages.length > 0 ? generateBatchHtml(pages) : (fallbackHtml || '<div style="padding:20px;font-family:\'Calibri\',\'Segoe UI\',Arial,sans-serif;">No records rendered.</div>');
    // show preview modal with generated HTML
    setPreviewHtml(html);
    if (!debugMainForPreview) {
      const firstKey = Object.keys(debugDocMap)[0];
      if (firstKey && debugDocMap[firstKey] && debugDocMap[firstKey].main) {
        debugMainForPreview = debugDocMap[firstKey].main;
      }
    }
    // expose the representative main object used to build preview for debugging
    setPreviewDebugData(debugMainForPreview);
    // set previewMain used for filename when downloading PDF
    try {
      const pm = (printBy === 'record_no' && printMode === 'single' && String(printNumber).trim()) ? { inst_veri_number: String(printNumber).trim() } : null;
      setPreviewMain(pm);
    } catch (e) { setPreviewMain(null); }
    setPreviewVisible(true);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 h-full">
      <PageTopbar
        titleSlot={<div className="mr-2 select-none"><h2 className="text-lg md:text-xl font-extrabold">Inst-Verification</h2></div>}
        actions={ACTIONS}
        selected={selectedTopbarMenu}
        onSelect={handleTopbarSelect}
        actionsOnLeft
        rightSlot={<div className="flex items-center gap-2"><button className="px-3 py-2 bg-indigo-600 text-white rounded" onClick={() => handlePrint()}>Print</button><a href="/" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-white ml-2">🏠 Home</a></div>}
      />

      {showPrintDialog && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
          <div className="bg-black/40 absolute inset-0" onClick={() => setShowPrintDialog(false)} />
          <div className="bg-white rounded shadow-lg z-10 w-11/12 max-w-2xl p-4">
            <h3 className="text-lg font-semibold mb-2">Print selection</h3>
              <div className="mb-3">
              <label className="inline-flex items-center mr-4"><input type="radio" name="pmode" checked={printMode==='single'} onChange={() => setPrintMode('single')} className="mr-2"/> Single record</label>
              <label className="inline-flex items-center"><input type="radio" name="pmode" checked={printMode==='range'} onChange={() => setPrintMode('range')} className="mr-2"/> Multiple (range)</label>
            </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="md:col-span-3 text-sm text-gray-600">Lookup by: Record No (iv_record_no)</div>
                {printMode === 'single' ? (
                  <div className="md:col-span-3">
                    <label className="text-xs text-gray-500">Record No (exact)</label>
                    <input
                      className="w-full border rounded px-2 py-1"
                      value={printNumber}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      onChange={(e)=>{
                        const v = String(e.target.value || '');
                        const cleaned = v.replace(/\D/g, '');
                        setPrintNumber(cleaned);
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-gray-500">Start number</label>
                      <input
                        className="w-full border rounded px-2 py-1"
                        value={printStartNumber}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(e)=>{
                          const v = String(e.target.value || '');
                          const cleaned = v.replace(/\D/g, '');
                          setPrintStartNumber(cleaned);
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">End number</label>
                      <input
                        className="w-full border rounded px-2 py-1"
                        value={printEndNumber}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(e)=>{
                          const v = String(e.target.value || '');
                          const cleaned = v.replace(/\D/g, '');
                          setPrintEndNumber(cleaned);
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="px-3 py-1 border rounded" onClick={() => setShowPrintDialog(false)}>Cancel</button>
              <button className="px-3 py-1 bg-indigo-600 text-white rounded" onClick={() => submitPrint()}>Generate & Print</button>
            </div>
          </div>
        </div>
      )}

      {previewVisible && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8">
          <div className="bg-black/40 absolute inset-0" onClick={() => setPreviewVisible(false)} />
          <div className="bg-white rounded shadow-lg z-10 w-11/12 max-w-4xl p-4 overflow-auto" style={{maxHeight: '85vh'}}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-semibold">Verification Letter Preview</h3>
              <div className="flex gap-2 action-buttons">
                <button className="px-3 py-1 border rounded" onClick={() => setPreviewVisible(false)}>Close</button>
                <button className="px-3 py-1 bg-indigo-600 text-white rounded" onClick={() => {
                  // open new window with previewHtml and invoke print
                  const w = window.open('', '_blank');
                  if (!w) return alert('Popup blocked. Allow popups to print.');
                  w.document.open();
                  w.document.write(previewHtml);
                  w.document.close();
                  setTimeout(() => { try { w.focus(); w.print(); } catch (e) { console.error('print failed', e); } }, 400);
                }}>Print</button>
                <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={async () => {
                  try {
                    // request server PDF using iv_record_no or iv_record_nos
                    const url = `${apiBase}/inst-verification/generate-pdf/`;
                    let body = {};
                    if (printMode === 'single') {
                      body = { iv_record_no: String(printNumber).trim() };
                    } else {
                      const s = parseInt(String(printStartNumber).trim(), 10);
                      const e = parseInt(String(printEndNumber).trim(), 10);
                      const ivList = [];
                      for (let i = s; i <= e; i++) ivList.push(String(i));
                      body = { iv_record_nos: ivList };
                    }
                    const res = await fetch(url, { method: 'POST', credentials: 'include', headers: authHeaders(), body: JSON.stringify(body) });
                    if (!res.ok) {
                      const j = await res.json().catch(()=>null);
                      return alert('PDF generation failed: ' + (j && j.detail ? j.detail : res.status));
                    }
                    const blob = await res.blob();
                    const filename = previewMain && previewMain.inst_veri_number ? `Verification_Letter_${previewMain.inst_veri_number}.pdf` : 'Verification_Letter.pdf';
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                  } catch (e) { console.error('download pdf failed', e); alert('Download failed'); }
                }}>Download PDF</button>
              </div>
            </div>
            <div style={{marginBottom:8}}>
              <label style={{fontSize:12}}><input type="checkbox" style={{marginRight:8}} checked={previewShowDebug} onChange={(e)=>setPreviewShowDebug(e.target.checked)} /> Show debug data</label>
            </div>
            {previewShowDebug && previewDebugData && (
              <div style={{background:'#f8f8f8',padding:8,border:'1px solid #eee',marginBottom:8,maxHeight:200,overflow:'auto'}}>
                <pre style={{fontSize:12,whiteSpace:'pre-wrap'}}>{JSON.stringify(previewDebugData, null, 2)}</pre>
              </div>
            )}
            <div className="preview-content" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
      )}

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
                  <label className="text-xs text-gray-500">Rec Inst Suffix</label>
                  <input className="w-full border rounded px-2 py-1 text-sm" value={mform.rec_inst_sfx_name || ""} onChange={(e) => setMForm({ ...mform, rec_inst_sfx_name: e.target.value })} placeholder="Suffix or campus" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Doc Types</label>
                  <input className="w-full border rounded px-2 py-1 text-sm" value={mform.doc_types || ""} onChange={(e) => setMForm({ ...mform, doc_types: e.target.value })} placeholder="Comma-separated types (e.g., Transcript, Marksheet, Degree)" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Study Mode</label>
                  <input className="w-full border rounded px-2 py-1 text-sm" value={mform.study_mode || ""} onChange={(e) => setMForm({ ...mform, study_mode: e.target.value })} placeholder="F/P/O (Full/Part/Online)" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">IV Status</label>
                  <select className="w-full border rounded px-2 py-1 text-sm" value={mform.iv_status || ""} onChange={(e) => setMForm({ ...mform, iv_status: e.target.value })}>
                    <option value="">-</option>
                    <option value="Pending">Pending</option>
                    <option value="Done">Done</option>
                    <option value="Correction">Correction</option>
                    <option value="Post">Post</option>
                    <option value="Mail">Mail</option>
                  </select>
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
