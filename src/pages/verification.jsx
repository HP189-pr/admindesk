import React, { useEffect, useMemo, useState } from "react";
import { isoToDMY, dmyToISO } from "../utils/date";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import PageTopbar from "../components/PageTopbar";

/**
 * Verification.jsx
 * - Header: logo + name + actions + Home button (right)
 * - Collapsible action box that toggles open/close when clicking the action buttons
 * - Records table showing latest verification rows with all requested columns
 *
 * Tailwind required. Replace fetch URLs with your Django endpoints.
 */

const ACTIONS = ["➕", "✏️ Edit", "🔍", "📄 Report", "📊 Excel Upload"];

const Badge = ({ text }) => {
  const color =
    text === "DONE" ? "emerald" :
    text === "CORRECTION" ? "yellow" :
    text === "PENDING" ? "orange" :
    text === "CANCEL" ? "rose" : "slate";
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded-full bg-${color}-100 text-${color}-800`}>
      {text || "-"}
    </span>
  );
};

const MailBadge = ({ text }) => {
  const color =
    text === "SENT" ? "emerald" :
    text === "FAILED" ? "rose" : "slate";
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded-full bg-${color}-100 text-${color}-800`}>
      {text || "-"}
    </span>
  );
};

export default function Verification({ selectedTopbarMenu, setSelectedTopbarMenu, onToggleSidebar, onToggleChatbox }) {
  // Topbar actions and collapsible panel
  const [panelOpen, setPanelOpen] = useState(false);
  const [localSelected, setLocalSelected] = useState(null);
  const getSelected = () => (typeof selectedTopbarMenu !== 'undefined' ? selectedTopbarMenu : localSelected);
  const setSelected = (val) => {
    if (typeof setSelectedTopbarMenu === 'function') setSelectedTopbarMenu(val);
    else setLocalSelected(val);
  };
  const handleTopbarSelect = (action) => {
    const current = getSelected();
    if (current === action) {
      const nextOpen = !panelOpen;
      setPanelOpen(nextOpen);
      if (!nextOpen) setSelected(null);
    } else {
      setSelected(action);
      if (!panelOpen) setPanelOpen(true);
    }
  };

  // Form/search state (simplified placeholders; wire these to your serializers/views)
  const [form, setForm] = useState({
  date: isoToDMY(new Date().toISOString().slice(0, 10)),
  vr_done_date: "",
    enrollment_id: "",
    second_enrollment_id: "",
    name: "",
    tr: 0, ms: 0, dg: 0, moi: 0, backlog: 0,
    status: "IN_PROGRESS",
    final_no: "",
    mail_status: "NOT_SENT",
    eca_required: false,
    eca_name: "",
    eca_ref_no: "",
    eca_send_date: "",
    eca_status: "",
    eca_resubmit_date: "",
    eca_remark: "",
    remark: "",
    pay_rec_no: "",
    doc_rec_id: "",
    doc_rec_key: "",
  });

  // Records list (latest first)
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [q, setQ] = useState(""); // search query

  // no-op: toggling is handled by handleTopbarSelect

  // === API hooks (replace with your endpoints) ===
  const authHeaders = () => {
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadRecords = async () => {
    setLoading(true);
    try {
      // GET /api/verification/ (use trailing slash and limit param)
      // If the query looks like a DocRec identifier (vr_xxx or iv_xxx etc.), use the dedicated doc_rec filter
      let url;
      const qtrim = (q || '').toString().trim();
      if (qtrim && (/^(vr_|iv_|pr_|mg_|gt_)/i).test(qtrim)) {
        url = `/api/verification/?doc_rec=${encodeURIComponent(qtrim)}&limit=50`;
      } else if (q) {
        // User searched something - use search with limit 50
        url = `/api/verification/?search=${encodeURIComponent(q)}&limit=50`;
      } else {
        // Initial load: get last 200 records (by ID desc) + all PENDING + all IN_PROGRESS
        // This loads faster and shows the most important records
        url = `/api/verification/?limit=200&include_pending=true`;
      }
      const res = await fetch(url, { headers: { ...authHeaders() } });
      // If not OK, surface the status/text to help debug why no records appear (401/403 etc)
      if (!res.ok) {
        let txt = '';
        try { txt = await res.text(); } catch (e) { txt = res.statusText || String(res.status); }
        console.error('Verification load error', res.status, txt);
        setErrorMsg(`Failed to load records: ${res.status} ${res.statusText}` + (txt ? ` - ${txt}` : ''));
        setRecords([]);
        return;
      }
      const data = await res.json();
      // Accept either raw array or DRF paginated response { results: [...] }
      const rows = Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : []);

      // Map backend verification table fields to UI-friendly keys expected by the component
      const mapped = rows.map((r) => ({
        id: r.id,
        // Prefer verification's own `doc_rec_date`, then legacy `date`, then nested doc_rec date, then createdat
        date: isoToDMY(
          r.doc_rec_date || r.date || (r.doc_rec && r.doc_rec.doc_rec_date) || r.createdat || ''
        ),
        enrollment_no: r.enrollment_no || (r.enrollment && r.enrollment.enrollment_no) || '',
        enrollment: r.enrollment || null,
        second_enrollment_no: r.second_enrollment_no || (r.second_enrollment && r.second_enrollment.enrollment_no) || '',
        student_name: r.student_name || '',
        tr_count: r.tr_count ?? 0,
        ms_count: r.ms_count ?? 0,
        dg_count: r.dg_count ?? 0,
        moi_count: r.moi_count ?? 0,
        backlog_count: r.backlog_count ?? 0,
        status: r.status || '',
        // Prefer the verification done date; if absent, fall back to verification.date, doc_rec date, then createdat
        vr_done_date: isoToDMY(
          r.vr_done_date || r.last_resubmit_date || r.doc_rec_date || r.date || (r.doc_rec && r.doc_rec.doc_rec_date) || r.createdat || ''
        ),
        final_no: r.final_no || '',
        mail_status: r.mail_send_status || r.mail_status || '',
        pay_rec_no: r.pay_rec_no || '',
        doc_rec_remark: r.doc_rec_remark || r.vr_remark || '',
        // expose doc_rec identifier so UI can show DocRec ID instead of numeric sequence
        doc_rec_key: r.doc_rec_key || (r.doc_rec && r.doc_rec.doc_rec_id) || r.sequence || r.doc_rec_id || '',
        doc_rec_id: r.doc_rec_id || (r.doc_rec && (r.doc_rec.doc_rec_id || r.doc_rec.id)) || '',
        eca_required: !!r.eca_required,
        eca_name: r.eca_name || '',
        eca_ref_no: r.eca_ref_no || '',
        eca_send_date: r.eca_send_date || '',
        eca_status: r.eca_status || '',
        eca_resubmit_date: r.eca_resubmit_date || '',
      }));

      // Sort: IN_PROGRESS and PENDING first, then by final_no descending
      const extractDigits = (s) => {
        if (!s) return NaN;
        const d = String(s).replace(/\D+/g, "");
        return d ? parseInt(d, 10) : NaN;
      };

      const cmpFinalNo = (a, b) => {
        // Priority 1: IN_PROGRESS and PENDING always on top
        const aIsPriority = a.status === 'IN_PROGRESS' || a.status === 'PENDING';
        const bIsPriority = b.status === 'IN_PROGRESS' || b.status === 'PENDING';
        
        if (aIsPriority && !bIsPriority) return -1; // a comes first
        if (bIsPriority && !aIsPriority) return 1;  // b comes first
        
        // If both are priority status (or both are not), sort by final_no
        const fa = (a.final_no || '').toString().trim();
        const fb = (b.final_no || '').toString().trim();
        const aBlank = !fa;
        const bBlank = !fb;
        
        if (aBlank && !bBlank) return -1; // blank comes first
        if (bBlank && !aBlank) return 1;  // blank comes first
        if (aBlank && bBlank) return 0;
        
        const na = extractDigits(fa);
        const nb = extractDigits(fb);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na; // descending numeric
        if (!Number.isNaN(na) && Number.isNaN(nb)) return -1; // numeric before non-numeric
        if (Number.isNaN(na) && !Number.isNaN(nb)) return 1;
        
        // fallback: lexicographic descending
        return fb.localeCompare(fa);
      };

      mapped.sort(cmpFinalNo);

      setRecords(mapped);
      setErrorMsg("");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const createRecord = async () => {
    // POST /api/verification
    // Ensure we send the numeric DocRec PK when possible. If `form.doc_rec_id` is not numeric
    // but `form.doc_rec_key` is present, try resolving the DocRec PK from the server.
    const resolveDocRecPk = async (key) => {
      if (!key) return null;
      try {
        const res = await fetch(`/api/docrec/?doc_rec_id=${encodeURIComponent(key)}`, { headers: { ...authHeaders() } });
        if (!res.ok) return null;
        const data = await res.json();
        const rows = Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : []);
        if (rows.length > 0) return rows[0].id || null;
      } catch (e) {
        console.warn('DocRec lookup failed', e);
      }
      return null;
    };

    let docRecPk = null;
    if (form.doc_rec_id && String(form.doc_rec_id).trim() !== "") {
      // if numeric, use numeric; if string contains digits only, parse
      if (!Number.isNaN(Number(form.doc_rec_id)) && String(form.doc_rec_id).trim() !== '') docRecPk = Number(form.doc_rec_id);
    }
    if (!docRecPk && form.doc_rec_key && String(form.doc_rec_key).trim() !== "") {
      docRecPk = await resolveDocRecPk(form.doc_rec_key);
    }

    const body = {
  doc_rec_date: (function(s){ if(!s) return null; if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return s; const x = dmyToISO(s); return x || null; })(form.date),
      // Send the numeric DocRec PK where the API expects a PK value. If unresolved, send null
      doc_rec_id: docRecPk || null,
      enrollment_no: form.enrollment_id || null,
      second_enrollment_id: form.second_enrollment_id || null,
      student_name: form.name, // server can overwrite from Enrollment
      tr_count: +form.tr || 0,
      ms_count: +form.ms || 0,
      dg_count: +form.dg || 0,
      moi_count: +form.moi || 0,
      backlog_count: +form.backlog || 0,
      status: form.status,
      final_no: form.final_no || null,
      mail_status: form.mail_status,
      eca_required: !!form.eca_required,
      eca_name: form.eca_required ? (form.eca_name || null) : null,
      eca_ref_no: form.eca_required ? (form.eca_ref_no || null) : null,
      eca_send_date: form.eca_required ? (function(s){ if(!s) return null; if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return s; const x = dmyToISO(s); return x || null; })(form.eca_send_date) : null,
      eca_status: form.eca_required ? (form.eca_status || null) : null,
      eca_resubmit_date: form.eca_required ? (form.eca_resubmit_date || null) : null,
      eca_remark: form.eca_required ? (form.eca_remark || null) : null,
      doc_rec_remark: form.doc_rec_remark || null,
      remark: form.remark || null,
      pay_rec_no: form.pay_rec_no || null,
    };
    const res = await fetch(`/api/verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    // Debug: log what we sent
    console.debug('createRecord payload', { docRecPk, body });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || "Create failed");
    }
    await loadRecords();
  };

  const updateRecord = async (id) => {
    // When updating, DON'T change the doc_rec relationship - it should stay the same
    // Only include doc_rec_id if explicitly creating a new verification
    const body = {
      doc_rec_date: (function(s){ if(!s) return null; if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return s; const x = dmyToISO(s); return x || null; })(form.date),
      vr_done_date: (function(s){ if(!s) return null; if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return s; const x = dmyToISO(s); return x || null; })(form.vr_done_date),
      // DO NOT send doc_rec_id on update - it would change the linked DocRec!
      // doc_rec_id should remain unchanged when editing
      enrollment_no: form.enrollment_id || null,
      second_enrollment_id: form.second_enrollment_id || null,
      student_name: form.name || null,
      tr_count: +form.tr || null,
      ms_count: +form.ms || null,
      dg_count: +form.dg || null,
      moi_count: +form.moi || null,
      backlog_count: +form.backlog || null,
      status: form.status,
      final_no: form.final_no || null,
      mail_status: form.mail_status,
      remark: form.remark || null,
      eca_required: !!form.eca_required,
      eca_name: form.eca_required ? (form.eca_name || null) : null,
      eca_ref_no: form.eca_required ? (form.eca_ref_no || null) : null,
      eca_send_date: form.eca_required ? (function(s){ if(!s) return null; if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return s; const x = dmyToISO(s); return x || null; })(form.eca_send_date) : null,
      eca_status: form.eca_required ? (form.eca_status || null) : null,
      eca_resubmit_date: form.eca_required ? (form.eca_resubmit_date || null) : null,
      eca_remark: form.eca_required ? (form.eca_remark || null) : null,
      doc_rec_remark: form.doc_rec_remark || null,
      pay_rec_no: form.pay_rec_no || null,
    };
    const res = await fetch(`/api/verification/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    // Debug: log what we sent
    console.debug('updateRecord payload', { id, body });
    if (!res.ok) throw new Error(await res.text());
  };

  const [currentRow, setCurrentRow] = useState(null);

  // Initial load
  useEffect(() => {
    loadRecords();
  }, []);
  // Keep numeric inputs within 0..999
  const clamp3 = (n) => {
    const x = Math.max(0, Math.min(999, Number.isNaN(+n) ? 0 : +n));
    return x;
  };

  const handleChange = (field, val) => {
    if (["tr","ms","dg","moi","backlog"].includes(field)) {
      setForm((f) => ({ ...f, [field]: clamp3(val) }));
    } else if (field === "status" && val === "DONE") {
      // Auto-generate final_no from doc_rec_key when status changes to DONE
      setForm((f) => {
        let generatedNo = f.final_no || '';
        
        // Only auto-generate if final_no is empty and doc_rec_key exists
        if (!generatedNo && f.doc_rec_key) {
          const docRecKey = String(f.doc_rec_key).trim();
          // Match pattern like vr_25_0945 or vr_26_0105
          const match = docRecKey.match(/vr_(\d+)_(\d+)/i);
          if (match) {
            const yearPart = match[1]; // e.g., "25"
            const seqPart = match[2];  // e.g., "0945"
            generatedNo = yearPart + seqPart; // e.g., "250945"
          }
        }
        
        return { ...f, [field]: val, final_no: generatedNo };
      });
    } else {
      setForm((f) => ({ ...f, [field]: val }));
    }
  };

  // Formatters for table display
  const formatEcaStatus = (row) => {
    const s = (row && row.eca && row.eca.eca_status) || row?.eca_status || '';
    // Hide explicit NOT_SENT values; show only real status text
    return s && String(s).toUpperCase() !== 'NOT_SENT' ? s : '';
  };

  // Table columns (ordered as requested)
  const columns = useMemo(() => ([
    { key: "date", label: "Date" },
    { key: "enrollment_no", label: "Enroll No" },
    { key: "second_enrollment_no", label: "Sec Enroll" },
    { key: "student_name", label: "Name" },
    { key: "tr_count", label: "TR" },
    { key: "ms_count", label: "MS" },
    { key: "dg_count", label: "DG" },
    { key: "moi_count", label: "MOI" },
    { key: "backlog_count", label: "Backlog" },
    { key: "status", label: "Status" },
    { key: "vr_done_date", label: "Done Date" },
    { key: "final_no", label: "Final No" },
    { key: "mail_status", label: "Mail" },
  { key: "doc_rec_key", label: "Doc Rec ID" },
    { key: "doc_rec_remark", label: "Doc Rec Remark" },
    { key: "eca_required", label: "ECA Required" },
    { key: "eca_name", label: "ECA Name" },
    { key: "eca_ref_no", label: "ECA Ref No" },
    { key: "eca_send_date", label: "ECA Send Date" },
    { key: "eca_status", label: "ECA Status" },
    { key: "eca_resubmit_date", label: "ECA Resubmit Date" },
  ]), []);

  return (
    <div className="p-4 md:p-6 space-y-4 h-full bg-slate-100">
      {/* Top bar via shared component */}
      <PageTopbar
        title="Verification"
        actions={ACTIONS}
        selected={getSelected()}
        onSelect={handleTopbarSelect}
        onToggleSidebar={onToggleSidebar}
        onToggleChatbox={onToggleChatbox}
        actionsOnLeft
        leftSlot={
          <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-600 text-white text-xl">
            🔎
          </div>
        }
        rightSlot={
          <a href="/" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-white ml-2">
            🏠 Home
          </a>
        }
      />

      {/* Collapsible Action Box */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
        {/* Title / toggle row */}
        <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
          <div className="font-semibold">{getSelected() ? `${getSelected()} Panel` : "Action Panel"}</div>
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
          >
            {panelOpen ? <FaChevronUp /> : <FaChevronDown />} {panelOpen ? "Collapse" : "Expand"}
          </button>
        </div>

        {panelOpen && getSelected() && (
          <div className="p-4">
            {/* Switch content by action */}
            {(getSelected() === "➕" || getSelected() === "✏️ Edit") && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-sm">Date</label>
                  <input type="date" className="w-full border rounded-lg p-2"
                    placeholder="dd-mm-yyyy"
                    value={form.date}
                    onChange={(e) => handleChange("date", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm">Done Date</label>
                  <input type="date" className="w-full border rounded-lg p-2"
                    placeholder="dd-mm-yyyy"
                    value={form.vr_done_date}
                    onChange={(e) => handleChange("vr_done_date", e.target.value)} />
                </div>

                <div>
                  <label className="text-sm">Enrollment ID</label>
                  <input className="w-full border rounded-lg p-2"
                    placeholder="Pick from Enrollment table (autocomplete later)"
                    value={form.enrollment_id}
                    onChange={(e) => handleChange("enrollment_id", e.target.value)} />
                </div>

                <div>
                  <label className="text-sm">Second Enrollment ID</label>
                  <input className="w-full border rounded-lg p-2"
                    value={form.second_enrollment_id}
                    onChange={(e) => handleChange("second_enrollment_id", e.target.value)} />
                </div>

                <div>
                  <label className="text-sm">Name</label>
                  <input className="w-full border rounded-lg p-2"
                    value={form.name}
                    onChange={(e) => handleChange("name", e.target.value)} />
                </div>

                <div>
                  <label className="text-sm">TR</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2"
                    value={form.tr}
                    onChange={(e) => handleChange("tr", e.target.value)} />
                </div>

                <div>
                  <label className="text-sm">MS</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2"
                    value={form.ms}
                    onChange={(e) => handleChange("ms", e.target.value)} />
                </div>

                <div>
                  <label className="text-sm">DG</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2"
                    value={form.dg}
                    onChange={(e) => handleChange("dg", e.target.value)} />
                </div>

                <div>
                  <label className="text-sm">MOI</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2"
                    value={form.moi}
                    onChange={(e) => handleChange("moi", e.target.value)} />
                </div>

                <div>
                  <label className="text-sm">Backlog</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2"
                    value={form.backlog}
                    onChange={(e) => handleChange("backlog", e.target.value)} />
                </div>

                <div>
                  <label className="text-sm">Status</label>
                  <select className="w-full border rounded-lg p-2"
                    value={form.status}
                    onChange={(e) => handleChange("status", e.target.value)}>
                    <option>IN_PROGRESS</option>
                    <option>PENDING</option>
                    <option>CORRECTION</option>
                    <option>CANCEL</option>
                    <option>DONE</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm">File No(only if DONE)</label>
                  <input className="w-full border rounded-lg p-2"
                    placeholder="TR-2025-000123"
                    value={form.final_no}
                    onChange={(e) => handleChange("final_no", e.target.value)} />
                </div>

                <div>
                  <label className="text-sm">Mail</label>
                  <select className="w-full border rounded-lg p-2"
                    value={form.mail_status}
                    onChange={(e) => handleChange("mail_status", e.target.value)}>
                    <option>NOT_SENT</option>
                    <option>SENT</option>
                    <option>FAILED</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm">ECA?</label>
                  <select className="w-full border rounded-lg p-2"
                    value={form.eca_required ? "Yes" : "No"}
                    onChange={(e) => handleChange("eca_required", e.target.value === "Yes")}
                  >
                    <option>No</option>
                    <option>Yes</option>
                  </select>
                </div>

                {form.eca_required && (
                  <>
                    <div>
                      <label className="text-sm">ECA Name</label>
                      <input className="w-full border rounded-lg p-2"
                        value={form.eca_name}
                        onChange={(e) => handleChange("eca_name", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm">Ref-No</label>
                      <input className="w-full border rounded-lg p-2"
                        value={form.eca_ref_no}
                        onChange={(e) => handleChange("eca_ref_no", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm">Send-Date</label>
                      <input type="date" className="w-full border rounded-lg p-2"
                        value={form.eca_send_date}
                        onChange={(e) => handleChange("eca_send_date", e.target.value)} />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm">ECA Remark</label>
                      <input className="w-full border rounded-lg p-2"
                        value={form.eca_remark}
                        onChange={(e) => handleChange("eca_remark", e.target.value)} />
                    </div>
                  </>
                )}

                <div className="md:col-span-2">
                  <label className="text-sm">Remark</label>
                  <input className="w-full border rounded-lg p-2"
                    value={form.remark}
                    onChange={(e) => handleChange("remark", e.target.value)} />
                </div>

                <div>
                  <label className="text-sm">Pay Receipt No</label>
                  <input className="w-full border rounded-lg p-2"
                    placeholder="REC-2025-0001"
                    value={form.pay_rec_no}
                    onChange={(e) => handleChange("pay_rec_no", e.target.value)} />
                </div>

                {/* Doc Rec fields: show/editable Doc Rec ID and display Doc Rec Key */}
                <div>
                  <label className="text-sm">Doc Rec ID</label>
                  <input className="w-full border rounded-lg p-2"
                    placeholder="e.g. vr_25_0932 or numeric id"
                    value={form.doc_rec_id}
                    onChange={(e) => handleChange("doc_rec_id", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm">Doc Rec Key</label>
                  <input className="w-full border rounded-lg p-2" disabled value={form.doc_rec_key || "-"} />
                </div>

                <div className="md:col-span-4 flex justify-end">
                  <button
                    onClick={async () => {
                      try {
                        // Basic client-side validation: backend requires a Doc Rec identifier.
                        // Accept either `doc_rec_id` or the human `doc_rec_key` as a valid value.
                        const hasDocRec = (form.doc_rec_id && String(form.doc_rec_id).trim() !== "") || (form.doc_rec_key && String(form.doc_rec_key).trim() !== "");
                        if (!hasDocRec) {
                          alert("Please provide Doc Rec ID before saving (field 'Doc Rec ID' or Doc Rec Key cannot be empty).");
                          return;
                        }
                        if (getSelected() === "✏️ Edit" && currentRow?.id) {
                          await updateRecord(currentRow.id);
                          alert("Updated!");
                        } else {
                          await createRecord();
                          alert("Created!");
                        }
                        setCurrentRow(null);
                        setSelected(null);
                        setPanelOpen(false);
                        await loadRecords();
                      } catch (e) {
                        alert(e.message || "Create failed");
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white"
                  >
                    {getSelected() === "✏️ Edit" ? "Update" : "Save"}
                  </button>
                </div>
              </div>
            )}

            {getSelected() === "🔍" && (
              <div className="flex gap-2">
                <input
                  className="flex-1 border rounded-lg p-2"
                  placeholder="Search by Enrollment / Final No / Receipt / Name…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <button onClick={loadRecords} className="px-3 py-2 rounded-lg bg-blue-600 text-white">Search</button>
              </div>
            )}

            {getSelected() === "📄 Report" && (
              <div className="text-sm text-gray-600">
                <p>Report filters go here (date range, status, ECA yes/no, counts…).</p>
              </div>
            )}

            {getSelected() === "📊 Excel Upload" && (
              <div className="text-sm text-gray-600">Excel import coming soon…</div>
            )}
          </div>
        )}
      </div>

      {/* Records table (hidden when adding) */}
      {getSelected() !== "➕" && (
        <div className="border rounded-2xl overflow-hidden h-[calc(100vh-260px)] flex flex-col">
          <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
            <div className="font-semibold">Last Verification Records</div>
            <div className="text-sm text-gray-500">
              {loading ? "Loading…" : `${records.length} record(s)`}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 text-sm text-red-600">{errorMsg}</div>
          )}

          <div className="overflow-auto flex-1">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {columns.map(col => (
                    <th key={col.key} className="text-left py-2 px-3 font-medium">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.length === 0 && !loading && (
                  <tr><td colSpan={columns.length} className="py-6 text-center text-gray-500">No records</td></tr>
                )}

                {records.map((r, idx) => (
                  <tr key={r.id || idx} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => {
                    setCurrentRow(r);
                    setForm({
                      // ensure date inputs use ISO (yyyy-mm-dd) for <input type="date">
                      date: (dmyToISO(r.date) || r.date) || "",
                      vr_done_date: (dmyToISO(r.vr_done_date) || r.vr_done_date) || "",
                      enrollment_id: r.enrollment?.id || r.enrollment_id || r.enrollment_no || "",
                      second_enrollment_id: r.second_enrollment?.id || r.second_enrollment_id || r.second_enrollment_no || "",
                      name: r.student_name || "",
                      tr: r.tr_count || 0,
                      ms: r.ms_count || 0,
                      dg: r.dg_count || 0,
                      moi: r.moi_count || 0,
                      backlog: r.backlog_count || 0,
                      status: r.status || "IN_PROGRESS",
                      final_no: r.final_no || "",
                      mail_status: r.mail_status || "NOT_SENT",
                      eca_required: (r.eca_required === true) || (r.eca && r.eca.eca_required === true) || !!r.eca_name,
                      eca_name: r.eca?.eca_name || r.eca_name || "",
                      eca_ref_no: r.eca?.eca_ref_no || r.eca_ref_no || "",
                      eca_send_date: isoToDMY(r.eca?.eca_send_date || r.eca_send_date || r.eca_submit_date) || "",
                      eca_status: r.eca?.eca_status || r.eca_status || "",
                      eca_resubmit_date: r.eca?.eca_resubmit_date || r.eca_resubmit_date || "",
                      eca_remark: r.eca?.eca_remark || r.eca_remark || "",
                      remark: r.remark || "",
                      pay_rec_no: r.pay_rec_no || "",
                      // Prefer explicit doc_rec_id, then numeric id, then the human DocRec key
                      doc_rec_id: r.doc_rec_id || r.doc_rec?.id || r.doc_rec_key || (r.doc_rec && (r.doc_rec.doc_rec_id || r.doc_rec.id)) || "",
                      doc_rec_key: r.doc_rec_key || r.doc_rec?.doc_rec_id || "",
                    });
                    setSelected("✏️ Edit");
                    setPanelOpen(true);
                  }}>
                    <td className="py-2 px-3">{r.date || "-"}</td>
                    <td className="py-2 px-3">{r.enrollment_no || r.enrollment?.enrollment_no || "-"}</td>
                    <td className="py-2 px-3">{r.second_enrollment_no || r.second_enrollment?.enrollment_no || "-"}</td>
                    <td className="py-2 px-3">{r.student_name || "-"}</td>
                    <td className="py-2 px-3">{r.tr_count ?? "-"}</td>
                    <td className="py-2 px-3">{r.ms_count ?? "-"}</td>
                    <td className="py-2 px-3">{r.dg_count ?? "-"}</td>
                    <td className="py-2 px-3">{r.moi_count ?? "-"}</td>
                    <td className="py-2 px-3">{r.backlog_count ?? "-"}</td>
                    <td className="py-2 px-3"><Badge text={r.status} /></td>
                    <td className="py-2 px-3">{r.vr_done_date || "-"}</td>
                    <td className="py-2 px-3">{r.final_no || "-"}</td>
                    <td className="py-2 px-3"><MailBadge text={r.mail_status} /></td>
                    <td className="py-2 px-3">{r.doc_rec_key || r.doc_rec_id || (r.doc_rec && r.doc_rec.doc_rec_id) || '-'}</td>
                    <td className="py-2 px-3">{r.doc_rec_remark || r.remark || r.doc_rec?.doc_rec_remark || "-"}</td>
                    <td className="py-2 px-3">{(r.eca_required === true || (r.eca && r.eca.eca_required === true)) ? 'Y' : ''}</td>
                    <td className="py-2 px-3">{r.eca?.eca_name || r.eca_name || "-"}</td>
                    <td className="py-2 px-3">{r.eca?.eca_ref_no || r.eca_ref_no || "-"}</td>
                    <td className="py-2 px-3">{r.eca?.eca_send_date || r.eca_submit_date || "-"}</td>
                    <td className="py-2 px-3">{formatEcaStatus(r) || ""}</td>
                    <td className="py-2 px-3">{r.eca?.eca_resubmit_date || r.eca_resubmit_date || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer (optional paging) */}
          <div className="p-3 bg-gray-50 flex items-center justify-between">
            <div className="text-xs text-gray-500">Tip: Use SEARCH to filter quickly.</div>
            <div className="text-xs text-gray-500">Showing latest records first.</div>
          </div>
        </div>
      )}
    </div>
  );
}
