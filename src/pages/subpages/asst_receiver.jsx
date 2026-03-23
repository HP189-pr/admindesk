// src/pages/subpages/asst_receiver.jsx
/**
 * Assessment Receiver Page
 * Dedicated UI for the Receiver (D-role) user.
 *
 * Tab 1 – Receive     : pending items to receive + batch return outward generation
 * Tab 2 – All Records : flat table of all assigned entries, select-based return
 *                       outward + PDF download
 *
 * PDF/date helpers imported from ../../report/assessment_report to avoid duplication.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FaEdit } from "react-icons/fa";
import {
  fmtDate,
  generateReceiverReturnPdf,
} from "../../report/assessment_report";
import {
  generateReturnAssessmentOutward,
  getMyAssessmentOutwards,
  receiveAssessmentEntry,
  updateWorkStatus,
} from "../../services/assessmentService";

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
  <span
    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(label)}`}
  >
    {label || "—"}
  </span>
);

/**
 * Single composite status label from the RECEIVER's perspective.
 */
const receiverItemStatus = (d) => {
  if (d.final_receive_status === "Received" || d.entry_detail?.status === "Completed")
    return { label: "Received Back", cls: "bg-emerald-100 text-emerald-800" };
  if (d.return_status === "Returned")
    return { label: "Returned", cls: "bg-purple-100 text-purple-800" };
  if (d.receive_status === "Received")
    return { label: "In Hand", cls: "bg-blue-100 text-blue-800" };
  return { label: "Pending", cls: "bg-yellow-100 text-yellow-800" };
};

const ReceiverStatusBadge = ({ d }) => {
  const { label, cls } = receiverItemStatus(d);
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
};

// ─── Tab 1 – Receive ──────────────────────────────────────────────────────────

const ReceiveTab = () => {
  const [outwards, setOutwards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [receiveRemark, setReceiveRemark] = useState({});
  const [returnRemark, setReturnRemark] = useState({});
  const [receiving, setReceiving] = useState(null);
  const [batchReturning, setBatchReturning] = useState(false);
  const [selected, setSelected] = useState({}); // { outwardId: Set<detailId> }
  const [flash, setFlash] = useState({});
  const [returnSummary, setReturnSummary] = useState(null);
  const [workStatusMap, setWorkStatusMap] = useState({}); // { detailId: "InProgress"|"Done" }
  const [workRemark, setWorkRemark] = useState({});
  const [updatingWork, setUpdatingWork] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyAssessmentOutwards();
      setOutwards(res.data?.results ?? res.data ?? []);
    } catch {
      setOutwards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setFlashMsg = (key, type, msg) =>
    setFlash((f) => ({ ...f, [key]: { type, msg } }));

  const handleReceive = async (detailId) => {
    setReceiving(detailId);
    setFlash((f) => ({ ...f, [detailId]: null }));
    try {
      await receiveAssessmentEntry({
        detail_id: detailId,
        remark: receiveRemark[detailId] || "",
      });
      setFlashMsg(detailId, "success", "Marked as received.");
      load();
    } catch (err) {
      setFlashMsg(detailId, "error", err?.response?.data?.detail || "Failed to mark received.");
    } finally {
      setReceiving(null);
    }
  };

  const handleUpdateWork = async (detailId, statusVal) => {
    setUpdatingWork(detailId);
    setFlash((f) => ({ ...f, [detailId]: null }));
    try {
      await updateWorkStatus({
        detail_id: detailId,
        status: statusVal,
        remark: workRemark[detailId] || "",
      });
      setWorkStatusMap((m) => ({ ...m, [detailId]: statusVal }));
      setFlashMsg(detailId, "success", `Work status set to ${statusVal}.`);
      load();
    } catch (err) {
      setFlashMsg(detailId, "error", err?.response?.data?.detail || "Failed to update work status.");
    } finally {
      setUpdatingWork(null);
    }
  };

  const toggleSelect = (outwardId, detailId) => {
    setSelected((prev) => {
      const key = String(outwardId);
      const s = new Set(prev[key] || []);
      s.has(detailId) ? s.delete(detailId) : s.add(detailId);
      return { ...prev, [key]: s };
    });
  };

  const handleGenerateReturn = async (outward) => {
    const key = String(outward.id);
    const flashKey = `outward_${key}`;
    const detailIds = Array.from(selected[key] || []);
    if (!detailIds.length) return;

    const payload = detailIds.map((did) => ({
      detail_id: did,
      remark: returnRemark[did] || "",
    }));

    setBatchReturning(true);
    try {
      const res = await generateReturnAssessmentOutward(payload);
      const returnNo = res?.data?.return_outward_no || "";
      setReturnSummary({
        returnNo,
        outwardNo: outward.outward_no,
        receiverName: outward.receiver_name,
        count: res?.data?.count || detailIds.length,
        items: detailIds.map((did) => {
          const detail = (outward.details || []).find((d) => d.id === did);
          return {
            dummy_number: detail?.entry_detail?.dummy_number,
            exam_name: detail?.entry_detail?.exam_name,
            examiner_name: detail?.entry_detail?.examiner_name,
            total_answer_sheet: detail?.entry_detail?.total_answer_sheet,
            return_remark: returnRemark[did] || "",
          };
        }),
      });
      setFlashMsg(flashKey, "success", returnNo ? `Return outward generated: ${returnNo}` : "Return outward generated.");
      setSelected((prev) => ({ ...prev, [key]: new Set() }));
      await load();
    } catch (err) {
      setFlashMsg(flashKey, "error", err?.response?.data?.detail || "Failed to generate return outward.");
    } finally {
      setBatchReturning(false);
    }
  };

  if (loading) return <p className="py-8 text-center text-sm text-slate-500">Loading…</p>;
  if (!outwards.length) return <p className="py-8 text-center text-sm text-slate-500">No outwards assigned to you.</p>;

  return (
    <div className="space-y-3">
      {/* Return summary banner */}
      {returnSummary && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-sm font-semibold text-purple-800">✔ Return Outward Generated</p>
              <div className="flex flex-wrap gap-4 text-sm text-purple-700">
                <span>Return No: <strong className="font-mono">{returnSummary.returnNo || "—"}</strong></span>
                <span>Items: <strong>{returnSummary.count}</strong></span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => generateReceiverReturnPdf({
                  returnNo: returnSummary.returnNo,
                  outwardNo: returnSummary.outwardNo,
                  receiverName: returnSummary.receiverName,
                  items: returnSummary.items,
                })}
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
              >
                ⬇ Download PDF
              </button>
              <button type="button" onClick={() => setReturnSummary(null)} className="text-xs text-purple-400 hover:text-purple-600">✕</button>
            </div>
          </div>
        </div>
      )}

      {outwards.map((o) => (
        <div key={o.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Accordion header */}
          <div
            className="flex cursor-pointer items-center justify-between px-5 py-4"
            onClick={() => setExpanded((p) => (p === o.id ? null : o.id))}
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-indigo-700">{o.outward_no}</span>
              <span className="text-xs text-slate-400">{fmtDate(o.outward_date)}</span>
              <Badge label={o.status} />
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>{o.received_count}/{o.total_entries} received</span>
              <span>{o.returned_count || 0} returned</span>
              <span>{expanded === o.id ? "▲" : "▼"}</span>
            </div>
          </div>

          {/* Expanded details */}
          {expanded === o.id && (
            <div className="space-y-3 border-t border-slate-100 px-5 pb-4 pt-3">
              {o.remarks && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2">
                  <span className="text-xs font-semibold text-blue-600">Admin note: </span>
                  <span className="text-xs text-blue-800">{o.remarks}</span>
                </div>
              )}

              {/* Batch return controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-600">Select received items to generate one return outward number.</p>
                <button
                  type="button"
                  disabled={batchReturning || !(selected[String(o.id)]?.size > 0)}
                  onClick={() => handleGenerateReturn(o)}
                  className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {batchReturning ? "Generating…" : `Generate Return Outward (${selected[String(o.id)]?.size || 0})`}
                </button>
              </div>

              {flash[`outward_${o.id}`] && (
                <p className={`text-xs ${flash[`outward_${o.id}`].type === "success" ? "text-green-700" : "text-red-600"}`}>
                  {flash[`outward_${o.id}`].msg}
                </p>
              )}

              {(o.details || []).map((d) => {
                const isPending = d.receive_status === "Pending";
                const isReceived = d.receive_status === "Received";
                const isReturned = d.return_status === "Returned";
                const currentWork = workStatusMap[d.id] ?? d.work_status ?? "Pending";
                const workDone = currentWork === "Done";

                return (
                  <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                    {/* Entry info */}
                    <div className="min-w-[180px] flex-1">
                      <p className="text-sm font-medium text-slate-800">{d.entry_detail?.exam_name}</p>
                      <p className="text-xs text-slate-500">
                        Dummy: {d.entry_detail?.dummy_number} &bull; Sheets: {d.entry_detail?.total_answer_sheet} &bull; Examiner: {d.entry_detail?.examiner_name}
                      </p>
                      {d.entry_detail?.remark && (
                        <p className="mt-0.5 text-xs text-slate-400">Entry remark: {d.entry_detail.remark}</p>
                      )}
                    </div>

                    {/* Checkbox — only when work is Done */}
                    {isReceived && !isReturned && workDone ? (
                      <input
                        type="checkbox"
                        title="Select for return outward"
                        checked={!!selected[String(o.id)]?.has(d.id)}
                        onChange={() => toggleSelect(o.id, d.id)}
                        className="h-4 w-4 rounded"
                      />
                    ) : (
                      <span className="w-4" />
                    )}

                    <ReceiverStatusBadge d={d} />

                    {/* Work status badge */}
                    {isReceived && !isReturned && (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                        currentWork === "Done" ? "bg-green-100 text-green-800"
                          : currentWork === "InProgress" ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {currentWork === "Done" ? "🟢 Done" : currentWork === "InProgress" ? "🔵 In Progress" : "⚪ Work Pending"}
                      </span>
                    )}

                    {d.return_outward_no && (
                      <span className="font-mono text-xs text-purple-700">{d.return_outward_no}</span>
                    )}

                    {/* Receive action */}
                    {isPending && (
                      <>
                        <input
                          type="text"
                          className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                          placeholder="Receive remark"
                          value={receiveRemark[d.id] || ""}
                          onChange={(e) => setReceiveRemark((r) => ({ ...r, [d.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          disabled={receiving === d.id}
                          onClick={() => handleReceive(d.id)}
                          className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {receiving === d.id ? "Saving…" : "Receive"}
                        </button>
                      </>
                    )}

                    {/* Work status controls */}
                    {isReceived && !isReturned && (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                          value={currentWork}
                          disabled={updatingWork === d.id || isReturned}
                          onChange={(e) => handleUpdateWork(d.id, e.target.value)}
                        >
                          <option value="Pending">Work Pending</option>
                          <option value="InProgress">In Progress</option>
                          <option value="Done">Done</option>
                        </select>
                        <input
                          type="text"
                          className="w-36 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                          placeholder="Work remark"
                          value={workRemark[d.id] || ""}
                          onChange={(e) => setWorkRemark((r) => ({ ...r, [d.id]: e.target.value }))}
                        />
                      </div>
                    )}

                    {/* Return remark — only when work Done */}
                    {isReceived && !isReturned && workDone && (
                      <input
                        type="text"
                        className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                        placeholder="Return remark"
                        value={returnRemark[d.id] || ""}
                        onChange={(e) => setReturnRemark((r) => ({ ...r, [d.id]: e.target.value }))}
                      />
                    )}

                    {isReturned && (
                      <span className="text-xs text-purple-700">
                        Returned ✔{d.return_remark ? ` — ${d.return_remark}` : ""}
                      </span>
                    )}

                    {d.final_receive_status === "Received" && (
                      <div className="text-xs text-emerald-700">
                        ✔ Received by sender{d.final_received_by_name ? ` (${d.final_received_by_name})` : ""}
                        {d.final_receive_remark && <div className="text-slate-500">Remark: {d.final_receive_remark}</div>}
                      </div>
                    )}

                    {flash[d.id] && (
                      <p className={`w-full text-xs ${flash[d.id].type === "success" ? "text-green-700" : "text-red-600"}`}>
                        {flash[d.id].msg}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Tab 2 – All Records ──────────────────────────────────────────────────────

const AllRecordsTab = () => {
  const [outwards, setOutwards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const [returnRemark, setReturnRemark] = useState({});
  const [batchReturning, setBatchReturning] = useState(false);
  const [flash, setFlash] = useState(null);
  const [returnSummary, setReturnSummary] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyAssessmentOutwards();
      setOutwards(res.data?.results ?? res.data ?? []);
    } catch {
      setOutwards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const allRows = outwards.flatMap((o) =>
    (o.details || []).map((d) => ({ ...d, _outward: o }))
  );

  const filtered = allRows.filter((d) => {
    if (filter === "pending")  return d.receive_status === "Pending";
    if (filter === "received") return d.receive_status === "Received" && d.return_status !== "Returned";
    if (filter === "returned") return d.return_status === "Returned";
    return true;
  });

  const receivableIds = new Set(
    filtered
      .filter((d) => d.receive_status === "Received" && d.return_status !== "Returned" && d.work_status === "Done")
      .map((d) => d.id)
  );

  const toggleRow = (id) => {
    if (!receivableIds.has(id)) return;
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleAll = () =>
    setSelected(selected.size === receivableIds.size ? new Set() : new Set(receivableIds));

  const handleGenerateReturn = async () => {
    const detailIds = Array.from(selected);
    if (!detailIds.length) return;

    const payload = detailIds.map((did) => ({ detail_id: did, remark: returnRemark[did] || "" }));

    setBatchReturning(true);
    setFlash(null);
    try {
      const res = await generateReturnAssessmentOutward(payload);
      const returnNo = res?.data?.return_outward_no || "";
      const items = detailIds.map((did) => {
        const row = allRows.find((d) => d.id === did);
        return {
          dummy_number: row?.entry_detail?.dummy_number,
          exam_name: row?.entry_detail?.exam_name,
          examiner_name: row?.entry_detail?.examiner_name,
          total_answer_sheet: row?.entry_detail?.total_answer_sheet,
          return_remark: returnRemark[did] || "",
        };
      });
      const receiverName = allRows.find((d) => d.id === detailIds[0])?._outward?.receiver_name || "";
      const outwardNo   = allRows.find((d) => d.id === detailIds[0])?._outward?.outward_no || "";
      setReturnSummary({ returnNo, receiverName, outwardNo, count: res?.data?.count || detailIds.length, items });
      setFlash({ type: "success", msg: returnNo ? `Return outward generated: ${returnNo}` : "Return outward generated." });
      setSelected(new Set());
      await load();
    } catch (err) {
      setFlash({ type: "error", msg: err?.response?.data?.detail || "Failed to generate return outward." });
    } finally {
      setBatchReturning(false);
    }
  };

  const FILTERS = [
    { key: "all",      label: "All" },
    { key: "pending",  label: "Pending" },
    { key: "received", label: "Received" },
    { key: "returned", label: "Returned" },
  ];

  if (loading)    return <p className="py-8 text-center text-sm text-slate-500">Loading…</p>;
  if (!allRows.length) return <p className="py-8 text-center text-sm text-slate-500">No records found.</p>;

  return (
    <div className="space-y-3">
      {/* Return summary banner */}
      {returnSummary && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-sm font-semibold text-purple-800">✔ Return Outward Generated</p>
              <div className="flex flex-wrap gap-4 text-sm text-purple-700">
                <span>Return No: <strong className="font-mono">{returnSummary.returnNo || "—"}</strong></span>
                <span>Items: <strong>{returnSummary.count}</strong></span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => generateReceiverReturnPdf({
                  returnNo: returnSummary.returnNo,
                  outwardNo: returnSummary.outwardNo,
                  receiverName: returnSummary.receiverName,
                  items: returnSummary.items,
                })}
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
              >
                ⬇ Download PDF
              </button>
              <button type="button" onClick={() => setReturnSummary(null)} className="text-xs text-purple-400 hover:text-purple-600">✕</button>
            </div>
          </div>
        </div>
      )}

      {/* Cross-outward hint */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-700">
        You can select items from <strong>any outward</strong> and generate one return outward number for all of them in a single click.
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                filter === f.key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <input
              type="text"
              className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              placeholder="Batch return remark (optional)"
              onChange={(e) => {
                const val = e.target.value;
                setReturnRemark((r) => {
                  const next = { ...r };
                  Array.from(selected).forEach((id) => { next[id] = val; });
                  return next;
                });
              }}
            />
          )}
          <button
            type="button"
            disabled={batchReturning || selected.size === 0}
            onClick={handleGenerateReturn}
            className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {batchReturning ? "Generating…" : `Generate Return Outward (${selected.size})`}
          </button>
        </div>
      </div>

      {flash && (
        <p className={`text-sm ${flash.type === "success" ? "text-green-700" : "text-red-600"}`}>
          {flash.msg}
        </p>
      )}

      {/* Row detail view panel */}
      {selectedRow && (
        <div className="action-panel-shell">
          <div className="action-panel-header">
            <div className="action-panel-title">
              {`Record Details${selectedRow.entry_detail?.exam_name ? " — " + selectedRow.entry_detail.exam_name : ""}`}
            </div>
            <button type="button" onClick={() => setSelectedRow(null)} aria-label="Close"
              className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700">✕</button>
          </div>
          <div className="action-panel-body">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-3 lg:grid-cols-5">
              {[
                ["Outward No.",      selectedRow._outward?.outward_no || "—"],
                ["Admin Remark",     selectedRow._outward?.remarks || "—"],
                ["Dummy No.",        selectedRow.entry_detail?.dummy_number || "—"],
                ["Exam",             selectedRow.entry_detail?.exam_name || "—"],
                ["Examiner",         selectedRow.entry_detail?.examiner_name || "—"],
                ["Total Sheets",     selectedRow.entry_detail?.total_answer_sheet || "—"],
                ["Entry Remark",     selectedRow.entry_detail?.remark || "—"],
                ["Status",           <ReceiverStatusBadge key="st" d={selectedRow} />],
                ["Work Status",      selectedRow.work_status || "—"],
                ["Return Outward No.", selectedRow.return_outward_no || "—"],
                ["Received By",      selectedRow.received_by_name || "—"],
                ["Received Date",    selectedRow.received_date ? fmtDate(selectedRow.received_date) : "—"],
                ["Return Remark",    selectedRow.return_remark || "—"],
                ["Returned By",      selectedRow.returned_by_name || "—"],
                ["Returned Date",    selectedRow.returned_date ? fmtDate(selectedRow.returned_date) : "—"],
                ["Final Status",     selectedRow.final_receive_status || "—"],
                ["Final Remark",     selectedRow.final_receive_remark || "—"],
              ].map(([label, val]) => (
                <div key={label}>
                  <dt className="text-xs font-medium text-slate-500">{label}</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{val}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 border-t border-slate-200 pt-3">
              <button type="button" onClick={() => setSelectedRow(null)} className="reset-button-compact">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={receivableIds.size > 0 && selected.size === receivableIds.size}
                  onChange={toggleAll}
                  title="Select all receivable"
                />
              </th>
              {["Outward No.", "Admin Remark", "Dummy No.", "Exam", "Examiner", "Sheets",
                "Entry Remark", "Status", "Work Status", "Return Outward No.", "Received By",
                "Received Date", "Return Remark", "Returned By", "Returned Date", "Final Status",
                "Final Remark", "Action"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((d) => {
              const canSelect =
                d.receive_status === "Received" &&
                d.return_status !== "Returned" &&
                d.work_status === "Done";
              return (
                <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedRow(d)}>
                  <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                    {canSelect ? (
                      <input type="checkbox" className="rounded" checked={selected.has(d.id)} onChange={() => toggleRow(d.id)} />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-indigo-700">{d._outward?.outward_no || "—"}</td>
                  <td className="px-4 py-3 max-w-[140px] text-xs text-blue-700">{d._outward?.remarks || "—"}</td>
                  <td className="px-4 py-3">{d.entry_detail?.dummy_number}</td>
                  <td className="px-4 py-3 font-medium">{d.entry_detail?.exam_name}</td>
                  <td className="px-4 py-3">{d.entry_detail?.examiner_name}</td>
                  <td className="px-4 py-3">{d.entry_detail?.total_answer_sheet}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{d.entry_detail?.remark || "—"}</td>
                  <td className="px-4 py-3"><ReceiverStatusBadge d={d} /></td>
                  <td className="px-4 py-3">
                    {d.work_status === "Done" ? (
                      <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">🟢 Done</span>
                    ) : d.work_status === "InProgress" ? (
                      <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">🔵 In Progress</span>
                    ) : (
                      <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-purple-700">{d.return_outward_no || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{d.received_by_name || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{d.received_date ? fmtDate(d.received_date) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {canSelect ? (
                      <input
                        type="text"
                        className="w-36 rounded border border-slate-300 px-2 py-1 text-xs"
                        placeholder="Return remark"
                        value={returnRemark[d.id] || ""}
                        onChange={(e) => { e.stopPropagation(); const val = e.target.value; setReturnRemark((r) => ({ ...r, [d.id]: val })); }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      d.return_remark || "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{d.returned_by_name || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{d.returned_date ? fmtDate(d.returned_date) : "—"}</td>
                  <td className="px-4 py-3">
                    {d.final_receive_status === "Received" ? (
                      <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Received Back</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{d.final_receive_remark || "—"}</td>
                  <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                    <button
                      type="button"
                      title="View Details"
                      onClick={() => setSelectedRow(d)}
                      className="w-5 h-5 flex items-center justify-center icon-edit-button shadow-md rounded"
                    >
                      <FaEdit size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={19} className="px-4 py-8 text-center text-sm text-slate-400">
                  No records match the selected filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS = ["Receive", "All Records"];

const AsstReceiver = ({ onToggleSidebar }) => {
  const [activeTab, setActiveTab] = useState("Receive");

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 flex w-full flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-800 px-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"
            title="Toggle sidebar"
          >
            ☰
          </button>
        )}
        <span className="text-sm font-semibold text-slate-700">Assessment – Receiver Panel</span>
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                activeTab === tab ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-2 py-4">
        {activeTab === "Receive"     && <ReceiveTab />}
        {activeTab === "All Records" && <AllRecordsTab />}
      </div>
    </div>
  );
};

export default AsstReceiver;
