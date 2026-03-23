// src/pages/assessment.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaFileExcel, FaFilePdf } from "react-icons/fa6";
import {
  generateEntriesPdf,
  downloadEntriesExcel,
} from "../report/assessment_report";
import { FaEdit, FaTrash } from "react-icons/fa";
import PageTopbar from "../components/PageTopbar";
import API from "../api/axiosInstance";
import AsstReceiver from "./subpages/asst_receiver";
import OutwardTab from "./subpages/asst_send";
import ReturnTab from "./subpages/asst_return";
import {
  createAssessmentEntry,
  deleteAssessmentEntry,
  finalReceiveAssessmentEntry,
  generateReturnAssessmentOutward,
  getAllAssessmentEntries,
  getAssessmentEntries,
  getPendingAssessmentEntries,
  generateAssessmentOutward,
  updateAssessmentEntry,
} from "../services/assessmentService";

// ─── helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    // Always use only the YYYY-MM-DD portion to avoid UTC-offset day-shift
    const s = typeof d === "string" ? d.slice(0, 10) : null;
    const dt =
      s && /^\d{4}-\d{2}-\d{2}$/.test(s)
        ? new Date(s + "T12:00:00")
        : new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    const day = String(dt.getDate()).padStart(2, "0");
    const month = String(dt.getMonth() + 1).padStart(2, "0");
    return `${day}-${month}-${dt.getFullYear()}`;
  } catch {
    return String(d);
  }
};

const statusColor = (s) => {
  switch (s) {
    case "Pending":
      return "bg-yellow-100 text-yellow-800";
    case "Outward":
      return "bg-blue-100 text-blue-800";
    case "InProgress":
      return "bg-orange-100 text-orange-800";
    case "PartiallyReceived":
      return "bg-orange-100 text-orange-800";
    case "Received":
      return "bg-green-100 text-green-800";
    case "Returned":
      return "bg-purple-100 text-purple-800";
    case "Completed":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const Badge = ({ label }) => (
  <span
    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(label)}`}
  >
    {label}
  </span>
);

const CONTROLLER_ACTIONS = ["Entry", "Pending", "Outward", "Return", "Receiver"];
const ENTRY_USER_ACTIONS = ["Entry", "Return"];
const RECEIVER_ACTIONS = ["Receiver"];

const DEFAULT_ENTRY_FORM = {
  entry_date: today(),
  exam_name: "",
  examiner_name: "",
  dummy_number: "",
  total_answer_sheet: "",
  remark: "",
};

const EMPTY_GENERATE_FORM = { receiver_user: "", remarks: "", outward_date: today() };

// ─── Entry Form ───────────────────────────────────────────────────────────────

const EntryForm = ({ onSaved, rights }) => {
  const [form, setForm] = useState(DEFAULT_ENTRY_FORM);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFlash(null);
    try {
      await createAssessmentEntry({
        ...form,
        total_answer_sheet: parseInt(form.total_answer_sheet, 10),
      });
      setFlash({ type: "success", msg: "Entry added successfully." });
      setForm(DEFAULT_ENTRY_FORM);
      if (onSaved) onSaved();
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        JSON.stringify(err?.response?.data) ||
        "Failed to save entry.";
      setFlash({ type: "error", msg: detail });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h3 className="mb-4 text-sm font-semibold text-slate-700">
        Add Assessment Entry
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Entry Date
          </label>
          <input
            type="date"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.entry_date}
            onChange={set("entry_date")}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Exam Name
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.exam_name}
            onChange={set("exam_name")}
            placeholder="e.g. B.Com Sem-4 April 2026"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Examiner Name
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.examiner_name}
            onChange={set("examiner_name")}
            placeholder="Examiner / Professor"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Dummy Number
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.dummy_number}
            onChange={set("dummy_number")}
            placeholder="e.g. 1001–1050"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Total Answer Sheets
          </label>
          <input
            type="number"
            min="1"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.total_answer_sheet}
            onChange={set("total_answer_sheet")}
            required
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Entry Remark
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.remark}
            onChange={set("remark")}
            placeholder="Optional entry-level remark"
          />
        </div>
      </div>

      {flash && (
        <p
          className={`mt-3 text-sm ${
            flash.type === "success" ? "text-green-700" : "text-red-600"
          }`}
        >
          {flash.msg}
        </p>
      )}

      {rights.can_create && (
        <button
          type="submit"
          disabled={saving}
          className="mt-4 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Add Entry"}
        </button>
      )}
    </form>
  );
};

// ─── Entry Detail / Edit Panel ────────────────────────────────────────────────

const EntryDetailPanel = ({ entry, onClose, onSaved, onDeleted, rights }) => {
  const [editMode, setEditMode] = useState(!!entry._openEdit);
  const [form, setForm] = useState({
    entry_date: entry.entry_date || today(),
    exam_name: entry.exam_name || "",
    examiner_name: entry.examiner_name || "",
    dummy_number: entry.dummy_number || "",
    total_answer_sheet: entry.total_answer_sheet || "",
    remark: entry.remark || "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [flash, setFlash] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    setFlash(null);
    try {
      await updateAssessmentEntry(entry.id, {
        ...form,
        total_answer_sheet: parseInt(form.total_answer_sheet, 10),
      });
      setFlash({ type: "success", msg: "Entry updated successfully." });
      setEditMode(false);
      if (onSaved) onSaved();
    } catch (err) {
      setFlash({
        type: "error",
        msg:
          err?.response?.data?.detail ||
          JSON.stringify(err?.response?.data) ||
          "Failed to update.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setFlash(null);
    try {
      await deleteAssessmentEntry(entry.id);
      if (onDeleted) onDeleted();
      onClose();
    } catch (err) {
      setFlash({
        type: "error",
        msg: err?.response?.data?.detail || "Failed to delete entry.",
      });
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const canEdit = rights.can_edit && entry.status === "Pending";
  const canDelete = rights.can_delete && entry.status === "Pending";

  return (
    <div className="action-panel-shell">
      {/* Header */}
      <div className="action-panel-header">
        <div className="action-panel-title">
          {editMode
            ? `Edit Entry${entry.exam_name ? " — " + entry.exam_name : ""}`
            : `Entry Details${entry.exam_name ? " — " + entry.exam_name : ""}`}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="action-panel-body">
        {flash && (
          <p
            className={`mb-3 rounded-lg px-3 py-2 text-sm ${
              flash.type === "success"
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {flash.msg}
          </p>
        )}

        {editMode ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Entry Date
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.entry_date}
                onChange={set("entry_date")}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Exam Name
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.exam_name}
                onChange={set("exam_name")}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Examiner Name
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.examiner_name}
                onChange={set("examiner_name")}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Dummy Number
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.dummy_number}
                onChange={set("dummy_number")}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Total Answer Sheets
              </label>
              <input
                type="number"
                min="1"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.total_answer_sheet}
                onChange={set("total_answer_sheet")}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Entry Remark
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.remark}
                onChange={set("remark")}
                placeholder="Optional"
              />
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-3 lg:grid-cols-5">
            {[
              ["Date", fmtDate(entry.entry_date)],
              ["Exam", entry.exam_name],
              ["Examiner", entry.examiner_name],
              ["Dummy No.", entry.dummy_number],
              ["Sheets", entry.total_answer_sheet],
              ["Entry Remark", entry.remark || "—"],
              ["Outward No.", entry.outward_no || "—"],
              ["Status", <Badge key="s" label={entry.status} />],
              [
                "Return Status",
                entry.return_status ? (
                  <Badge key="rs" label={entry.return_status} />
                ) : (
                  "—"
                ),
              ],
              ["Returned By (D)", entry.returned_by_name || "—"],
              [
                "Return Date",
                entry.returned_date ? fmtDate(entry.returned_date) : "—",
              ],
              ["Return Outward No.", entry.return_outward_no || "—"],
              ["Return Remark", entry.return_remark || "—"],
              [
                "Final Status",
                entry.final_receive_status ? (
                  <Badge key="fs" label={entry.final_receive_status} />
                ) : (
                  "—"
                ),
              ],
              ["Final Remark", entry.final_receive_remark || "—"],
            ].map(([label, val]) => (
              <div key={label}>
                <dt className="text-xs font-medium text-slate-500">{label}</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{val}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
          {confirmDelete ? (
            <>
              <span className="text-sm font-medium text-red-700">
                Delete this entry?
              </span>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="delete-button-compact"
              >
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="reset-button-compact"
              >
                Cancel
              </button>
            </>
          ) : editMode ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="save-button-compact"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditMode(false);
                  setFlash(null);
                }}
                className="reset-button-compact"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="edit-button-compact"
                >
                  ✏ Edit
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="delete-button-compact"
                >
                  🗑 Delete
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="reset-button-compact"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── My Entries Table ─────────────────────────────────────────────────────────

const MyEntriesTable = ({ refresh, rights }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(null);
  const [finalRemark, setFinalRemark] = useState({});
  const [flash, setFlash] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAssessmentEntries();
      setEntries(res.data?.results ?? res.data ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refresh]);

  const handleFinalReceive = async (detailId, remark) => {
    if (!detailId) return;
    setFinalizing(detailId);
    setFlash(null);
    try {
      await finalReceiveAssessmentEntry({
        detail_id: detailId,
        remark: remark || "",
      });
      setFlash({ type: "success", msg: "Final received successfully." });
      await load();
    } catch (err) {
      const detail =
        err?.response?.data?.detail || "Failed to complete final receive.";
      setFlash({ type: "error", msg: detail });
    } finally {
      setFinalizing(null);
    }
  };

  const handleExcel = async () => {
    setDownloadingExcel(true);
    await downloadEntriesExcel();
    setDownloadingExcel(false);
  };

  if (loading)
    return (
      <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
    );

  if (!entries.length)
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No entries found.
      </p>
    );

  return (
    <div className="space-y-2">
      {/* Export buttons */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={downloadingExcel}
          onClick={handleExcel}
          title="Export Excel"
          aria-label="Export Excel"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 shadow transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FaFileExcel size={20} color="#1D6F42" />
        </button>
        <button
          type="button"
          onClick={() => generateEntriesPdf(entries, "My Assessment Entries")}
          title="Export PDF"
          aria-label="Export PDF"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 shadow transition hover:bg-rose-100"
        >
          <FaFilePdf size={20} color="#D32F2F" />
        </button>
      </div>

      {/* Detail / Edit panel — above the table */}
      {selectedEntry && (
        <EntryDetailPanel
          entry={selectedEntry}
          rights={rights}
          onClose={() => setSelectedEntry(null)}
          onSaved={() => {
            load();
            setSelectedEntry(null);
          }}
          onDeleted={() => {
            load();
          }}
        />
      )}

      {flash && (
        <p
          className={`text-sm ${
            flash.type === "success" ? "text-green-700" : "text-red-600"
          }`}
        >
          {flash.msg}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {[
                "#",
                "Date",
                "Exam",
                "Examiner",
                "Dummy No.",
                "Sheets",
                "Entry Remark",
                "Outward No.",
                "Status",
                "Return Status",
                "Returned By",
                "Return Date",
                "Return Outward No.",
                "Return Remark",
                "Final Receive Status",
                "Final Receive Remark",
                "Action",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((e, i) => (
              <tr
                key={e.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => setSelectedEntry(e)}
              >
                <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                <td className="px-4 py-3">{fmtDate(e.entry_date)}</td>
                <td className="px-4 py-3 font-medium">{e.exam_name}</td>
                <td className="px-4 py-3">{e.examiner_name}</td>
                <td className="px-4 py-3">{e.dummy_number}</td>
                <td className="px-4 py-3">{e.total_answer_sheet}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {e.remark || "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {e.outward_no || "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge label={e.status} />
                </td>
                <td className="px-4 py-3">
                  {e.return_status ? <Badge label={e.return_status} /> : "—"}
                </td>
                <td className="px-4 py-3 text-xs font-medium text-purple-700">
                  {e.returned_by_name || "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                  {e.returned_date ? fmtDate(e.returned_date) : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">
                  {e.return_outward_no || "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {e.return_remark || "—"}
                </td>
                <td className="px-4 py-3">
                  {e.final_receive_status ? (
                    <Badge label={e.final_receive_status} />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {e.final_receive_remark || "—"}
                </td>
                {/* Action column — stop propagation so clicks here don't open panel */}
                <td
                  className="px-4 py-3"
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <div className="flex flex-wrap items-center gap-1">
                    {rights.can_edit && (
                      <button
                        type="button"
                        title="Edit"
                        onClick={() =>
                          setSelectedEntry({ ...e, _openEdit: true })
                        }
                        className="w-5 h-5 flex items-center justify-center icon-edit-button shadow-md rounded"
                      >
                        <FaEdit size={12} />
                      </button>
                    )}
                    {rights.can_delete && (
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => setSelectedEntry(e)}
                        className="w-5 h-5 flex items-center justify-center icon-delete-button shadow-md rounded"
                      >
                        <FaTrash size={12} />
                      </button>
                    )}
                    {e.status === "Returned" && e.detail_id && (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="Final remark"
                          className="w-28 rounded border border-slate-300 px-2 py-1 text-xs"
                          value={finalRemark[e.detail_id] || ""}
                          onChange={(ev) =>
                            setFinalRemark((r) => ({
                              ...r,
                              [e.detail_id]: ev.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleFinalReceive(
                              e.detail_id,
                              finalRemark[e.detail_id],
                            )
                          }
                          disabled={finalizing === e.detail_id}
                          className="save-button-compact"
                        >
                          {finalizing === e.detail_id
                            ? "Receiving…"
                            : "✔ Receive"}
                        </button>
                      </div>
                    )}
                    {e.status === "Completed" && (
                      <span className="text-xs text-emerald-700">
                        ✔ Completed
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Pending / Generate Outward ───────────────────────────────────────────────

const PendingTab = ({ rights }) => {
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_GENERATE_FORM);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pendRes, usrRes] = await Promise.all([
        getPendingAssessmentEntries(),
        API.get("/api/users/"),
      ]);
      setEntries(pendRes.data?.results ?? pendRes.data ?? []);
      setUsers(usrRes.data?.results ?? usrRes.data ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleAll = () => {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.id)));
    }
  };

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!selected.size) {
      setFlash({ type: "error", msg: "Select at least one entry." });
      return;
    }
    if (!form.receiver_user) {
      setFlash({ type: "error", msg: "Please select a receiver." });
      return;
    }
    setGenerating(true);
    setFlash(null);
    try {
      const res = await generateAssessmentOutward({
        entry_ids: [...selected],
        receiver_user: parseInt(form.receiver_user, 10),
        remarks: form.remarks,
        outward_date: form.outward_date || today(),
      });
      const no = res.data?.outward_no || res.data?.sent_no || "";
      setFlash({
        type: "success",
        msg: `Outward generated: ${no}`,
      });
      setSelected(new Set());
      setForm(EMPTY_GENERATE_FORM);
      load();
    } catch (err) {
      const detail =
        err?.response?.data?.detail || "Failed to generate outward.";
      setFlash({ type: "error", msg: detail });
    } finally {
      setGenerating(false);
    }
  };

  if (loading)
    return (
      <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
    );

  return (
    <div className="space-y-4">
      {/* Generate form */}
      {rights.can_create && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Generate Outward
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Outward Date
              </label>
              <input
                type="date"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.outward_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, outward_date: e.target.value }))
                }
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Receiver
              </label>
              <select
                className="w-52 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.receiver_user}
                onChange={(e) =>
                  setForm((f) => ({ ...f, receiver_user: e.target.value }))
                }
              >
                <option value="">— Select receiver —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.first_name || u.username}{" "}
                    {u.last_name ? u.last_name : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Remarks
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Optional remarks…"
                value={form.remarks}
                onChange={(e) =>
                  setForm((f) => ({ ...f, remarks: e.target.value }))
                }
              />
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !selected.size}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {generating
                ? "Generating…"
                : `Generate Outward (${selected.size} selected)`}
            </button>
          </div>
          {flash && (
            <p
              className={`mt-2 text-sm ${
                flash.type === "success" ? "text-green-700" : "text-red-600"
              }`}
            >
              {flash.msg}
            </p>
          )}
        </div>
      )}

      {/* Pending entries table */}
      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          No pending entries.
        </p>
      ) : (
        <div className="space-y-2">
          {/* Export buttons */}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => downloadEntriesExcel()}
              title="Export Excel"
              aria-label="Export Excel"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 shadow transition hover:bg-emerald-100"
            >
              <FaFileExcel size={20} color="#1D6F42" />
            </button>
            <button
              type="button"
              onClick={() => generateEntriesPdf(entries, "Pending Assessment Entries")}
              title="Export PDF"
              aria-label="Export PDF"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 shadow transition hover:bg-rose-100"
            >
              <FaFilePdf size={20} color="#D32F2F" />
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={
                      selected.size === entries.length && entries.length > 0
                    }
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                {[
                  "Date",
                  "Exam",
                  "Examiner",
                  "Dummy No.",
                  "Sheets",
                  "Added By",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => toggle(e.id)}
                  className={`cursor-pointer hover:bg-slate-50 ${
                    selected.has(e.id) ? "bg-indigo-50" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(e.id)}
                      onChange={() => toggle(e.id)}
                      onClick={(ev) => ev.stopPropagation()}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3">{fmtDate(e.entry_date)}</td>
                  <td className="px-4 py-3 font-medium">{e.exam_name}</td>
                  <td className="px-4 py-3">{e.examiner_name}</td>
                  <td className="px-4 py-3">{e.dummy_number}</td>
                  <td className="px-4 py-3">{e.total_answer_sheet}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{e.remark || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {e.added_by_name || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const DEFAULT_RIGHTS = {
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
};

const AssessmentPage = ({
  rights = DEFAULT_RIGHTS,
  role = "entry",
  isAdmin = false,
  onToggleSidebar,
  onToggleChatbox,
}) => {
  const availableActions = useMemo(() => {
    if (isAdmin || role === "controller") return CONTROLLER_ACTIONS;
    return ENTRY_USER_ACTIONS;
  }, [isAdmin, role]);

  const [selectedAction, setSelectedAction] = useState(availableActions[0]);
  const [entryRefresh, setEntryRefresh] = useState(0);

  useEffect(() => {
    if (!availableActions.includes(selectedAction)) {
      setSelectedAction(availableActions[0]);
    }
  }, [availableActions, selectedAction]);

  // Receiver role: dedicated panel with tab-based UI
  if (role === "receiver") {
    return <AsstReceiver onToggleSidebar={onToggleSidebar} />;
  }

  return (
    <div className="flex h-full flex-col">
      <PageTopbar
        title="Assessment System"
        actions={availableActions}
        selected={selectedAction}
        onSelect={setSelectedAction}
        onToggleSidebar={onToggleSidebar}
        onToggleChatbox={onToggleChatbox}
        showHomeButton={isAdmin}
      />

      <div className="flex-1 overflow-auto px-2 py-4">
        {selectedAction === "Entry" && (
          <div className="space-y-4">
            <EntryForm
              rights={rights}
              onSaved={() => setEntryRefresh((v) => v + 1)}
            />
            <MyEntriesTable refresh={entryRefresh} rights={rights} />
          </div>
        )}

        {selectedAction === "Return" && (
          <ReturnTab rights={rights} />
        )}

        {selectedAction === "Pending" && (isAdmin || role === "controller") && (
          <PendingTab rights={rights} />
        )}

        {selectedAction === "Outward" && (isAdmin || role === "controller") && (
          <OutwardTab rights={rights} />
        )}
      </div>
    </div>
  );
};

export default AssessmentPage;
