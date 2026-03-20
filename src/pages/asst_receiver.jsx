// src/pages/asst_receiver.jsx
/**
 * Assessment Receiver Page
 * Dedicated UI for the Receiver (D-role) user.
 *
 * Tab 1 – Receive   : pending items to receive + batch return outward generation
 * Tab 2 – All Records : flat table of all assigned entries, select-based return
 *                       outward + PDF download
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  generateReturnAssessmentOutward,
  getMyAssessmentOutwards,
  receiveAssessmentEntry,
} from "../services/assessmentService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    // Avoid UTC-midnight offset for date-only strings
    const dt =
      typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
        ? new Date(d + "T12:00:00")
        : new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    const day = String(dt.getDate()).padStart(2, "0");
    const month = String(dt.getMonth() + 1).padStart(2, "0");
    const year = dt.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return String(d);
  }
};

const today = () =>
  new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const statusColor = (s) => {
  switch (s) {
    case "Pending":
      return "bg-yellow-100 text-yellow-800";
    case "Outward":
      return "bg-blue-100 text-blue-800";
    case "InProgress":
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
    {label || "—"}
  </span>
);

/**
 * Single composite status label from the RECEIVER's perspective:
 *  - "Pending"       = not yet received by receiver
 *  - "In Hand"       = receiver collected it (receive_status=Received)
 *  - "Returned"      = receiver sent it back
 *  - "Received Back" = entry user / admin confirmed receipt (entry.status=Completed)
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

// ─── PDF generator ────────────────────────────────────────────────────────────

const generateReturnOutwardPdf = ({ returnNo, receiverName, items, outwardNo }) => {
  const doc = new jsPDF();

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Assessment Return Outward", 14, 18);

  // Meta
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Return Outward No: ${returnNo || "—"}`, 14, 28);
  doc.text(`Outward Ref: ${outwardNo || "—"}`, 14, 35);
  doc.text(`Receiver: ${receiverName || "—"}`, 14, 42);
  doc.text(`Date: ${today()}`, 14, 49);

  // Table
  autoTable(doc, {
    startY: 56,
    head: [["#", "Dummy No.", "Exam", "Examiner", "Sheets", "Return Remark"]],
    body: items.map((item, i) => [
      i + 1,
      item.dummy_number ?? "—",
      item.exam_name ?? "—",
      item.examiner_name ?? "—",
      item.total_answer_sheet ?? "—",
      item.return_remark || "—",
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [79, 70, 229] },
    alternateRowStyles: { fillColor: [248, 248, 248] },
  });

  doc.save(`Return_Outward_${returnNo || "draft"}.pdf`);
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
  const [returnSummary, setReturnSummary] = useState(null); // last generated

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

  useEffect(() => {
    load();
  }, [load]);

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
      setFlashMsg(
        detailId,
        "error",
        err?.response?.data?.detail || "Failed to mark received.",
      );
    } finally {
      setReceiving(null);
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
        date: today(),
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
      setFlashMsg(
        flashKey,
        "success",
        returnNo
          ? `Return outward generated: ${returnNo}`
          : "Return outward generated.",
      );
      setSelected((prev) => ({ ...prev, [key]: new Set() }));
      await load();
    } catch (err) {
      setFlashMsg(
        flashKey,
        "error",
        err?.response?.data?.detail || "Failed to generate return outward.",
      );
    } finally {
      setBatchReturning(false);
    }
  };

  if (loading)
    return (
      <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
    );
  if (!outwards.length)
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No outwards assigned to you.
      </p>
    );

  return (
    <div className="space-y-3">
      {/* Return summary banner */}
      {returnSummary && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-sm font-semibold text-purple-800">
                ✔ Return Outward Generated
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-purple-700">
                <span>
                  Return No:{" "}
                  <strong className="font-mono">
                    {returnSummary.returnNo || "—"}
                  </strong>
                </span>
                <span>
                  Items: <strong>{returnSummary.count}</strong>
                </span>
                <span>
                  Date: <strong>{returnSummary.date}</strong>
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  generateReturnOutwardPdf({
                    returnNo: returnSummary.returnNo,
                    outwardNo: returnSummary.outwardNo,
                    receiverName: returnSummary.receiverName,
                    items: returnSummary.items,
                  })
                }
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
              >
                ⬇ Download PDF
              </button>
              <button
                type="button"
                onClick={() => setReturnSummary(null)}
                className="text-xs text-purple-400 hover:text-purple-600"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {outwards.map((o) => (
        <div
          key={o.id}
          className="rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          {/* Accordion header */}
          <div
            className="flex cursor-pointer items-center justify-between px-5 py-4"
            onClick={() =>
              setExpanded((p) => (p === o.id ? null : o.id))
            }
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-indigo-700">
                {o.outward_no}
              </span>
              <span className="text-xs text-slate-400">
                {fmtDate(o.outward_date)}
              </span>
              <Badge label={o.status} />
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>
                {o.received_count}/{o.total_entries} received
              </span>
              <span>{o.returned_count || 0} returned</span>
              <span>{expanded === o.id ? "▲" : "▼"}</span>
            </div>
          </div>

          {/* Expanded details */}
          {expanded === o.id && (
            <div className="space-y-3 border-t border-slate-100 px-5 pb-4 pt-3">
              {/* Admin remark on this outward */}
              {o.remarks && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2">
                  <span className="text-xs font-semibold text-blue-600">Admin note: </span>
                  <span className="text-xs text-blue-800">{o.remarks}</span>
                </div>
              )}

              {/* Batch return controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-600">
                  Select received items to generate one return outward number.
                </p>
                <button
                  type="button"
                  disabled={
                    batchReturning ||
                    !(selected[String(o.id)]?.size > 0)
                  }
                  onClick={() => handleGenerateReturn(o)}
                  className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {batchReturning
                    ? "Generating…"
                    : `Generate Return Outward (${selected[String(o.id)]?.size || 0})`}
                </button>
              </div>

              {flash[`outward_${o.id}`] && (
                <p
                  className={`text-xs ${flash[`outward_${o.id}`].type === "success" ? "text-green-700" : "text-red-600"}`}
                >
                  {flash[`outward_${o.id}`].msg}
                </p>
              )}

              {(o.details || []).map((d) => {
                const isPending = d.receive_status === "Pending";
                const isReceived = d.receive_status === "Received";
                const isReturned = d.return_status === "Returned";

                return (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
                  >
                    {/* Entry info */}
                    <div className="min-w-[180px] flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        {d.entry_detail?.exam_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        Dummy: {d.entry_detail?.dummy_number} &bull; Sheets:{" "}
                        {d.entry_detail?.total_answer_sheet} &bull; Examiner:{" "}
                        {d.entry_detail?.examiner_name}
                      </p>
                      {d.entry_detail?.remark && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          Entry remark: {d.entry_detail.remark}
                        </p>
                      )}
                    </div>

                    {/* Checkbox for batch return */}
                    {isReceived && !isReturned ? (
                      <input
                        type="checkbox"
                        title="Select for return outward"
                        checked={
                          !!selected[String(o.id)]?.has(d.id)
                        }
                        onChange={() => toggleSelect(o.id, d.id)}
                        className="h-4 w-4 rounded"
                      />
                    ) : (
                      <span className="w-4" />
                    )}

                    {/* Single composite status badge — receiver perspective */}
                    <ReceiverStatusBadge d={d} />

                    {d.return_outward_no && (
                      <span className="font-mono text-xs text-purple-700">
                        {d.return_outward_no}
                      </span>
                    )}

                    {/* Actions based on state */}
                    {isPending && (
                      <>
                        <input
                          type="text"
                          className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                          placeholder="Receive remark"
                          value={receiveRemark[d.id] || ""}
                          onChange={(e) =>
                            setReceiveRemark((r) => ({
                              ...r,
                              [d.id]: e.target.value,
                            }))
                          }
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

                    {/* canReturn: has it, hasn't returned it yet */}
                    {isReceived && (!d.return_status || !isReturned) && (
                      <input
                        type="text"
                        className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                        placeholder="Return remark"
                        value={returnRemark[d.id] || ""}
                        onChange={(e) =>
                          setReturnRemark((r) => ({
                            ...r,
                            [d.id]: e.target.value,
                          }))
                        }
                      />
                    )}

                    {isReturned && (
                      <span className="text-xs text-purple-700">
                        Returned ✔{d.return_remark ? ` — ${d.return_remark}` : ""}
                      </span>
                    )}

                    {d.final_receive_status === "Received" && (
                      <div className="text-xs text-emerald-700">
                        ✔ Received by sender
                        {d.final_received_by_name
                          ? ` (${d.final_received_by_name})`
                          : ""}
                        {d.final_receive_remark && (
                          <div className="text-slate-500">
                            Remark: {d.final_receive_remark}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Per-item flash */}
                    {flash[d.id] && (
                      <p
                        className={`w-full text-xs ${flash[d.id].type === "success" ? "text-green-700" : "text-red-600"}`}
                      >
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
// Shows a flat table of ALL details across ALL assigned outwards.
// Receiver can select any received items (from any outward) and generate
// one batch return outward number in a single operation.

const AllRecordsTab = () => {
  const [outwards, setOutwards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all"); // all | pending | received | returned
  const [selected, setSelected] = useState(new Set()); // Set<detailId>
  const [returnRemark, setReturnRemark] = useState({});
  const [batchReturning, setBatchReturning] = useState(false);
  const [flash, setFlash] = useState(null);
  const [returnSummary, setReturnSummary] = useState(null);

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

  useEffect(() => {
    load();
  }, [load]);

  // Flatten all details across all outwards
  const allRows = outwards.flatMap((o) =>
    (o.details || []).map((d) => ({ ...d, _outward: o }))
  );

  const filtered = allRows.filter((d) => {
    if (filter === "pending") return d.receive_status === "Pending";
    if (filter === "received")
      return d.receive_status === "Received" && d.return_status !== "Returned";
    if (filter === "returned") return d.return_status === "Returned";
    return true;
  });

  const receivableIds = new Set(
    filtered
      .filter(
        (d) =>
          d.receive_status === "Received" && d.return_status !== "Returned"
      )
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

  const toggleAll = () => {
    if (selected.size === receivableIds.size) {
      setSelected(new Set());
    } else {
      setSelected(new Set(receivableIds));
    }
  };

  const handleGenerateReturn = async () => {
    const detailIds = Array.from(selected);
    if (!detailIds.length) return;

    const payload = detailIds.map((did) => ({
      detail_id: did,
      remark: returnRemark[did] || "",
    }));

    setBatchReturning(true);
    setFlash(null);
    try {
      const res = await generateReturnAssessmentOutward(payload);
      const returnNo = res?.data?.return_outward_no || "";
      // Build items for PDF
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
      const receiverName =
        allRows.find((d) => d.id === detailIds[0])?._outward?.receiver_name ||
        "";
      const outwardNo =
        allRows.find((d) => d.id === detailIds[0])?._outward?.outward_no || "";
      setReturnSummary({ returnNo, receiverName, outwardNo, count: res?.data?.count || detailIds.length, date: today(), items });
      setFlash({
        type: "success",
        msg: returnNo
          ? `Return outward generated: ${returnNo}`
          : "Return outward generated.",
      });
      setSelected(new Set());
      await load();
    } catch (err) {
      setFlash({
        type: "error",
        msg:
          err?.response?.data?.detail || "Failed to generate return outward.",
      });
    } finally {
      setBatchReturning(false);
    }
  };

  const FILTERS = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "received", label: "Received" },
    { key: "returned", label: "Returned" },
  ];

  if (loading)
    return (
      <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
    );
  if (!allRows.length)
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No records found.
      </p>
    );

  return (
    <div className="space-y-3">
      {/* Return summary banner */}
      {returnSummary && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-sm font-semibold text-purple-800">
                ✔ Return Outward Generated
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-purple-700">
                <span>
                  Return No:{" "}
                  <strong className="font-mono">
                    {returnSummary.returnNo || "—"}
                  </strong>
                </span>
                <span>
                  Items: <strong>{returnSummary.count}</strong>
                </span>
                <span>
                  Date: <strong>{returnSummary.date}</strong>
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  generateReturnOutwardPdf({
                    returnNo: returnSummary.returnNo,
                    outwardNo: returnSummary.outwardNo,
                    receiverName: returnSummary.receiverName,
                    items: returnSummary.items,
                  })
                }
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
              >
                ⬇ Download PDF
              </button>
              <button
                type="button"
                onClick={() => setReturnSummary(null)}
                className="text-xs text-purple-400 hover:text-purple-600"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cross-outward batch return hint */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-700">
        You can select items from <strong>any outward</strong> and generate one
        return outward number for all of them in a single click.
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Filter pills */}
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                filter === f.key
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Return remark for all selected */}
          {selected.size > 0 && (
            <input
              type="text"
              className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              placeholder="Batch return remark (optional)"
              onChange={(e) => {
                const val = e.target.value;
                setReturnRemark((r) => {
                  const next = { ...r };
                  Array.from(selected).forEach((id) => {
                    next[id] = val;
                  });
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
            {batchReturning
              ? "Generating…"
              : `Generate Return Outward (${selected.size})`}
          </button>
        </div>
      </div>

      {flash && (
        <p
          className={`text-sm ${flash.type === "success" ? "text-green-700" : "text-red-600"}`}
        >
          {flash.msg}
        </p>
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
                  checked={
                    receivableIds.size > 0 &&
                    selected.size === receivableIds.size
                  }
                  onChange={toggleAll}
                  title="Select all receivable"
                />
              </th>
              {[
                "Outward No.",
                "Admin Remark",
                "Dummy No.",
                "Exam",
                "Examiner",
                "Sheets",
                "Entry Remark",
                "Status",
                "Return Outward No.",
                "Received By",
                "Received Date",
                "Return Remark",
                "Returned By",
                "Returned Date",
                "Final Status",
                "Final Remark",
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
            {filtered.map((d) => {
              const canSelect =
                d.receive_status === "Received" &&
                d.return_status !== "Returned";
              return (
                <tr
                  key={d.id}
                  onClick={() => toggleRow(d.id)}
                  className={`${canSelect ? "cursor-pointer hover:bg-slate-50" : ""} ${selected.has(d.id) ? "bg-indigo-50" : ""}`}
                >
                  <td className="px-4 py-3">
                    {canSelect ? (
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selected.has(d.id)}
                        onChange={() => toggleRow(d.id)}
                        onClick={(ev) => ev.stopPropagation()}
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-indigo-700">
                    {d._outward?.outward_no || "—"}
                  </td>
                  <td className="px-4 py-3 max-w-[140px] text-xs text-blue-700">
                    {d._outward?.remarks || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {d.entry_detail?.dummy_number}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {d.entry_detail?.exam_name}
                  </td>
                  <td className="px-4 py-3">
                    {d.entry_detail?.examiner_name}
                  </td>
                  <td className="px-4 py-3">
                    {d.entry_detail?.total_answer_sheet}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {d.entry_detail?.remark || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ReceiverStatusBadge d={d} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-purple-700">
                    {d.return_outward_no || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {d.received_by_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {d.received_date ? fmtDate(d.received_date) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {canSelect ? (
                      <input
                        type="text"
                        className="w-36 rounded border border-slate-300 px-2 py-1 text-xs"
                        placeholder="Return remark"
                        value={returnRemark[d.id] || ""}
                        onChange={(e) => {
                          e.stopPropagation();
                          const val = e.target.value;
                          setReturnRemark((r) => ({ ...r, [d.id]: val }));
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      d.return_remark || "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {d.returned_by_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {d.returned_date ? fmtDate(d.returned_date) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {d.final_receive_status === "Received" ? (
                      <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        Received Back
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {d.final_receive_remark || "—"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={17}
                  className="px-4 py-8 text-center text-sm text-slate-400"
                >
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

        <span className="text-sm font-semibold text-slate-700">
          Assessment – Receiver Panel
        </span>

        {/* Tab buttons */}
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-2 py-4">
        {activeTab === "Receive" && <ReceiveTab />}
        {activeTab === "All Records" && <AllRecordsTab />}
      </div>
    </div>
  );
};

export default AsstReceiver;
