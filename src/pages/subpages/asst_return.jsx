// src/pages/subpages/asst_return.jsx
// ReturnEntryPanel + ReturnTab — extracted from assessment.jsx.
// Shows returned/completed entries with final-receive action and per-outward exports.

import React, { useCallback, useEffect, useState } from "react";
import { FaFileExcel, FaFilePdf } from "react-icons/fa6";
import { FaEdit } from "react-icons/fa";
import {
  fmtDate,
  generateReturnEntriesPdf,
  generateReturnOutwardPdf,
  downloadReturnOutwardExcel,
} from "../../report/assessment_report";
import {
  exportAssessmentExcel,
  getAssessmentEntries,
  finalReceiveAssessmentEntry,
} from "../../services/assessmentService";

// ─── Local helpers ────────────────────────────────────────────────────────────

const statusColor = (s) => {
  switch (s) {
    case "Pending":    return "bg-yellow-100 text-yellow-800";
    case "Outward":    return "bg-blue-100 text-blue-800";
    case "InProgress": return "bg-orange-100 text-orange-800";
    case "Received":   return "bg-green-100 text-green-800";
    case "Returned":   return "bg-purple-100 text-purple-800";
    case "Completed":  return "bg-emerald-100 text-emerald-800";
    default:           return "bg-gray-100 text-gray-700";
  }
};

const Badge = ({ label }) => (
  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(label)}`}>
    {label}
  </span>
);

// ─── Return Entry Panel ───────────────────────────────────────────────────────

const ReturnEntryPanel = ({ entry, rights, onClose, onSaved }) => {
  const [finalRemark, setFinalRemark] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const [flash, setFlash] = useState(null);

  const handleFinalReceive = async () => {
    setFinalizing(true);
    setFlash(null);
    try {
      await finalReceiveAssessmentEntry({
        detail_id: entry.detail_id,
        remark: finalRemark,
      });
      setFlash({ type: "success", msg: "Final received successfully." });
      setTimeout(() => {
        onSaved();
        onClose();
      }, 900);
    } catch (err) {
      setFlash({
        type: "error",
        msg: err?.response?.data?.detail || "Failed to finalise.",
      });
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="action-panel-shell">
      {/* Header */}
      <div className="action-panel-header">
        <div className="action-panel-title">
          {`Returned Entry${entry.exam_name ? " — " + entry.exam_name : ""}`}
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
      <div className="action-panel-body space-y-3">
        {/* Return Remark Banner (from D) */}
        {entry.return_remark && (
          <div className="rounded-xl border border-purple-300 bg-purple-50 px-4 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-purple-600">
              Return Remark from Receiver (D)
            </p>
            <p className="text-sm font-medium text-purple-900">
              "{entry.return_remark}"
            </p>
            <div className="mt-1 flex flex-wrap gap-4 text-xs text-purple-700">
              {entry.returned_by_name && (
                <span>By: <strong>{entry.returned_by_name}</strong></span>
              )}
              {entry.returned_date && (
                <span>Date: <strong>{fmtDate(entry.returned_date)}</strong></span>
              )}
              {entry.return_outward_no && (
                <span>Return Outward: <strong>{entry.return_outward_no}</strong></span>
              )}
            </div>
          </div>
        )}

        {/* Entry details */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-3 lg:grid-cols-5">
          {[
            ["Entry Date", fmtDate(entry.entry_date)],
            ["Exam Name", entry.exam_name],
            ["Examiner Name", entry.examiner_name],
            ["Dummy Number", entry.dummy_number],
            ["Total Answer Sheets", entry.total_answer_sheet],
            ["Outward No.", entry.outward_no || "—"],
            ["Status", <Badge key="s" label={entry.status} />],
            ["Return Status", entry.return_status ? <Badge key="rs" label={entry.return_status} /> : "—"],
            ["Final Status", entry.final_receive_status || "—"],
            ["Final Remark", entry.final_receive_remark || "—"],
            ["Remark", entry.remark || "—"],
          ].map(([label, val]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-slate-500">{label}</dt>
              <dd className="mt-0.5 font-medium text-slate-800">{val}</dd>
            </div>
          ))}
        </dl>

        {/* Final receive action */}
        {entry.status === "Returned" && entry.detail_id && (
          <div className="border-t border-slate-200 pt-3">
            <p className="mb-1 text-xs font-medium text-slate-600">Final Receive Remark</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Enter final receive remark…"
                className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                value={finalRemark}
                onChange={(e) => setFinalRemark(e.target.value)}
              />
              <button
                type="button"
                onClick={handleFinalReceive}
                disabled={finalizing}
                className="save-button-compact"
              >
                {finalizing ? "Receiving…" : "✔ Final Receive"}
              </button>
            </div>
          </div>
        )}

        {/* Flash */}
        {flash && (
          <p className={`text-sm ${flash.type === "success" ? "text-green-700" : "text-red-600"}`}>
            {flash.msg}
          </p>
        )}

        {/* Close */}
        <div className="border-t border-slate-200 pt-3">
          <button type="button" onClick={onClose} className="reset-button-compact">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Return Tab ───────────────────────────────────────────────────────────────

const ReturnTab = ({ rights }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingReturnExcel, setDownloadingReturnExcel] = useState(null);
  const [selectedRetNo, setSelectedRetNo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAssessmentEntries();
      const all = res.data?.results ?? res.data ?? [];
      setEntries(all.filter((e) => ["Returned", "Completed"].includes(e.status)));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleExcel = async () => {
    setDownloadingExcel(true);
    try {
      const res = await exportAssessmentExcel({ status: "Returned,Completed" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "return_entries.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      /* silent */
    } finally {
      setDownloadingExcel(false);
    }
  };

  const handlePdf = () => generateReturnEntriesPdf(entries);

  if (loading)
    return <p className="py-8 text-center text-sm text-slate-500">Loading…</p>;

  if (!entries.length)
    return <p className="py-8 text-center text-sm text-slate-500">No returned entries yet.</p>;

  const withRemark = entries.filter((e) => e.return_remark);

  return (
    <div className="space-y-3">
      {flash && (
        <p className={`text-sm ${flash.type === "success" ? "text-green-700" : "text-red-600"}`}>
          {flash.msg}
        </p>
      )}

      {/* Return remarks banner */}
      {withRemark.length > 0 && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-purple-600">
            Return Remarks from Receiver (D)
          </p>
          <ul className="space-y-1">
            {withRemark.map((e) => (
              <li key={e.id} className="text-sm text-purple-900">
                <span className="font-medium">{e.exam_name}</span>
                {e.dummy_number && (
                  <span className="ml-1 text-purple-700">#{e.dummy_number}</span>
                )}
                {" — "}
                <span className="italic">"{e.return_remark}"</span>
                {e.returned_by_name && (
                  <span className="ml-2 text-xs text-purple-500">by {e.returned_by_name}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Export buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleExcel}
          disabled={downloadingExcel}
          title="Export Excel"
          aria-label="Export Excel"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 shadow transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FaFileExcel size={20} color="#1D6F42" />
        </button>
        <button
          type="button"
          onClick={handlePdf}
          title="Export PDF"
          aria-label="Export PDF"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 shadow transition hover:bg-rose-100"
        >
          <FaFilePdf size={20} color="#D32F2F" />
        </button>
      </div>

      {/* Per-return-outward PDF/Excel — dropdown */}
      {(() => {
        const distinctRetNos = [
          ...new Set(
            entries
              .filter((e) => e.return_outward_no)
              .map((e) => e.return_outward_no),
          ),
        ];
        if (!distinctRetNos.length) return null;
        return (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-purple-100 bg-purple-50 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-600">
              Return Outward Export:
            </span>
            <select
              className="rounded-lg border border-purple-300 bg-white px-3 py-1.5 font-mono text-xs text-purple-700 focus:outline-none"
              value={selectedRetNo}
              onChange={(e) => setSelectedRetNo(e.target.value)}
            >
              <option value="">— Select No. —</option>
              {distinctRetNos.map((no) => (
                <option key={no} value={no}>{no}</option>
              ))}
            </select>
            <button
              type="button"
              title="Download PDF"
              disabled={!selectedRetNo}
              onClick={() => {
                const rows = entries
                  .filter((e) => e.return_outward_no === selectedRetNo)
                  .map((e) => ({
                    exam: e.exam_name,
                    dummy: e.dummy_number,
                    sheets: e.total_answer_sheet,
                    outwardNo: e.outward_no,
                    remark: e.return_remark,
                  }));
                generateReturnOutwardPdf(selectedRetNo, null, rows);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-rose-200 bg-rose-50 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FaFilePdf size={14} color="#D32F2F" />
            </button>
            <button
              type="button"
              title="Download Excel"
              disabled={!selectedRetNo || downloadingReturnExcel === selectedRetNo}
              onClick={() =>
                downloadReturnOutwardExcel(selectedRetNo, (v) =>
                  setDownloadingReturnExcel(v ? selectedRetNo : null),
                )
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-emerald-200 bg-emerald-50 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FaFileExcel size={14} color="#1D6F42" />
            </button>
          </div>
        );
      })()}

      {/* Detail Panel */}
      {selectedEntry && (
        <ReturnEntryPanel
          entry={selectedEntry}
          rights={rights}
          onClose={() => setSelectedEntry(null)}
          onSaved={() => load()}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {[
                "#", "Date", "Exam", "Dummy No.", "Outward No.", "Status",
                "Returned By (D)", "Return Date", "Return Outward No.",
                "Return Remark", "Final Status", "Final Remark", "Action",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
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
                className="cursor-pointer hover:bg-purple-50"
                onClick={() => setSelectedEntry(e)}
              >
                <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                <td className="px-4 py-3 whitespace-nowrap">{fmtDate(e.entry_date)}</td>
                <td className="px-4 py-3 font-medium">{e.exam_name}</td>
                <td className="px-4 py-3">{e.dummy_number}</td>
                <td className="px-4 py-3 font-mono text-xs">{e.outward_no || "—"}</td>
                <td className="px-4 py-3"><Badge label={e.status} /></td>
                <td className="px-4 py-3 text-xs font-semibold text-purple-700">{e.returned_by_name || "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                  {e.returned_date ? fmtDate(e.returned_date) : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-purple-700">{e.return_outward_no || "—"}</td>
                <td className="px-4 py-3 max-w-[180px] truncate text-xs text-slate-700">{e.return_remark || "—"}</td>
                <td className="px-4 py-3">
                  {e.status === "Completed" ? <Badge label="Received Back" /> : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{e.final_receive_remark || "—"}</td>
                <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="View / Final Receive"
                      onClick={() => setSelectedEntry(e)}
                      className="w-5 h-5 flex items-center justify-center icon-edit-button shadow-md rounded"
                    >
                      <FaEdit size={12} />
                    </button>
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

export default ReturnTab;
