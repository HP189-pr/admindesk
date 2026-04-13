// src/pages/doc-receive.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { dmyToISO, isoToDMY, pad2 } from "../utils/date";
import PanelToggleButton from "../components/PanelToggleButton";
import PageTopbar from "../components/PageTopbar";
import SearchField from '../components/SearchField';
import useEnrollmentLookup from '../hooks/useEnrollmentLookup';

const ACTIONS = ["➕", "🔍", "📄 Report"];

const APPLY_FOR = [
  { value: "VR", label: "Verification" },
  { value: "IV", label: "Institutional Verification" },
  { value: "PR", label: "Provisional" },
  { value: "MG", label: "Migration" },
  { value: "GT", label: "Marks to Grade" },
];

const APPLY_FOR_LABELS = APPLY_FOR.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const PAY_BY = [
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank" },
  { value: "UPI", label: "UPI" },
  { value: "NA", label: "Not Applicable" },
];

const GRID24 = "grid grid-cols-1 md:[grid-template-columns:repeat(24,minmax(0,1fr))] gap-1";

// Format IV doc_rec_id for display as IVYY + 4+ digit sequence (strip extra zeros)
const formatDocRecId = (docRecId, applyFor) => {
  if (!docRecId) return '';
  const raw = String(docRecId);
  const isIV = (applyFor || '').toUpperCase() === 'IV' || raw.toUpperCase().startsWith('IV');
  if (!isIV) return raw;
  const m = raw.match(/^(IV)(\d{2})(\d+)$/i);
  if (!m) return raw.toUpperCase();
  const [, prefix, yy, seqRaw] = m;
  const seqNum = parseInt(seqRaw, 10);
  if (Number.isNaN(seqNum) || seqNum <= 0) return raw.toUpperCase();
  const seqStr = String(seqNum).padStart(4, '0');
  return `${prefix.toUpperCase()}${yy}${seqStr}`;
};

// Map apply_for selection to the corresponding service filter used by the list
const serviceForApply = (applyFor) => {
  switch (applyFor) {
    case "IV":
      return "inst-verification";
    case "PR":
      return "provisional";
    case "MG":
      return "migration";
    case "VR":
      return "verification";
    default:
      return "all";
  }
};

export default function DocReceive({ onToggleSidebar, onToggleChatbox }) {
  // Flash message state
  const [flashMsg, setFlashMsg] = useState("");
  const showFlash = (msg) => {
    setFlashMsg(msg);
    setTimeout(() => setFlashMsg(""), 2000);
  };
  const [panelOpen, setPanelOpen] = useState(true);
  const [selected, setSelected] = useState("➕");

  const todayDMY = () => {
    const d = new Date();
    return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
  };

  const initialForm = {
    apply_for: "VR",
    pay_by: "NA",
    pay_amount: 0,
    doc_rec_date: todayDMY(),
    doc_rec_id: "",
    pay_rec_no_pre: "",
    pay_rec_no: "",
    doc_remark: "",
    enrollment: "",
    enrollment_id: null,
    second_enrollment: "",
    student_name: "",
    institute_id: "",
    sub_course: "",
    main_course: "",
    tr: 0, ms: 0, dg: 0, moi: 0, backlog: 0,
    eca_required: false,
    rec_by: "",
    rec_inst_name: "",
    rec_inst_suggestions: [],
    rec_inst_loading: false,
    prv_number: "",
    prv_date: "",
    passing_year: "",
    mg_number: "",
    mg_date: "",
    exam_year: "",
    admission_year: "",
    mg_status: "Issued",
    mg_cancelled: "No",
    mg_remark: "",
    book_no: "",
  };
  const [form, setForm] = useState(initialForm);
  const [related, setRelated] = useState({ migration: [], provisional: [], verification: [], inst_verification_main: [], inst_verification_students: [] });

  const fetchRelatedForDocRec = async (docRecId) => {
    if (!docRecId) return;
    try{
      const token = localStorage.getItem('access_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      // Ensure we pass the DocRec identifier string to endpoints that expect doc_rec
      let docRecKey = docRecId;
      // If caller passed a numeric id (DB PK), resolve it to the doc_rec identifier
      if (/^\d+$/.test(String(docRecId))) {
        try {
          const drRes = await fetch(`/api/docrec/${String(docRecId)}/`, { headers });
          if (drRes.ok) {
            const drJson = await drRes.json();
            docRecKey = drJson.doc_rec_id || drJson.doc_rec || docRecKey;
          }
        } catch (e) {
          // ignore and fallback to provided id
        }
      }
      // Migration & Provisional store doc_rec as string; verification may be FK -> filter by doc_rec__doc_rec_id
      const fetchOpts = { headers, credentials: 'include' };
      const [mgRes, prRes, vrRes, imRes, isRes] = await Promise.all([
        fetch(`/api/migration/?doc_rec=${encodeURIComponent(docRecKey)}`, fetchOpts),
        fetch(`/api/provisional/?doc_rec=${encodeURIComponent(docRecKey)}`, fetchOpts),
        fetch(`/api/verification/?doc_rec=${encodeURIComponent(docRecKey)}`, fetchOpts),
        fetch(`/api/inst-verification-main/?doc_rec=${encodeURIComponent(docRecKey)}`, fetchOpts),
        fetch(`/api/inst-verification-student/?doc_rec=${encodeURIComponent(docRecKey)}`, fetchOpts),
      ]);
      const mg = mgRes.ok ? await mgRes.json() : (await mgRes.text());
      const pr = prRes.ok ? await prRes.json() : (await prRes.text());
      const vr = vrRes.ok ? await vrRes.json() : (await vrRes.text());
      const im = imRes.ok ? await imRes.json() : (await imRes.text());
      const ists = isRes.ok ? await isRes.json() : (await isRes.text());
      // Depending on list endpoints, data may be paginated {results:[]}
      const unwrap = (d) => (d && d.results ? d.results : Array.isArray(d) ? d : (d && d.objects ? d.objects : []));
      setRelated({ migration: unwrap(mg), provisional: unwrap(pr), verification: unwrap(vr), inst_verification_main: unwrap(im), inst_verification_students: unwrap(ists) });
    }catch(e){ console.warn('fetchRelatedForDocRec error', e); }
  };

  // When a doc_rec_id is present, load its detail to keep doc_rec_remark in sync with Verification edits
  const fetchDocRecDetail = async (docRecId) => {
    if (!docRecId) return;
    try {
      const token = localStorage.getItem('access_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      // Accept both string key and numeric id
      const url = /^\d+$/.test(String(docRecId)) ? `/api/docrec/${docRecId}/` : `/api/docrec/?doc_rec_id=${encodeURIComponent(docRecId)}`;
      const res = await fetch(url, { headers });
      if (!res.ok) return;
      const data = await res.json();
      const row = Array.isArray(data) ? (data[0] || null) : (data.results ? (data.results[0] || null) : data);
      if (row && typeof row === 'object') {
        setForm((f) => ({
          ...f,
          doc_remark: row.doc_remark || f.doc_remark || '',
        }));
      }
    } catch (e) {
      console.warn('fetchDocRecDetail error', e);
    }
  };

  const handleChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Centralized enrollment lookup for enrollment field
  useEnrollmentLookup(form.enrollment, (enr) => {
    if (enr) {
      setForm((f) => ({
        ...f,
        student_name: enr.student_name || enr.student || '',
        enrollment_id: enr.id || enr.pk || null,
      }));
    } else {
      setForm((f) => ({
        ...f,
        student_name: '',
        enrollment_id: null,
      }));
    }
  });

  // Financial year suffix helper: matches backend logic
  const financialYearSuffix = (dmy) => {
  if (!dmy) return String(new Date().getFullYear() % 100).padStart(2, '0');

  // dmy = "dd-mm-yyyy"
  const [dd, mm, yyyy] = dmy.split('-').map(Number);

  // JS month is 0-based
  const d = new Date(yyyy, mm - 1, dd);

  const fyStartYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return String(fyStartYear).slice(-2);
};

  useEffect(() => {
    // Use financial year suffix based on doc_rec_date
    const year_str = financialYearSuffix(form.doc_rec_date);
    const mapping = {
      CASH: `C01/${year_str}/R`,
      BANK: `1471/${year_str}/R`,
      UPI: `8785/${year_str}/R`,
      NA: '',
    };
    if (!form.pay_by || form.pay_by === 'NA') {
      setForm((f) => ({ ...f, pay_rec_no: '', pay_amount: 0, pay_rec_no_pre: '' }));
    } else {
      // set prefix according to mapping; override previous prefix when pay_by changes
      const pre = mapping[form.pay_by] ?? `NA/${year_str}/R`;
      setForm((f) => ({ ...f, pay_rec_no_pre: pre }));
    }
  }, [form.pay_by, form.doc_rec_date]);

  // Fetch next doc_rec_id preview when apply_for changes
  useEffect(() => {
    const ctrl = new AbortController();
    const run = async () => {
      try {
        const token = localStorage.getItem("access_token");
        const res = await fetch(`/api/docrec/next-id/?apply_for=${encodeURIComponent(form.apply_for)}&doc_rec_date=${dmyToISO(form.doc_rec_date)}`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
          console.error('next-id fetch failed:', res.status, errorData);
        }
        if (res.ok) {
          const data = await res.json();
          if (data?.next_id) {
            setForm((f) => ({ ...f, doc_rec_id: data.next_id }));
          }
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error('next-id fetch error:', e);
        }
      }
    };
    if (form.apply_for) run();
    return () => ctrl.abort();
  }, [form.apply_for, form.doc_rec_date]);

  // Listen for bulk upload completion events from other tabs/components
  useEffect(()=>{
    let bc;
    const handler = (ev) => {
      try{
        const msg = ev.data || ev;
        if (msg && msg.type === 'bulk_upload_complete'){
          // Refresh related records for current doc_rec_id
          fetchRelatedForDocRec(form.doc_rec_id);
        }
        // When other components create a DocRec, refresh recent records and related lists
        if (msg && msg.type === 'docrec_created'){
          try{ fetchRecentRecords('', 'all'); }catch(_){}
          if (msg.doc_rec_id) fetchRelatedForDocRec(msg.doc_rec_id);
        }
      }catch(e){ }
    };
    if (typeof BroadcastChannel !== 'undefined'){
      try{ bc = new BroadcastChannel('admindesk-updates'); bc.addEventListener('message', handler); }
      catch(e){ bc = null; }
    }
    const storageHandler = (e) => {
      try{ if (e.key === 'admindesk_last_bulk') handler({ data: { type: 'bulk_upload_complete' } }); }catch(_){}
    };
    window.addEventListener('storage', storageHandler);
    return ()=>{ if(bc) try{ bc.close(); }catch(e){}; window.removeEventListener('storage', storageHandler); };
  }, [form.doc_rec_id]);

  // When doc_rec_id changes (e.g., after creating a DocRec), fetch related records
  useEffect(()=>{
    if (form.doc_rec_id) {
      fetchRelatedForDocRec(form.doc_rec_id);
      fetchDocRecDetail(form.doc_rec_id);
    }
  }, [form.doc_rec_id]);

  // Recent Receipts: search/filter and display
  const [recentRecords, setRecentRecords] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [selectedRec, setSelectedRec] = useState(null); // store the selected recent record (raw + type)
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState(serviceForApply('VR')); // all | docrec | migration | provisional | verification
  const [serviceIssueError, setServiceIssueError] = useState('');
  const recInstSearchTimer = useRef(null);

  useEffect(() => () => {
    if (recInstSearchTimer.current) clearTimeout(recInstSearchTimer.current);
  }, []);

  const fetchRecentRecords = async (term = '', service = 'all') => {
    setRecentLoading(true);
    try{
      const token = localStorage.getItem('access_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const opts = { headers, credentials: 'include' };
      let url;
  if (service === 'migration') url = `/api/migration/?search=${encodeURIComponent(term)}`;
      else if (service === 'provisional') url = `/api/provisional/?search=${encodeURIComponent(term)}`;
  else if (service === 'verification') url = `/api/verification/?search=${encodeURIComponent(term)}`;
  else if (service === 'inst-verification') url = `/api/inst-verification-main/?search=${encodeURIComponent(term)}`;
      else url = `/api/docrec/?search=${encodeURIComponent(term)}`; // docrec or all default

      const res = await fetch(url, opts);
      if (!res.ok) {
        const text = await res.text();
        console.warn('fetchRecentRecords failed', res.status, text);
        setRecentRecords([]);
        return;
      }
      const data = await res.json();
      // support paginated results with `results`
      const list = data && data.results ? data.results : Array.isArray(data) ? data : (data && data.objects ? data.objects : []);
      // Normalize entries to a common shape with a `type` key
      const normalized = list.map(item => {
        // Heuristics to detect type
        if (service === 'migration' || item.mg_date || item.mg_remark) return { type: 'migration', raw: item };
        if (service === 'provisional' || item.prv_date || item.prv_number) return { type: 'provisional', raw: item };
        if (service === 'verification' || item.vr_date || item.verification_no) return { type: 'verification', raw: item };
        if (service === 'inst-verification' || item.inst_veri_number || item.rec_inst_name) return { type: 'inst-verification', raw: item };
        // docrec fallback
        return { type: 'docrec', raw: item };
      });
      setRecentRecords(normalized);
      // if results include doc_rec identifiers, sort by doc_rec_id descending so latest appear first
      try{
        const sorted = [...normalized].sort((a,b)=>{
          const ra = (a.raw && (a.raw.doc_rec || a.raw.doc_rec_id)) || a.raw.id || '';
          const rb = (b.raw && (b.raw.doc_rec || b.raw.doc_rec_id)) || b.raw.id || '';
          return String(rb).localeCompare(String(ra), undefined, {numeric:true});
        });
        setRecentRecords(sorted);
      }catch(e){}
    }catch(e){ console.warn('fetchRecentRecords error', e); setRecentRecords([]); }
    finally{ setRecentLoading(false); }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchRecentRecords(searchTerm.trim(), serviceFilter);
    }, 300);

    return () => clearTimeout(handle);
  }, [searchTerm, serviceFilter]);

  // When apply_for changes, align the service filter and refresh the list
  useEffect(()=>{
    const svc = serviceForApply(form.apply_for);
    setServiceFilter(svc);
  }, [form.apply_for]);

  // For PR/MG: show issued warning when enrollment already exists in the same service
  useEffect(() => {
    const enrollment = (form.enrollment || '').trim();
    const service = form.apply_for === 'PR' ? 'provisional' : (form.apply_for === 'MG' ? 'migration' : null);

    if (!service || !enrollment) {
      setServiceIssueError('');
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`/api/${service}/?search=${encodeURIComponent(enrollment)}`, { headers, credentials: 'include' });
        if (!res.ok) {
          if (!cancelled) setServiceIssueError('');
          return;
        }
        const data = await res.json();
        const list = data && data.results ? data.results : Array.isArray(data) ? data : (data && data.objects ? data.objects : []);

        const currentDocRec = String(form.doc_rec_id || '').trim();
        const match = list.find((item) => {
          const itemEnrollment = String(item.enrollment_no || item.enrollment || item.enrollment_no_string || '').trim().toLowerCase();
          if (!itemEnrollment || itemEnrollment !== enrollment.toLowerCase()) return false;
          if (!currentDocRec) return true;
          const itemDocRec = String(item.doc_rec_key || item.doc_rec_id || item.doc_rec || '').trim();
          return itemDocRec !== currentDocRec;
        });

        if (!cancelled) {
          setServiceIssueError(match ? `${service === 'provisional' ? 'Provisional' : 'Migration'} already issued for this enrollment number.` : '');
        }
      } catch (_) {
        if (!cancelled) setServiceIssueError('');
      }
    };

    run();
    return () => { cancelled = true; };
  }, [form.apply_for, form.enrollment, form.doc_rec_id]);

  const resolvePayment = (r) => {
    return {
      payBy: r.pay_by || null,
      payPre: r.pay_rec_no_pre || '',
      payNo: r.pay_rec_no || '',
      payAmount: (typeof r.pay_amount === 'undefined' || r.pay_amount === null) ? '' : r.pay_amount,
    };
  };

  const resolveDocRecId = (r) => {
    const raw = (
      r.doc_rec_key ||     // Verification (NEW)
      r.doc_rec_id ||      // DocRec / Provisional
      (typeof r.doc_rec === 'string' ? r.doc_rec : '') ||
      ''
    );
    // For display, format IV IDs; keep raw elsewhere
    const applyFor = r.apply_for || (r.type === 'inst-verification' ? 'IV' : null);
    return formatDocRecId(raw, applyFor);
  };

  const formatRecentDate = (value) => {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    // Convert ISO-like values to dd-mm-yyyy for consistent display.
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return isoToDMY(raw.slice(0, 10));
    // Strip time when values are already in day-first formats.
    if (/^\d{2}-\d{2}-\d{4}/.test(raw)) return raw.slice(0, 10);
    if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) return raw.slice(0, 10);
    return raw;
  };

  const displayApplyFor = (applyFor) => {
    const key = (applyFor || '').toUpperCase();
    return APPLY_FOR_LABELS[key] || applyFor || '';
  };

  const normalizeRecentValue = (value) => {
    const s = (value === null || typeof value === 'undefined') ? '' : String(value).trim();
    return s || '-';
  };

  const recentSegmentClass = (kind) => {
    if (kind === 'payment') return 'font-bold text-indigo-700';
    if (kind === 'date') return 'font-semibold text-emerald-700';
    return 'text-gray-900';
  };

  const buildRecentRowValues = (type, r) => {
    const docId = resolveDocRecId(r);
    const enrollment = r.enrollment_no || r.enrollment || r.enrollment_no_string || '';
    const studentName = r.student_name || r.name || r.full_name || '';
    const recInstName = r.rec_inst_name || r.rec_inst_city || '';
    const { payBy, payPre, payNo, payAmount } = resolvePayment(r);
    const payReceipt = payBy && payBy !== 'NA' ? `${payPre || ''}${payNo || ''}` : '';
    const amount = (payAmount === null || typeof payAmount === 'undefined') ? '' : String(payAmount);
    const docDate = formatRecentDate(
      r.doc_rec_date || r.created_at || r.received_at || r.vr_date || r.prv_date || r.mg_date || r.inst_veri_date || ''
    );
    const docRemark = r.doc_remark || r.doc_rec_remark || '';

    if (type === 'verification' || type === 'migration' || type === 'provisional') {
      return [docId, enrollment, studentName, payBy || '', payReceipt, amount, docDate, docRemark];
    }
    if (type === 'inst-verification') {
      return [docId, recInstName, payBy || '', payReceipt, amount, docDate, docRemark];
    }
    // "all" currently lists DocRec rows.
    return [docId, docDate, displayApplyFor(r.apply_for), payBy || '', payReceipt, amount];
  };

  const buildRecentRowSegments = (type, r) => {
    const values = buildRecentRowValues(type, r);
    if (type === 'verification' || type === 'migration' || type === 'provisional') {
      return [
        { text: values[0], kind: 'default' },
        { text: values[1], kind: 'default' },
        { text: values[2], kind: 'default' },
        { text: values[3], kind: 'payment' },
        { text: values[4], kind: 'payment' },
        { text: values[5], kind: 'payment' },
        { text: values[6], kind: 'date' },
        { text: values[7], kind: 'default' },
      ];
    }
    if (type === 'inst-verification') {
      return [
        { text: values[0], kind: 'default' },
        { text: values[1], kind: 'default' },
        { text: values[2], kind: 'payment' },
        { text: values[3], kind: 'payment' },
        { text: values[4], kind: 'payment' },
        { text: values[5], kind: 'date' },
        { text: values[6], kind: 'default' },
      ];
    }
    // all/docrec
    return [
      { text: values[0], kind: 'default' },
      { text: values[1], kind: 'date' },
      { text: values[2], kind: 'default' },
      { text: values[3], kind: 'payment' },
      { text: values[4], kind: 'payment' },
      { text: values[5], kind: 'payment' },
    ];
  };

  const onRecordClick = (rec) => {
    const r = rec.raw || rec;
    const payBy = r.pay_by || null;
    const payPre = r.pay_rec_no_pre || '';
    const payNo = r.pay_rec_no || '';

    const type = rec.type || 'docrec';
    // Some records have doc_rec or doc_rec_id or id
    const docRecIdRaw = r.doc_rec_key || r.doc_rec_id || r.doc_rec || '';
    const docRecId = docRecIdRaw; // keep raw for fetches

    const studentName = r.student_name || r.student || r.name || '';
    const enrollmentNo = r.enrollment_no || r.enrollment_no_string || r.enrollment || '';
    const enrollmentId = r.enrollment_id || r.enrollment_pk || null;
    // Overwrite the form with selected record values (clear fields when absent)
    setForm({
      apply_for: r.apply_for || form.apply_for || 'VR',
      pay_by: payBy || form.pay_by || 'NA',
      pay_amount: (typeof r.pay_amount !== 'undefined' && r.pay_amount !== null) ? r.pay_amount : (form.pay_amount || 0),
      doc_rec_date: r.doc_rec_date ? (typeof r.doc_rec_date === 'string' ? isoToDMY(r.doc_rec_date) : form.doc_rec_date) : (form.doc_rec_date || todayDMY()),
      doc_rec_id: docRecId,
      pay_rec_no_pre: payPre || r.pay_rec_pre || form.pay_rec_no_pre || '',
      pay_rec_no: payNo || r.pay_receipt_no || form.pay_rec_no || '',
      doc_remark: r.doc_remark || form.doc_remark || '',
      // verification specific
      enrollment: enrollmentNo,
      enrollment_id: enrollmentId,
      second_enrollment: r.second_enrollment || '',
      student_name: studentName,
      institute_id: r.institute || r.institute_id || '',
      sub_course: r.sub_course || r.subcourse || '',
      main_course: r.main_course || r.maincourse || '',
      tr: r.tr_count || r.tr || 0,
      ms: r.ms_count || r.ms || 0,
      dg: r.dg_count || r.dg || 0,
      moi: r.moi_count || r.moi || 0,
      backlog: r.backlog_count || r.backlog || 0,
      eca_required: !!r.eca_required,
      // inst-verify
      rec_by: r.rec_by || '',
      rec_inst_name: r.rec_inst_name || '',
      rec_inst_suggestions: [],
      rec_inst_loading: false,
      // provisional/migration fields
      prv_number: r.prv_number || '',
      prv_date: r.prv_date ? (typeof r.prv_date === 'string' ? isoToDMY(r.prv_date) : '') : '',
      mg_number: r.mg_number || '',
      mg_date: r.mg_date ? (typeof r.mg_date === 'string' ? isoToDMY(r.mg_date) : '') : '',
      passing_year: r.passing_year || '',
      exam_year: r.exam_year || '',
      admission_year: r.admission_year || '',
      mg_status: r.mg_status || 'Issued',
      mg_cancelled: r.mg_cancelled || 'No',
      mg_remark: r.mg_remark || '',
      book_no: r.book_no || '',
    });
    if (docRecId) fetchRelatedForDocRec(docRecId);
    // remember selected record so UI can show Update/Delete actions
    setSelectedRec({ raw: r, type });
  };

  const authHeaders = () => {
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const clamp3 = (n) => {
    const x = Math.max(0, Math.min(999, Number.isNaN(+n) ? 0 : +n));
    return x;
  };

  const onSelect = (a) => {
    setSelected((cur) => (cur === a ? a : a));
    setPanelOpen(true);
  };

  const createDocRec = async () => {
    const payload = {
      apply_for: form.apply_for,
      pay_by: form.pay_by,
      pay_amount: +form.pay_amount || 0,
      pay_rec_no: form.pay_by === 'NA' ? null : (form.pay_rec_no || null),
      // send ISO date if provided
      doc_rec_date: form.doc_rec_date ? dmyToISO(form.doc_rec_date) : undefined,
      doc_remark: form.doc_remark || null,
    };
    const res = await fetch("/api/docrec/", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || "Failed to create doc rec");
    }
    const row = await res.json();
    setForm((f) => ({
      ...f,
      doc_rec_id: row.doc_rec_id,
      pay_rec_no_pre: row.pay_rec_no_pre || "",
    }));
    // Broadcast the new DocRec so other tabs/components can auto-sync
    try{
      if (typeof BroadcastChannel !== 'undefined'){
        const bc = new BroadcastChannel('admindesk-updates');
        bc.postMessage({ type: 'docrec_created', doc_rec_id: row.doc_rec_id || row.doc_rec || row.id });
        bc.close();
      } else {
        // Fallback: write to localStorage to trigger storage event listeners
        try{ localStorage.setItem('admindesk_last_docrec', JSON.stringify({ ts: Date.now(), doc_rec_id: row.doc_rec_id || row.doc_rec || row.id })); }catch(_){ }
      }
    }catch(e){ /* ignore broadcast errors */ }
    // locally refresh recent records and related lists so the UI updates immediately
    try{ fetchRecentRecords('', 'all'); }catch(_){ }
    try{ fetchRecentRecords('', serviceForApply(form.apply_for)); }catch(_){ }
    try{ fetchRelatedForDocRec(row.doc_rec_id || row.doc_rec || row.id); }catch(_){ }
    // If this DocRec is for Verification and user provided enrollment or student_name,
    // automatically create the linked Verification so the DocRec immediately shows a verification row.
      // The backend `DocRecViewSet.perform_create` already attempts to create a
      // linked Verification for apply_for='VR'. Instead of issuing a duplicate
      // client-side POST, poll the verification list for the new item so the UI
      // refreshes and shows the server-created row.
      try {
        if (form.apply_for === 'VR') {
          const docId = row.doc_rec_id || row.doc_rec || row.id;
          // Try a few times to fetch related verification rows produced by the server.
          const tryFetch = async () => {
            try {
              const token = localStorage.getItem('access_token');
              const headers = token ? { Authorization: `Bearer ${token}` } : {};
              const res = await fetch(`/api/verification/?doc_rec=${encodeURIComponent(docId)}`, { headers });
              if (!res.ok) return null;
              const data = await res.json();
              const items = data && data.results ? data.results : (Array.isArray(data) ? data : (data && data.objects ? data.objects : []));
              return items;
            } catch (e) { return null; }
          };
          let found = null;
          for (let i = 0; i < 4; i++) {
            // small delay between attempts to allow server-side create to complete
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 250));
            // eslint-disable-next-line no-await-in-loop
            const items = await tryFetch();
            if (items && items.length) { found = items; break; }
          }
          // Refresh related lists so the UI shows the verification row if present
          try { fetchRelatedForDocRec(docId); } catch (_) {}
          try { fetchRecentRecords('', 'verification'); } catch (_) {}
          if (!found) console.debug('No verification row found after creating DocRec (server may create it asynchronously)');
        }
      } catch (e) {
        console.warn('createDocRec: verification refresh failed', e);
      }

    return row;
  };

  // basic UI only; backend integration of sub-flows to be completed per endpoint availability

  const submit = async () => {
    if ((form.apply_for === 'PR' || form.apply_for === 'MG') && serviceIssueError) {
      throw new Error(serviceIssueError);
    }

    // 1) Create doc_rec
    const rec = await createDocRec();

    // 2) Backend signal auto-creates Verification/InstVerificationMain, but we need to update with user's data
    
    if (form.apply_for === "VR") {
      // Backend signal creates a placeholder Verification - now update it with actual data
      // Wait a moment for signal to create the record
      await new Promise(r => setTimeout(r, 300));
      
      try {
        // Find the verification record created by the signal
        const vrRes = await fetch(`/api/verification/?doc_rec=${encodeURIComponent(rec.doc_rec_id || rec.id)}&limit=1`, { headers: authHeaders() });
        if (vrRes.ok) {
          const vrData = await vrRes.json();
          const vrList = vrData.results || vrData || [];
          if (vrList.length > 0) {
            const vr = vrList[0];
            // Update the signal-created verification with user's form data
            const updatePayload = {
              enrollment_no: form.enrollment || null,
              student_name: form.student_name || null,
              tr_count: clamp3(form.tr),
              ms_count: clamp3(form.ms),
              dg_count: clamp3(form.dg),
              moi_count: clamp3(form.moi),
              backlog_count: clamp3(form.backlog),
              doc_rec_remark: form.doc_remark || null,
              status: 'IN_PROGRESS',
            };
            
            await fetch(`/api/verification/${vr.id}/`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify(updatePayload),
            });
          }
        }
      } catch (e) {
        console.warn('Failed to update verification with form data', e);
      }
      
      // Refresh UI
      fetchRelatedForDocRec(rec.doc_rec_id || rec.id);
      try{ if (typeof BroadcastChannel !== 'undefined'){ const bc = new BroadcastChannel('admindesk-updates'); bc.postMessage({ type: 'docrec_created', doc_rec_id: rec.doc_rec_id || rec.id }); bc.close(); } }catch(e){}
    } else if (form.apply_for === "PR") {
      const payload = {
        doc_rec: rec.id,
        enrollment: form.enrollment || null,
        student_name: form.student_name || "",
        institute: form.institute_id || null,
        subcourse: form.sub_course || null,
        maincourse: form.main_course || null,
        class_obtain: form.class_obtain || null,
        prv_number: form.prv_number,
        prv_date: dmyToISO(form.prv_date) || null,
        passing_year: form.passing_year,
        prv_status: "Pending",
        pay_rec_no: rec.pay_rec_no || "",
        doc_rec_remark: form.doc_remark || null,
      };
      await fetch("/api/provisional/", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
    } else if (form.apply_for === "MG") {
      const payload = {
        doc_rec_key: rec.doc_rec_id || rec.doc_rec || null,
        enrollment: form.mg_cancelled === 'Yes' ? null : (form.enrollment || null),
        student_name: form.mg_cancelled === 'Yes' ? '' : (form.student_name || ""),
        institute: form.institute_id || null,
        subcourse: form.sub_course || null,
        maincourse: form.main_course || null,
        mg_number: form.mg_number,
        mg_date: dmyToISO(form.mg_date) || null,
        exam_year: form.exam_year,
        admission_year: form.admission_year,
        mg_status: form.mg_cancelled === 'Yes' ? 'Cancelled' : (form.mg_status || "Issued"),
        mg_cancelled: form.mg_cancelled || 'No',
        mg_remark: form.mg_remark || null,
        book_no: form.book_no || null,
        pay_rec_no: rec.pay_rec_no || "",
        doc_rec_remark: form.doc_remark || null,
      };
      await fetch("/api/migration/", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
    }

    // Reset form for new entry after save
    setForm({ ...initialForm, doc_rec_date: todayDMY() });

    // Refresh recent list to show the newly created record for the selected service
    try { fetchRecentRecords('', serviceForApply(form.apply_for)); } catch (_) {}
  };

  // Update an existing DocRec and related Verification atomically
  const updateDocRec = async () => {
    if (!selectedRec || !selectedRec.raw) throw new Error('No record selected');
    const r = selectedRec.raw;
    const docRecId = r.doc_rec || r.doc_rec_id || form.doc_rec_id;
    if (!docRecId) throw new Error('Cannot determine doc_rec_id');

    const doc_rec_data = {
      apply_for: form.apply_for,
      pay_by: form.pay_by,
      pay_amount: +form.pay_amount || 0,
      pay_rec_no: form.pay_by === 'NA' ? null : (form.pay_rec_no || null),
      doc_rec_date: form.doc_rec_date ? dmyToISO(form.doc_rec_date) : null,
      doc_remark: form.doc_remark || null,
    };

    const verification_data = {
      enrollment_no: form.enrollment || null,
      second_enrollment_id: form.second_enrollment || null,
      student_name: form.student_name || null,
      tr_count: clamp3(form.tr),
      ms_count: clamp3(form.ms),
      dg_count: clamp3(form.dg),
      moi_count: clamp3(form.moi),
      backlog_count: clamp3(form.backlog),
      pay_rec_no: form.pay_rec_no || null,
      doc_rec_remark: form.doc_remark || null,
    };

    const payload = {
      doc_rec_id: docRecId,
      doc_rec_data,
      verification_data,
    };

    const res = await fetch('/api/docrec/update-with-verification/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Update failed: ${res.status} ${txt}`);
    }

    // refresh lists
    try { fetchRecentRecords('', 'all'); } catch (_) {}
    try { fetchRelatedForDocRec(form.doc_rec_id); } catch (_) {}
    return await res.json();
  };

  const deleteDocRec = async () => {
    if (!selectedRec || !selectedRec.raw) throw new Error('No record selected');
    const r = selectedRec.raw;
    const docRecId = r.doc_rec || r.doc_rec_id || form.doc_rec_id;
    if (!docRecId) throw new Error('Cannot determine doc_rec_id');

    const payload = { doc_rec_id: docRecId };
    const res = await fetch('/api/docrec/delete-with-verification/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Delete failed: ${res.status} ${txt}`);
    }

    try { fetchRecentRecords('', 'all'); } catch (_) {}
    try { fetchRelatedForDocRec(form.doc_rec_id); } catch (_) {}
    return true;
  };

  const handleSaveNew = async () => {
    try {
      await submit();
      showFlash('Saved!');
      // Keep explicit reset shape used by existing Save flow.
      setForm({
        apply_for: "VR",
        pay_by: "NA",
        pay_amount: 0,
        doc_rec_date: todayDMY(),
        doc_rec_id: "",
        pay_rec_no_pre: "",
        pay_rec_no: "",
        doc_remark: "",
        enrollment: "",
        enrollment_id: null,
        second_enrollment: "",
        student_name: "",
        institute_id: "",
        sub_course: "",
        main_course: "",
        class_obtain: "",
        tr: 0, ms: 0, dg: 0, moi: 0, backlog: 0,
        eca_required: false,
        rec_by: "",
        rec_inst_name: "",
        rec_inst_suggestions: [],
        rec_inst_loading: false,
        prv_number: "",
        prv_date: "",
        passing_year: "",
        mg_number: "",
        mg_date: "",
        exam_year: "",
        admission_year: "",
        mg_status: "Issued",
        mg_cancelled: "No",
        mg_remark: "",
        book_no: "",
      });
      fetchRecentRecords('', 'all');
    } catch (e) {
      alert(e.message || 'Failed');
    }
  };

  const leftSlot = (
    <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-sky-600 text-white text-xl">📥</div>       
  );
  return (
    <div className="p-2 md:p-3 space-y-4 h-full">
      {/* Flash message popup */}
      {flashMsg && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded shadow-lg animate-fade-in-out">
          {flashMsg}
        </div>
      )}
      <PageTopbar
        title="Doc Receive"
        actions={ACTIONS}
        selected={selected}
        onSelect={onSelect}
        onToggleSidebar={onToggleSidebar}
        onToggleChatbox={onToggleChatbox}
        actionsOnLeft
        leftSlot={leftSlot}
      />

      {/* Collapsible Action Box */}
      <div className="action-panel-shell">
        <div className="action-panel-header">
          <div className="action-panel-title">{selected ? `${selected} Panel` : "Action Panel"}</div>
          <PanelToggleButton open={panelOpen} onClick={() => setPanelOpen((o) => !o)} />
        </div>

        {panelOpen && selected === "➕" && (
          <div className="action-panel-body">
          <div className={`px-2 pt-2 pb-1 ${GRID24}`}>
            {/* doc_rec_date */}
            <div className="md:col-span-3">
              <label className="text-sm">Doc Rec Date</label>
              <input type="date" className="w-full border rounded-lg p-2" value={(form.doc_rec_date && dmyToISO(form.doc_rec_date)) || ''} onChange={(e)=>handleChange("doc_rec_date", e.target.value ? isoToDMY(e.target.value) : todayDMY())} />
            </div>

            {/* apply_for */}
            <div className="md:col-span-3">
              <label className="text-sm">Apply For</label>
              <select className="w-full border rounded-lg p-2" value={form.apply_for} onChange={(e)=>handleChange("apply_for", e.target.value)}> {APPLY_FOR.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </div>

            {/* doc_rec_id preview */}
            <div className="md:col-span-3">
              <label className="text-sm">Doc Rec ID (next)</label>
              <input className="w-full border rounded-lg p-2" value={formatDocRecId(form.doc_rec_id, form.apply_for)} readOnly />
            </div>

            {/* pay_by */}
            <div className="md:col-span-3">
              <label className="text-sm">Pay By</label>
              <select className="w-full border rounded-lg p-2" value={form.pay_by} onChange={(e)=>handleChange("pay_by", e.target.value)}> {PAY_BY.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </div>

            {/* pay_rec_no_pre (readonly preview), only show when pay_by not NA */}
            {form.pay_by && form.pay_by !== 'NA' && (
              <div className="md:col-span-2">
                <label className="text-sm">Pay Receipt Prefix</label>
                <input className="w-full border rounded-lg p-2" value={form.pay_rec_no_pre} readOnly />
              </div>
            )}

            {/* pay_rec_no */}
            {form.pay_by && form.pay_by !== 'NA' ? (
              <div className="md:col-span-2">
                <label className="text-sm">Receipt No</label>
                <input className="w-full border rounded-lg p-2" value={form.pay_rec_no} onChange={(e)=>handleChange("pay_rec_no", e.target.value)} />
              </div>
            ) : null}

            {/* pay_amount */}
            {form.pay_by && form.pay_by !== 'NA' ? (
              <div className="md:col-span-3">
                <label className="text-sm">Amount</label>
                <input type="number" className="w-full border rounded-lg p-2" value={form.pay_amount} onChange={(e)=>handleChange("pay_amount", e.target.value)} />
              </div>
            ) : null}

            {/* doc_remark */}
            <div className={`${form.pay_by === 'NA' ? 'md:col-span-12' : 'md:col-span-5'}`}>
              <label className="text-sm">Doc Remark</label>
              <input className="w-full border rounded-lg p-2" value={form.doc_remark} onChange={(e)=>handleChange("doc_remark", e.target.value)} />
            </div>
            </div>
            {/* If VR show verification options (simplified UI as placeholder) */}
            {form.apply_for === 'VR' && (
              <div className={`px-2 pt-0 pb-2 ${GRID24} items-end`}>
                <div className="md:col-span-4">
                  <label className="text-sm">Enrollment No</label>
                  <input className="w-full border rounded-lg p-2" placeholder="e.g. 20MSCCHEM22184" value={form.enrollment} onChange={(e)=>handleChange("enrollment", e.target.value)} />
                </div>
                <div className="md:col-span-4">
                  <label className="text-sm">2nd Enrollment</label>
                  <input className="w-full border rounded-lg p-2" value={form.second_enrollment} onChange={(e)=>handleChange("second_enrollment", e.target.value)} />
                </div>
                <div className="md:col-span-8">
                  <label className="text-sm">Student Name</label>
                  <input className="w-full border rounded-lg p-2" value={form.student_name} onChange={(e)=>handleChange("student_name", e.target.value)} />
                </div>

                <div className="md:col-span-1">
                  <label className="text-sm">TR</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2" value={form.tr} onChange={(e)=>handleChange("tr", clamp3(e.target.value))} />
                </div>
                <div className="md:col-span-1">
                  <label className="text-sm">MS</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2" value={form.ms} onChange={(e)=>handleChange("ms", clamp3(e.target.value))} />
                </div>
                <div className="md:col-span-1">
                  <label className="text-sm">DG</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2" value={form.dg} onChange={(e)=>handleChange("dg", clamp3(e.target.value))} />
                </div>
                <div className="md:col-span-1">
                  <label className="text-sm">MOI</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2" value={form.moi} onChange={(e)=>handleChange("moi", clamp3(e.target.value))} />
                </div>
                <div className="md:col-span-1">
                  <label className="text-sm">Backlog</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2" value={form.backlog} onChange={(e)=>handleChange("backlog", clamp3(e.target.value))} />
                </div>
                {!selectedRec && (
                  <div className="md:col-span-3 flex justify-end items-end">
                    <button
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white"
                      onClick={handleSaveNew}
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* If inst-verification, rec_by & rec_inst_name */}
            {form.apply_for === 'IV' && (
              <div className={`px-2 pt-0 pb-2 ${GRID24} items-end`}>
                <div className="md:col-span-4">
                  <label className="text-sm">Received By</label>
                  <select className="w-full border rounded-lg p-2" value={form.rec_by} onChange={(e)=>handleChange("rec_by", e.target.value)}>
                    <option value="">--</option>
                    <option value="Mail">Mail</option>
                    <option value="Post">Post</option>
                    <option value="Self">Self</option>
                  </select>
                </div>
                <div className="md:[grid-column:span_16/span_16]">
                  <label className="text-sm">Rec Inst Name (type 3 chars)</label>
                  <div className="relative">
                    <input
                      className="w-full border rounded-lg p-2"
                      value={form.rec_inst_name}
                      onChange={async (e)=>{
                        const v = e.target.value;
                        handleChange("rec_inst_name", v);
                        if (recInstSearchTimer.current) clearTimeout(recInstSearchTimer.current);
                        if ((v||"").trim().length < 3) {
                          handleChange("rec_inst_suggestions", []);
                          return;
                        }
                        recInstSearchTimer.current = setTimeout(async () => {
                          try {
                            const res = await fetch(`/api/inst-verification-main/search-rec-inst/?q=${encodeURIComponent(v.trim())}`, {
                              headers: { ...authHeaders(), Accept: "application/json" },
                              credentials: "include",
                            });
                            if (!res.ok) throw new Error("search failed");
                            const items = await res.json();
                            const names = Array.from(new Set((items || []).map((x) => (x?.name || "").trim()).filter(Boolean)));
                            handleChange("rec_inst_suggestions", names.map((name) => ({ name })));
                          } catch {
                            handleChange("rec_inst_suggestions", []);
                          }
                        }, 300);
                      }}
                    />
                    {Array.isArray(form.rec_inst_suggestions) && form.rec_inst_suggestions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg max-h-60 overflow-auto shadow">
                        {form.rec_inst_suggestions.map((s)=> (
                          <div key={s.name} className="px-3 py-2 hover:bg-gray-50 cursor-pointer" onClick={()=>{
                            handleChange("rec_inst_name", s.name);
                            handleChange("rec_inst_suggestions", []);
                          }}>{s.name}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {!selectedRec && (
                  <div className="md:col-span-4 flex justify-end">
                    <button className="save-button" onClick={handleSaveNew}>Save</button>
                  </div>
                )}
              </div>
            )}

            {/* Provisional / Migration minimal UI */}
            {form.apply_for === 'PR' && (
              <div className={`px-2 pt-0 pb-2 ${GRID24} items-end`}>
                <div className="md:col-span-10">
                  <label className="text-sm">Enrollment No</label>
                  <input className="w-full border rounded-lg p-2" placeholder="e.g. 20MSCCHEM22184" value={form.enrollment} onChange={(e)=>handleChange("enrollment", e.target.value)} />
                </div>
                <div className="md:col-span-10">
                  <label className="text-sm">Name</label>
                  <input className="w-full border rounded-lg p-2 bg-gray-50" value={form.student_name} readOnly />
                </div>
                {!selectedRec && (
                  <div className="md:col-span-4 flex justify-end items-end">
                    <button className="save-button" onClick={handleSaveNew}>Save</button>
                  </div>
                )}
                {serviceIssueError && <div className="md:col-span-full text-sm text-red-600">{serviceIssueError}</div>}
              </div>
            )}

            {form.apply_for === 'MG' && (
              <div className={`px-2 pt-0 pb-2 ${GRID24} items-end`}>
                <div className="md:col-span-10">
                  <label className="text-sm">Enrollment No</label>
                  <input className="w-full border rounded-lg p-2" placeholder="e.g. 20MSCCHEM22184" value={form.enrollment} onChange={(e)=>handleChange("enrollment", e.target.value)} />
                </div>
                <div className="md:col-span-10">
                  <label className="text-sm">Name</label>
                  <input className="w-full border rounded-lg p-2 bg-gray-50" value={form.student_name} readOnly />
                </div>
                {!selectedRec && (
                  <div className="md:col-span-4 flex justify-end items-end">
                    <button className="save-button" onClick={handleSaveNew}>Save</button>
                  </div>
                )}
                {serviceIssueError && <div className="md:col-span-full text-sm text-red-600">{serviceIssueError}</div>}
              </div>
            )}

            {!selectedRec && !['VR', 'IV', 'PR', 'MG'].includes(form.apply_for) && (
              <div className="p-4 flex justify-end mt-2">
                <button className="save-button" onClick={handleSaveNew}>Save</button>
              </div>
            )}

            {selectedRec && (
              <div className="p-4 flex justify-end space-x-2 mt-2">
                <button className="save-button" onClick={async()=>{
                  try {
                    await updateDocRec();
                    setSelectedRec(null);
                    showFlash('Updated successfully!');
                  } catch(e){ alert(e.message || 'Update failed'); }
                }}>Update</button>
                <button className="px-4 py-2 rounded-lg bg-red-600 text-white" onClick={async()=>{
                  if (!confirm('Delete this DocRec? This will also remove related rows where cascade applies.')) return;
                  try { await deleteDocRec(); alert('Deleted'); setSelectedRec(null); setForm((f)=>({ ...f, doc_rec_id: '', enrollment: '', enrollment_id: null, student_name: '' })); } catch(e){ alert(e.message || 'Delete failed'); }
                }}>Delete</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Placeholder table of latest DocRecs could go below; wire as needed */}
      <div className="border rounded-2xl p-3 bg-white">
        <div className="rounded-xl border bg-gray-50 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-100/80">
            <div className="text-lg font-semibold text-gray-900">Recent Receipts</div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-5">
                <label className="text-sm font-medium text-gray-700">Search</label>
                <SearchField
                  className="w-full"
                  placeholder="Search by doc_rec_id, name, enrollment_no"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="text-sm font-medium text-gray-700">Record Type</label>
                <select className="w-full border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-200" value={serviceFilter} onChange={(e)=>{ setServiceFilter(e.target.value); }}>
                  <option value="all">All</option>
                  <option value="migration">Migration</option>
                  <option value="provisional">Provisional</option>
                  <option value="verification">Verification</option>
                  <option value="inst-verification">Inst-Verification</option>
                </select>
              </div>
              <div className="lg:col-span-4 flex items-end lg:justify-end gap-2">
                <button className="reset-button" onClick={()=>{ setSearchTerm(''); setServiceFilter('all'); fetchRecentRecords('', 'all'); }}>Reset</button>
              </div>
            </div>
          </div>
        </div>

            <div>
              {recentLoading && <div className="text-muted">Loading...</div>}
              {!recentLoading && recentRecords.length === 0 && <div className="text-muted">No records found.</div>}
              <div className="space-y-1">
                {recentRecords.map((rec, idx) => {
                  const r = rec.raw || rec;
                  const type = rec.type || 'docrec';
                  const docId = resolveDocRecId(r);
                  const rowSegments = buildRecentRowSegments(type, r).map((seg) => ({
                    ...seg,
                    text: normalizeRecentValue(seg.text),
                  }));

                  return (
                    <div key={`${type}-${docId}-${idx}`} className="p-2 border rounded-xl hover:bg-gray-50 cursor-pointer" onClick={()=>onRecordClick(rec)}>
                      <div className="text-sm font-medium whitespace-pre overflow-x-auto">
                        {rowSegments.length ? rowSegments.map((seg, segIdx) => (
                          <React.Fragment key={`${type}-${docId}-${idx}-${segIdx}`}>
                            {segIdx > 0 ? '  ' : ''}
                            <span className={recentSegmentClass(seg.kind)}>{seg.text}</span>
                          </React.Fragment>
                        )) : 'No details'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
    </div>
  );
}
