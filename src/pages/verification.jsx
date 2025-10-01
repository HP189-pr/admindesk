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
    eca_submit_date: "",
    eca_remark: "",
    remark: "",
    pay_rec_no: "",
    doc_rec_id: "",
    doc_rec_key: "",
  });

  // Records list (latest first)
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
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
      // Example: GET /api/verification?limit=50&q=...
      const url = q ? `/api/verification?q=${encodeURIComponent(q)}&limit=50` : `/api/verification?limit=50`;
      const res = await fetch(url, { headers: { ...authHeaders() } });
      const data = await res.json();
      // Expect data as array with fields used below
      setRecords(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const createRecord = async () => {
    // POST /api/verification
    const body = {
  date: dmyToISO(form.date) || null,
      enrollment_id: form.enrollment_id,
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
      eca_name: form.eca_name || null,
      eca_ref_no: form.eca_ref_no || null,
      eca_submit_date: form.eca_submit_date || null,
      remark: form.remark || null,
      pay_rec_no: form.pay_rec_no || null,
    };
    const res = await fetch(`/api/verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || "Create failed");
    }
    await loadRecords();
  };

  const updateRecord = async (id) => {
    const body = {
  date: dmyToISO(form.date) || null,
  vr_done_date: dmyToISO(form.vr_done_date) || null,
      student_name: form.name || null,
      tr_count: +form.tr || 0,
      ms_count: +form.ms || 0,
      dg_count: +form.dg || 0,
      moi_count: +form.moi || 0,
      backlog_count: +form.backlog || 0,
      status: form.status,
      final_no: form.final_no || null,
      mail_status: form.mail_status,
      remark: form.remark || null,
      pay_rec_no: form.pay_rec_no || null,
    };
    const res = await fetch(`/api/verification/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
  };

  const upsertEca = async (doc_rec_key) => {
    if (!form.eca_required) return;
    const payload = {
      doc_rec_key,
      eca_name: form.eca_name || null,
      eca_ref_no: form.eca_ref_no || null,
      eca_send_date: form.eca_submit_date || null,
      eca_remark: form.eca_remark || null,
    };
    // Try to find existing ECA by fetching ver row's eca; fallback to POST
    const exists = currentRow?.eca?.id;
    if (exists) {
      const res = await fetch(`/api/eca/${exists}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
    } else {
      const res = await fetch(`/api/eca/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
    }
  };

  const [currentRow, setCurrentRow] = useState(null);

  // Initial load
  useEffect(() => {
    loadRecords();
  }, []);

  // ——— helpers ———

  // Keep numeric inputs within 0..999
  const clamp3 = (n) => {
    const x = Math.max(0, Math.min(999, Number.isNaN(+n) ? 0 : +n));
    return x;
  };

  const handleChange = (field, val) => {
    if (["tr","ms","dg","moi","backlog"].includes(field)) {
      setForm((f) => ({ ...f, [field]: clamp3(val) }));
    } else {
      setForm((f) => ({ ...f, [field]: val }));
    }
  };

  // Table columns (include doc_rec_id and ECA columns)
  const columns = useMemo(() => ([
    { key: "date", label: "Date" },
    { key: "vr_done_date", label: "Done Date" },
    { key: "enrollment_no", label: "Enroll No" },
    { key: "second_enrollment_no", label: "Sec Enroll" },
    { key: "student_name", label: "Name" },
    { key: "tr_count", label: "TR" },
    { key: "ms_count", label: "MS" },
    { key: "dg_count", label: "DG" },
    { key: "moi_count", label: "MOI" },
    { key: "backlog_count", label: "Backlog" },
    { key: "status", label: "Status" },
    { key: "final_no", label: "Final No" },
    { key: "mail_status", label: "Mail" },
    { key: "eca_name", label: "ECA Name" },
    { key: "eca_ref_no", label: "ECA Ref No" },
    { key: "eca_submit_date", label: "ECA Send Date" },
    { key: "doc_rec_key", label: "Doc Rec" },
    { key: "remark", label: "Remark" },
    { key: "last_resubmit_date", label: "Resubmit Date" },
    { key: "last_resubmit_status", label: "Resubmit Status" },
    { key: "row_no", label: "#" },
  ]), []);

  return (
    <div className="p-4 md:p-6 space-y-4 h-full">
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
      <div className="border rounded-2xl overflow-hidden shadow-sm">
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
                        value={form.eca_submit_date}
                        onChange={(e) => handleChange("eca_submit_date", e.target.value)} />
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

                {getSelected() === "✏️ Edit" && (
                  <>
                    <div>
                      <label className="text-sm">Doc Rec</label>
                      <input className="w-full border rounded-lg p-2" disabled value={form.doc_rec_key || "-"} />
                    </div>
                  </>
                )}

                <div className="md:col-span-4 flex justify-end">
                  <button
                    onClick={async () => {
                      try {
                        if (getSelected() === "✏️ Edit" && currentRow?.id) {
                          await updateRecord(currentRow.id);
                          if (form.eca_required && form.doc_rec_key) {
                            await upsertEca(form.doc_rec_key);
                          }
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
                      date: r.date || "",
                      vr_done_date: r.vr_done_date || "",
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
                      eca_required: !!r.eca,
                      eca_name: r.eca?.eca_name || "",
                      eca_ref_no: r.eca?.eca_ref_no || "",
                      eca_submit_date: isoToDMY(r.eca?.eca_send_date) || "",
                      eca_remark: r.eca?.eca_remark || "",
                      remark: r.remark || "",
                      pay_rec_no: r.pay_rec_no || "",
                      doc_rec_id: r.doc_rec_id || r.doc_rec?.id || "",
                      doc_rec_key: r.doc_rec_key || r.doc_rec?.doc_rec_id || "",
                    });
                    setSelected("✏️ Edit");
                    setPanelOpen(true);
                  }}>
                    <td className="py-2 px-3">{r.date || "-"}</td>
                    <td className="py-2 px-3">{r.vr_done_date || "-"}</td>
                    <td className="py-2 px-3">{r.enrollment_no || r.enrollment?.enrollment_no || "-"}</td>
                    <td className="py-2 px-3">{r.second_enrollment_no || r.second_enrollment?.enrollment_no || "-"}</td>
                    <td className="py-2 px-3">{r.student_name || "-"}</td>
                    <td className="py-2 px-3">{r.tr_count ?? "-"}</td>
                    <td className="py-2 px-3">{r.ms_count ?? "-"}</td>
                    <td className="py-2 px-3">{r.dg_count ?? "-"}</td>
                    <td className="py-2 px-3">{r.moi_count ?? "-"}</td>
                    <td className="py-2 px-3">{r.backlog_count ?? "-"}</td>
                    <td className="py-2 px-3"><Badge text={r.status} /></td>
                    <td className="py-2 px-3">{r.final_no || "-"}</td>
                    <td className="py-2 px-3"><MailBadge text={r.mail_status} /></td>
                    <td className="py-2 px-3">{r.eca?.eca_name || r.eca_name || "-"}</td>
                    <td className="py-2 px-3">{r.eca?.eca_ref_no || r.eca_ref_no || "-"}</td>
                    <td className="py-2 px-3">{r.eca?.eca_send_date || r.eca_submit_date || "-"}</td>
                    <td className="py-2 px-3">{r.doc_rec_key || r.doc_rec?.doc_rec_id || "-"}</td>
                    <td className="py-2 px-3">{r.remark || "-"}</td>
                    <td className="py-2 px-3">{r.last_resubmit_date || r.resubmit_date || "-"}</td>
                    <td className="py-2 px-3">{r.last_resubmit_status || r.resubmit_status || "-"}</td>
                    <td className="py-2 px-3">{records.length - idx}</td>
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
