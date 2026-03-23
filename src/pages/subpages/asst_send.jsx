// src/pages/subpages/asst_send.jsx
// OutwardTab — accordion list of all assessment outwards with per-outward PDF/Excel.
// Extracted from assessment.jsx for easier management.

import React, { useCallback, useEffect, useState } from "react";
import { FaFileExcel, FaFilePdf } from "react-icons/fa6";
import {
  fmtDate,
  generateOutwardPdf,
  downloadOutwardExcel,
} from "../../report/assessment_report";
import { getAssessmentOutwards } from "../../services/assessmentService";

// ─── Local helpers ────────────────────────────────────────────────────────────

const statusColor = (s) => {
  switch (s) {
    case "Pending":        return "bg-yellow-100 text-yellow-800";
    case "Outward":        return "bg-blue-100 text-blue-800";
    case "InProgress":     return "bg-orange-100 text-orange-800";
    case "Received":       return "bg-green-100 text-green-800";
    case "Returned":       return "bg-purple-100 text-purple-800";
    case "Completed":      return "bg-emerald-100 text-emerald-800";
    default:               return "bg-gray-100 text-gray-700";
  }
};

const Badge = ({ label }) => (
  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(label)}`}>
    {label}
  </span>
);

// ─── OutwardTab ───────────────────────────────────────────────────────────────

const OutwardTab = ({ rights }) => {
  const [outwards, setOutwards] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAssessmentOutwards();
      setOutwards(res.data?.results ?? res.data ?? []);
    } catch {
      setOutwards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading)
    return <p className="py-8 text-center text-sm text-slate-500">Loading…</p>;
  if (!outwards.length)
    return <p className="py-8 text-center text-sm text-slate-500">No outward records found.</p>;

  return (
    <div className="space-y-3">
      {outwards.map((o) => (
        <div key={o.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Header row */}
          <div
            className="flex cursor-pointer items-center justify-between px-5 py-4"
            onClick={() => setExpanded((prev) => (prev === o.id ? null : o.id))}
          >
            <div className="flex items-center gap-4">
              <span className="font-mono text-sm font-semibold text-indigo-700">{o.outward_no}</span>
              <span className="text-sm text-slate-500">{fmtDate(o.outward_date)}</span>
              <Badge label={o.status} />
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span>Receiver: <span className="font-medium text-slate-700">{o.receiver_name || "—"}</span></span>
              <span>{o.received_count}/{o.total_entries} received</span>
              <span>{o.returned_count || 0} returned</span>
              <span>{o.final_received_count || 0} final received</span>
              {/* PDF / Excel per outward */}
              <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                <button
                  type="button"
                  title="Download PDF"
                  aria-label="Download PDF"
                  onClick={() => generateOutwardPdf(o)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 shadow transition hover:bg-rose-100"
                >
                  <FaFilePdf size={15} color="#D32F2F" />
                </button>
                <button
                  type="button"
                  title="Download Excel"
                  aria-label="Download Excel"
                  disabled={downloadingExcel === o.id}
                  onClick={() => downloadOutwardExcel(o.outward_no, (v) => setDownloadingExcel(v ? o.id : null))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 shadow transition hover:bg-emerald-100 disabled:opacity-60"
                >
                  <FaFileExcel size={15} color="#1D6F42" />
                </button>
              </div>
              <span className="text-slate-400">{expanded === o.id ? "▲" : "▼"}</span>
            </div>
          </div>

          {/* Expanded details */}
          {expanded === o.id && (
            <div className="border-t border-slate-100 px-5 pb-4 pt-3">
              {o.remarks && (
                <p className="mb-3 text-sm text-slate-600">
                  <span className="font-medium">Remarks:</span> {o.remarks}
                </p>
              )}
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Dummy No.", "Exam", "Examiner", "Sheets", "Entry Remark",
                      "Receive Status", "Return Status", "Return Outward No.",
                      "Returned By", "Return Date", "Completed", "Received By",
                      "Received Date", "Return Remark", "Final Status", "Final Remark",
                    ].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(o.details || []).map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">{d.entry_detail?.dummy_number}</td>
                      <td className="px-3 py-2">{d.entry_detail?.exam_name}</td>
                      <td className="px-3 py-2">{d.entry_detail?.examiner_name}</td>
                      <td className="px-3 py-2">{d.entry_detail?.total_answer_sheet}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{d.entry_detail?.remark || "—"}</td>
                      <td className="px-3 py-2"><Badge label={d.receive_status} /></td>
                      <td className="px-3 py-2"><Badge label={d.return_status || "Pending"} /></td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{d.return_outward_no || "—"}</td>
                      <td className="px-3 py-2 text-xs font-medium text-purple-700">{d.returned_by_name || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">{d.returned_date ? fmtDate(d.returned_date) : "—"}</td>
                      <td className="px-3 py-2">{d.entry_detail?.status === "Completed" ? <Badge label="Completed" /> : "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{d.received_by_name || "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{d.received_date ? fmtDate(d.received_date) : "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{d.return_remark || "—"}</td>
                      <td className="px-3 py-2">{d.final_receive_status === "Received" ? <Badge label="Received Back" /> : "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{d.final_receive_remark || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default OutwardTab;
