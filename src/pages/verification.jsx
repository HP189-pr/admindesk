import React, { useEffect, useMemo, useState } from "react";
import { isoToDMY, dmyToISO } from "../utils/date";
import { syncDocRecRemark, loadRecords as loadRecordsService, createRecord as createRecordService, updateRecord as updateRecordService } from "../services/verificationservice";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
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
    doc_rec_remark: "",
    pay_rec_no: "",
    doc_rec_id: "",
    doc_rec_key: "",
  });

  // Records list (latest first)
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [q, setQ] = useState(""); // search query
  const [statusFilter, setStatusFilter] = useState("");
  const [mailFilter, setMailFilter] = useState("");
  const [ecaStatusFilter, setEcaStatusFilter] = useState("");

  // Use service for doc_rec_remark sync
  // Use service for loading records
  const loadRecords = async () => {
    setLoading(true);
    await loadRecordsService(q, setLoading, setErrorMsg, setRecords);
  };

  // Use service for creating a record
  const createRecord = async () => {
    await createRecordService(form, syncDocRecRemark, loadRecords);
  };

  // Use service for updating a record
  const updateRecord = async (id) => {
    await updateRecordService(id, form, syncDocRecRemark);
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
    return records.filter(r => {
      const statusMatch = !statusFilter || r.status === statusFilter;
      const mailMatch = !mailFilter || (r.mail_status === mailFilter || r.mail_send_status === mailFilter);
      const ecaStatus = r.eca_required ? (r.eca_status || (r.eca && r.eca.eca_status) || "NOT_SENT") : "";
      const ecaMatch = !ecaStatusFilter || ecaStatus === ecaStatusFilter;
      return statusMatch && mailMatch && ecaMatch;
    });
  }, [records, statusFilter, mailFilter, ecaStatusFilter]);

  // Limit filteredRecords to 25 if any filter is active
  const limitedRecords = useMemo(() => {
    if (statusFilter || mailFilter || ecaStatusFilter) {
      return filteredRecords.slice(0, 25);
    }
    return filteredRecords;
  }, [filteredRecords, statusFilter, mailFilter, ecaStatusFilter]);

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
                    <div>
                      <label className="text-sm">ECA Status</label>
                      <input className="w-full border rounded-lg p-2 bg-gray-100" value={form.eca_send_date ? "SENT" : "NOT_SENT"} disabled />
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
                  <label className="text-sm">Doc Rec Remark</label>
                  <input className="w-full border rounded-lg p-2"
                    value={form.doc_rec_remark}
                    onChange={(e) => handleChange("doc_rec_remark", e.target.value)} />
                </div>

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
                          // Clear the eca_send_date field after successful update
                          setForm(prev => ({ ...prev, eca_send_date: "" }));
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
          </div>

          {errorMsg && (
            <div className="p-3 text-sm text-red-600">{errorMsg}</div>
          )}

          <div className="overflow-auto flex-1 min-h-0">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 border-b">
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

                {limitedRecords.map((r, idx) => (
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
                      doc_rec_remark: r.doc_rec_remark || r.remark || r.doc_rec?.doc_rec_remark || "",
                      remark: r.remark || "",
                      pay_rec_no: r.pay_rec_no || "",
                      // Prefer explicit doc_rec_id, then numeric id, then the human DocRec key
                      doc_rec_id: r.doc_rec_id || r.doc_rec?.id || r.doc_rec_key || (r.doc_rec && (r.doc_rec.doc_rec_id || r.doc_rec.id)) || "",
                      doc_rec_key: r.doc_rec_key || r.doc_rec?.doc_rec_id || "",
                    });
                    setSelected("✏️ Edit");
                    setPanelOpen(true);
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
                    <td className="py-2 px-3"><MailBadge text={r.mail_status} /></td>
                    <td className="py-2 px-3">{r.doc_rec_key || r.doc_rec_id || (r.doc_rec && r.doc_rec.doc_rec_id) || '-'}</td>
                    <td className="py-2 px-3">{r.doc_rec_remark || r.remark || r.doc_rec?.doc_rec_remark || "-"}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
