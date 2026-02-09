import React, { useEffect, useMemo, useRef, useState } from "react";
import { isoToDMY, dmyToISO } from "../utils/date";
import { syncDocRecRemark, loadRecords as loadRecordsService, createRecord as createRecordService, updateRecord as updateRecordService } from "../services/verificationservice";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import { useNavigate } from 'react-router-dom';
import PageTopbar from "../components/PageTopbar";

// Topbar actions available on this page
const ACTIONS = ["➕", "✏️ Edit", "🔍", "📄 Report"];

// Simple badge pills for status/mail columns
const Badge = ({ text }) => (
  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
    {text || "-"}
  </span>
);

const MailBadge = ({ text }) => (
  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
    {text || "-"}
  </span>
);

// Utility to fetch enrollment details by enrollment_no or id
async function resolveEnrollment(en_no) {
  if (!en_no) return null;
  const typed = String(en_no).trim().toLowerCase();
  try {
    const token = localStorage.getItem('access_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    let res = await fetch(`/api/enrollments/?search=${encodeURIComponent(typed)}&limit=20`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const items = data && data.results ? data.results : (Array.isArray(data) ? data : (data && data.items ? data.items : []));
    // Exact match
    return items.find(e => String(e.enrollment_no || e.enrollment || '').trim().toLowerCase() === typed) || null;
  } catch (e) {
    console.warn('resolveEnrollment error', e);
    return null;
  }
}
export default function Verification({ selectedTopbarMenu, setSelectedTopbarMenu, onToggleSidebar, onToggleChatbox }) {
  // Wrapper for service: always passes correct state setters
  const loadRecords = async () => {
    await loadRecordsService(q, setLoading, setErrorMsg, setRecords);
  };

  // Search/filter state variables
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [mailFilter, setMailFilter] = useState("");
  const [ecaStatusFilter, setEcaStatusFilter] = useState("");
  const [searchDate, setSearchDate] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState({
    date: "",
    vr_done_date: "",
    enrollment_id: "",
    second_enrollment_id: "",
    name: "",
    tr: 0,
    ms: 0,
    dg: 0,
    moi: 0,
    backlog: 0,
    status: "IN_PROGRESS",
    final_no: "",
    mail_status: "NOT_SENT",
    eca_required: false,
    eca_name: "",
    eca_ref_no: "",
    eca_send_date: "",
    eca_status: "",
    eca_resubmit_date: "",
    doc_remark: "",
    pay_rec_no: "",
    doc_rec_id: "",
    doc_rec_key: "",
    eca_remark: ""
  });
  const navigate = useNavigate();
  const formRef = useRef(null);
  const [flashMsg, setFlashMsg] = useState("");
  // Topbar actions and collapsible panel
  const [panelOpen, setPanelOpen] = useState(false);
  const [localSelected, setLocalSelected] = useState(null);
  const getSelected = () => (typeof selectedTopbarMenu !== 'undefined' ? selectedTopbarMenu : localSelected);
  const setSelected = (val) => {
    if (typeof setSelectedTopbarMenu === 'function') {
      setSelectedTopbarMenu(val);
    } else {
      setLocalSelected(val);
    }
  };
  const createRecord = async () => {
    await createRecordService(form, syncDocRecRemark, loadRecords);
  };

  // Use service for updating a record
  const updateRecord = async (id) => {
    await updateRecordService(id, form, syncDocRecRemark);
  };

  const [currentRow, setCurrentRow] = useState(null);

  // Topbar action handler
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
    // If new record, reset form
    if (action === "➕") {
      setForm({
        date: "",
        vr_done_date: "",
        enrollment_id: "",
        second_enrollment_id: "",
        name: "",
        tr: 0,
        ms: 0,
        dg: 0,
        moi: 0,
        backlog: 0,
        status: "IN_PROGRESS",
        final_no: "",
        mail_status: "NOT_SENT",
        eca_required: false,
        eca_name: "",
        eca_ref_no: "",
        eca_send_date: "",
        eca_status: "",
        eca_resubmit_date: "",
        doc_remark: "",
        pay_rec_no: "",
        doc_rec_id: "",
        doc_rec_key: "",
        eca_remark: ""
      });
    }
  };

  // Initial load
  useEffect(() => {
    loadRecords();
  }, []);

  // Live search debounce
  useEffect(() => {
    const t = setTimeout(() => {
      loadRecords();
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  // Keep numeric inputs within 0..999
  const clamp3 = (n) => {
    const x = Math.max(0, Math.min(999, Number.isNaN(+n) ? 0 : +n));
    return x;
  };

  const handleChange = (field, val) => {
    if (field === "enrollment_id") {
      setForm((f) => ({ ...f, [field]: val }));
      setQ((val || "").toString());
    } else if (["tr","ms","dg","moi","backlog"].includes(field)) {
      setForm((f) => ({ ...f, [field]: clamp3(val) }));
    } else if (field === "status" && val === "DONE") {
      setForm((f) => {
        let generatedNo = f.final_no || '';
        if (!generatedNo && f.doc_rec_key) {
          const docRecKey = String(f.doc_rec_key).trim();
          const match = docRecKey.match(/vr_(\d+)_(\d+)/i);
          if (match) {
            const yearPart = match[1];
            const seqPart = match[2];
            generatedNo = yearPart + seqPart;
          }
        }
        return { ...f, [field]: val, final_no: generatedNo };
      });
    } else if (field === "eca_required") {
      setForm((f) => {
        const required = Boolean(val);
        return {
          ...f,
          eca_required: required,
          eca_status: required
            ? (f.eca_status && f.eca_status !== "" ? f.eca_status : "NOT_SENT")
            : "",
          eca_name: required ? f.eca_name : "",
          eca_ref_no: required ? f.eca_ref_no : "",
          eca_send_date: required ? f.eca_send_date : "",
          eca_resubmit_date: required ? f.eca_resubmit_date : "",
          eca_remark: required ? f.eca_remark : "",
        };
      });
    } else if (field === "eca_send_date") {
      setForm((f) => {
        // If ECA is required, auto-set status based on send date
        if (f.eca_required) {
          return {
            ...f,
            eca_send_date: val,
            eca_status: val ? "SENT" : "NOT_SENT",
          };
        } else {
          return { ...f, eca_send_date: val };
        }
      });
    } else {
      setForm((f) => ({ ...f, [field]: val }));
    }
  };

  // Formatters for table display
  const formatEcaStatus = (row) => {
    const s = (row && row.eca && row.eca.eca_status) || row?.eca_status || '';
    // Always show the stored status (including NOT_SENT)
    return s || '';
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

  const filteredRecords = useMemo(() => {
    const normQ = (q || "").trim().toLowerCase();
    return records.filter(r => {
      const statusMatch = !statusFilter || r.status === statusFilter;
      const mailMatch = !mailFilter || (r.mail_status === mailFilter || r.mail_send_status === mailFilter);
      const ecaStatus = r.eca_required ? (r.eca_status || (r.eca && r.eca.eca_status) || "NOT_SENT") : "";
      const ecaMatch = !ecaStatusFilter || ecaStatus === ecaStatusFilter;
      const dateMatch = !searchDate || (() => {
        const iso = dmyToISO(r.date) || r.date || "";
        return iso.startsWith(searchDate);
      })();
      const searchMatch = !normQ || (() => {
        const candidates = [
          r.enrollment_no,
          r.enrollment?.enrollment_no,
          r.second_enrollment_no,
          r.second_enrollment?.enrollment_no,
          r.temp_enroll_no,
          r.temp_enrollment_no,
          r.student_name,
          r.final_no,
          r.doc_rec_key,
          r.doc_rec_id,
          r.doc_rec?.doc_rec_id,
          r.date,
        ];
        return candidates.some((v) => (v || "").toString().toLowerCase().includes(normQ));
      })();
      return statusMatch && mailMatch && ecaMatch && dateMatch && searchMatch;
    });
  }, [records, statusFilter, mailFilter, ecaStatusFilter, q, searchDate]);

  // Sort: status priority (IN_PROGRESS > CORRECTION > PENDING > others), then ECA NOT_SENT first, then Doc Rec (desc)
  const sortedRecords = useMemo(() => {
    const statusOrder = {
      IN_PROGRESS: 0,
      CORRECTION: 1,
      PENDING: 2,
      DONE: 3,
      DONE_WITH_REMARKS: 4,
      CANCEL: 5,
      undefined: 6,
      null: 6,
    };
    const getEcaNotSent = (r) => {
      const ecaStatus = r.eca_status || (r.eca && r.eca.eca_status) || "";
      return ecaStatus === "NOT_SENT" ? 0 : 1;
    };
    const docRecValue = (r) => {
      const raw = r.doc_rec_key || r.doc_rec_id || (r.doc_rec && (r.doc_rec.doc_rec_id || r.doc_rec.id)) || "";
      const digits = String(raw).match(/\d+/g);
      if (!digits || !digits.length) return 0;
      // Use last numeric group as descending sequence
      return parseInt(digits[digits.length - 1], 10) || 0;
    };

    return [...filteredRecords].sort((a, b) => {
      const statusA = statusOrder[a.status] ?? 6;
      const statusB = statusOrder[b.status] ?? 6;
      if (statusA !== statusB) return statusA - statusB;

      const ecaA = getEcaNotSent(a);
      const ecaB = getEcaNotSent(b);
      if (ecaA !== ecaB) return ecaA - ecaB;

      const docA = docRecValue(a);
      const docB = docRecValue(b);
      return docB - docA; // latest (bigger number) on top
    });
  }, [filteredRecords]);

  // Limit filteredRecords to 25 if any filter is active
  const limitedRecords = useMemo(() => {
    if (statusFilter || mailFilter || ecaStatusFilter) {
      return sortedRecords.slice(0, 25);
    }
    return sortedRecords;
  }, [sortedRecords, statusFilter, mailFilter, ecaStatusFilter]);

  return (
    <div className="p-4 md:p-6 space-y-4 h-full bg-slate-100 flex flex-col" style={{ minHeight: '100vh' }}>
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

        {panelOpen && (
          <>
            {/* Edit / Add form */}
            <div ref={formRef} className="p-3 space-y-2">
              {/* Row 1 */}
              <div className="grid gap-3 md:grid-cols-[16ch_0.6fr_0.6fr_1.6fr] items-end">
                {/* ...existing code... */}
                <div>
                  <label className="block text-sm mb-1">Date</label>
                  <input
                    type="date"
                    className="w-full border rounded-lg p-2"
                    value={form.date}
                    onChange={(e) => handleChange("date", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Enrollment ID</label>
                  <input
                    className="w-full border rounded-lg p-2"
                    placeholder="Pick from Enrollment table"
                    value={form.enrollment_id}
                    onChange={(e) => handleChange("enrollment_id", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Second Enrollment ID</label>
                  <input
                    className="w-full border rounded-lg p-2"
                    value={form.second_enrollment_id}
                    onChange={(e) => handleChange("second_enrollment_id", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Name</label>
                  <input
                    className="w-full border rounded-lg p-2"
                    value={form.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                  />
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid gap-2 md:grid-cols-[repeat(5,7ch)_0.4fr_15ch_0.4fr_0.45fr_0.45fr] items-end">
                {/* ...existing code... */}
                {[
                  { label: "TR", key: "tr" },
                  { label: "MS", key: "ms" },
                  { label: "DG", key: "dg" },
                  { label: "MOI", key: "moi" },
                  { label: "Backlog", key: "backlog" },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-sm mb-1">{label}</label>
                    <input
                      className="w-full border rounded-lg p-2 text-center"
                      value={form[key]}
                      onChange={(e) => handleChange(key, e.target.value)}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-sm mb-1">Status</label>
                  <select
                    className="w-full border rounded-lg p-2"
                    value={form.status}
                    onChange={(e) => handleChange("status", e.target.value)}
                  >
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="PENDING">PENDING</option>
                    <option value="CORRECTION">CORRECTION</option>
                    <option value="CANCEL">CANCEL</option>
                    <option value="DONE">DONE</option>
                    <option value="DONE_WITH_REMARKS">DONE_WITH_REMARKS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Done Date</label>
                  <input
                    type="date"
                    className="w-full border rounded-lg p-2"
                    value={form.vr_done_date}
                    onChange={(e) => handleChange("vr_done_date", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Final No (File No)</label>
                  <input
                    className="w-full border rounded-lg p-2"
                    value={form.final_no}
                    onChange={(e) => handleChange("final_no", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Mail</label>
                  <select
                    className="w-full border rounded-lg p-2"
                    value={form.mail_status}
                    onChange={(e) => handleChange("mail_status", e.target.value)}
                  >
                    <option value="NOT_SENT">NOT_SENT</option>
                    <option value="SENT">SENT</option>
                    <option value="FAILED">FAILED</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Doc Rec ID</label>
                  <input className="w-full border rounded-lg p-2" value={form.doc_rec_id} onChange={(e) => handleChange("doc_rec_id", e.target.value)} />
                </div>
              </div>

              {/* Row 3: ECA and conditional doc_remark/button */}
              {/* Row 3 : ECA row (always exists) */}
              <div className="grid gap-3 md:grid-cols-6 items-end">
                <div>
                  <label className="block text-sm mb-1">ECA?</label>
                  <select
                    className="w-full border rounded-lg p-2"
                    value={form.eca_required ? "yes" : "no"}
                    onChange={(e) => handleChange("eca_required", e.target.value === "yes")}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
                {form.eca_required && (
                  <>
                    <div>
                      <label className="block text-sm mb-1">ECA Name</label>
                      <select
                        className="w-full border rounded-lg p-2"
                        value={form.eca_name}
                        onChange={(e) => handleChange("eca_name", e.target.value)}
                      >
                        <option value="">Select</option>
                        <option value="WES">WES</option>
                        <option value="IQAS">IQAS</option>
                        <option value="ICES">ICES</option>
                        <option value="CES">CES</option>
                        <option value="ICAS">ICAS</option>
                        <option value="ECE">ECE</option>
                        <option value="CAPR">CAPR</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm mb-1">ECA Ref No</label>
                      <input
                        className="w-full border rounded-lg p-2"
                        value={form.eca_ref_no}
                        onChange={(e) => handleChange("eca_ref_no", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">ECA Send Date</label>
                      <input
                        type="date"
                        className="w-full border rounded-lg p-2"
                        value={form.eca_send_date}
                        onChange={(e) => handleChange("eca_send_date", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">ECA Status</label>
                      <select
                        className="w-full border rounded-lg p-2"
                        value={form.eca_status}
                        onChange={(e) => handleChange("eca_status", e.target.value)}
                      >
                        <option value="">Select</option>
                        <option value="NOT_SENT">NOT_SENT</option>
                        <option value="SENT">SENT</option>
                        <option value="ACCEPTED">ACCEPTED</option>
                        <option value="REJECTED">REJECTED</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm mb-1">ECA Resubmit Date</label>
                      <input
                        type="date"
                        className="w-full border rounded-lg p-2"
                        value={form.eca_resubmit_date}
                        onChange={(e) => handleChange("eca_resubmit_date", e.target.value)}
                      />
                    </div>
                  </>
                )}
                {/* ECA = NO → Doc Remark + Button stay in Row 3 */}
                {!form.eca_required && (
                  <>
                    <div className="md:col-span-3">
                      <label className="block text-sm mb-1">Doc Remark</label>
                      <input
                        className="w-full border rounded-lg p-2"
                        value={form.doc_remark}
                        onChange={(e) => handleChange("doc_remark", e.target.value)}
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={async () => {
                          try {
                            if (getSelected() === "✏️ Edit") {
                              await updateRecord(currentRow?.id);
                            } else {
                              await createRecord();
                            }
                            setFlashMsg("Saved successfully!");
                            setTimeout(() => setFlashMsg(""), 2000);
                          } catch (e) {
                            setFlashMsg(e.message || "Failed");
                            setTimeout(() => setFlashMsg(""), 2500);
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white"
                      >
                        {getSelected() === "✏️ Edit" ? "Update" : "Save"}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Row 4 : Doc Remark + Button (only when ECA = YES) */}
              {form.eca_required && (
                <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
                  <div>
                    <label className="block text-sm mb-1">Doc Remark</label>
                    <input
                      className="w-full border rounded-lg p-2"
                      value={form.doc_remark}
                      onChange={(e) => handleChange("doc_remark", e.target.value)}
                    />
                  </div>

                  <button
                    onClick={async () => {
                      try {
                        if (getSelected() === "✏️ Edit") {
                          await updateRecord(currentRow?.id);
                        } else {
                          await createRecord();
                        }
                        setFlashMsg("Saved successfully!");
                        setTimeout(() => setFlashMsg(""), 2000);
                      } catch (e) {
                        setFlashMsg(e.message || "Failed");
                        setTimeout(() => setFlashMsg(""), 2500);
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white"
                  >
                    {getSelected() === "✏️ Edit" ? "Update" : "Save"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Flash message popup */}
        {flashMsg && (
          <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded shadow-lg animate-fade-in-out">
            {flashMsg}
          </div>
        )}
      </div>

      {/* Records table (hidden when adding) */}
      {getSelected() !== "➕" && (
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
            <div className="font-semibold">Last Verification Records</div>
            <div className="text-sm text-gray-500">
              {loading ? "Loading…" : `${records.length} record(s)`}
            </div>
          </div>
          {/* Filter Row */}
          <div className="flex gap-4 p-3 bg-gray-50 border-b items-center">
            <div>
              <label className="text-xs font-semibold mr-1">Status:</label>
              <select className="border rounded p-1 text-black" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="PENDING">PENDING</option>
                <option value="CORRECTION">CORRECTION</option>
                <option value="CANCEL">CANCEL</option>
                <option value="DONE">DONE</option>
                <option value="DONE_WITH_REMARKS">DONE_WITH_REMARKS</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold mr-1">Mail:</label>
              <select className="border rounded p-1 text-black" value={mailFilter} onChange={e => setMailFilter(e.target.value)}>
                <option value="">All</option>
                <option value="SENT">SENT</option>
                <option value="NOT_SENT">NOT_SENT</option>
                <option value="FAILED">FAILED</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold mr-1">ECA Status:</label>
              <select className="border rounded p-1 text-black" value={ecaStatusFilter} onChange={e => setEcaStatusFilter(e.target.value)}>
                <option value="">All</option>
                <option value="SENT">SENT</option>
                <option value="NOT_SENT">NOT_SENT</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold mr-1">Date:</label>
              <input
                type="date"
                className="border rounded p-1 text-sm"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
              />
            </div>
            {!(getSelected() === "✏️ Edit" || getSelected() === "➕") && (
              <div className="ml-auto flex items-center gap-2">
                <label className="text-xs font-semibold">Search:</label>
                <input
                  className="border rounded p-1 text-sm w-56"
                  placeholder="Enroll / Temp / Name / Final / DocRec / Date"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            )}
          </div>
          {errorMsg && (
            <div className="p-3 text-sm text-red-600">{errorMsg}</div>
          )}
          <div className="overflow-auto flex-1 min-h-0">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 border-b sticky top-0 z-10">
                <tr>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      className={
                        col.key === "date" || col.key === "vr_done_date"
                          ? "text-left py-2 px-3 font-medium whitespace-nowrap text-xs w-28"
                          : "text-left py-2 px-3 font-medium"
                      }
                      style={
                        col.key === "date" || col.key === "vr_done_date"
                          ? { minWidth: 90, maxWidth: 120 }
                          : undefined
                      }
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {limitedRecords.length === 0 && !loading && (
                  <tr><td colSpan={columns.length} className="py-6 text-center text-gray-500">No records</td></tr>
                )}
                {limitedRecords.map((r, idx) => {
                  // Highlight mail column only if status is DONE and mail is NOT_SENT
                  const highlightMail = r.status === "DONE" && r.mail_status === "NOT_SENT";
                  return (
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
                        doc_remark: r.doc_remark || r.doc_rec?.doc_remark || "",
                        pay_rec_no: r.pay_rec_no || "",
                        // Prefer explicit doc_rec_id, then numeric id, then the human DocRec key
                        doc_rec_id: r.doc_rec_id || r.doc_rec?.id || r.doc_rec_key || (r.doc_rec && (r.doc_rec.doc_rec_id || r.doc_rec.id)) || "",
                        doc_rec_key: r.doc_rec_key || r.doc_rec?.doc_rec_id || "",
                      });
                      setSelected("✏️ Edit");
                      setPanelOpen(true);
                      if (formRef.current) {
                        formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }}>
                      <td className="py-2 px-3 whitespace-nowrap text-xs w-28" style={{ minWidth: 90, maxWidth: 120 }}>{r.date || "-"}</td>
                      <td className="py-2 px-3">{r.enrollment_no || r.enrollment?.enrollment_no || "-"}</td>
                      <td className="py-2 px-3">{r.second_enrollment_no || r.second_enrollment?.enrollment_no || "-"}</td>
                      <td className="py-2 px-3">{r.student_name || "-"}</td>
                      <td className="py-2 px-3">{r.tr_count ?? "-"}</td>
                      <td className="py-2 px-3">{r.ms_count ?? "-"}</td>
                      <td className="py-2 px-3">{r.dg_count ?? "-"}</td>
                      <td className="py-2 px-3">{r.moi_count ?? "-"}</td>
                      <td className="py-2 px-3">{r.backlog_count ?? "-"}</td>
                      <td
                        className="py-2 px-3"
                        style={{ backgroundColor: r.status === "IN_PROGRESS" ? "#FFEBEE" : undefined }}
                      >
                        <Badge text={r.status} />
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-xs w-28" style={{ minWidth: 90, maxWidth: 120 }}>{r.vr_done_date || "-"}</td>
                      <td className="py-2 px-3">{r.final_no || "-"}</td>
                      <td className={highlightMail ? "py-2 px-3 bg-orange-50" : "py-2 px-3"}><MailBadge text={r.mail_status} /></td>
                      <td className="py-2 px-3">{r.doc_rec_key || r.doc_rec_id || (r.doc_rec && r.doc_rec.doc_rec_id) || '-'}</td>
                      <td className="py-2 px-3">{r.doc_remark || r.doc_rec?.doc_remark || "-"}</td>
                      <td className="py-2 px-3">{(r.eca_required === true || (r.eca && r.eca.eca_required === true)) ? 'Y' : ''}</td>
                      <td className="py-2 px-3">{r.eca?.eca_name || r.eca_name || "-"}</td>
                      <td className="py-2 px-3">{r.eca?.eca_ref_no || r.eca_ref_no || "-"}</td>
                      <td className="py-2 px-3">{isoToDMY(r.eca_send_date || r.eca?.eca_send_date || r.eca_submit_date) || "-"}</td>
                      <td
                        className={`py-2 px-3 font-semibold ${
                          r.eca_required && formatEcaStatus(r) === "NOT_SENT"
                            ? "text-red-600"
                            : r.eca_required && formatEcaStatus(r) === "SENT"
                            ? "text-emerald-600"
                            : ""
                        }`}
                        style={{ backgroundColor: r.eca_required && formatEcaStatus(r) === "NOT_SENT" ? "#FFF9C4" : undefined }}
                      >
                        {r.eca_required ? formatEcaStatus(r) : ""}
                      </td>
                      <td className="py-2 px-3">{r.eca?.eca_resubmit_date || r.eca_resubmit_date || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}                       