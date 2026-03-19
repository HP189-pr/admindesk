import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageTopbar from "../components/PageTopbar";
import API from "../api/axiosInstance";
import AsstReceiver from "./asst_receiver";
import {
  createAssessmentEntry,
  deleteAssessmentEntry,
  finalReceiveAssessmentEntry,
  generateReturnAssessmentOutward,
  getAllAssessmentEntries,
  getAssessmentEntries,
  getAssessmentOutwards,
  getMyAssessmentOutwards,
  getPendingAssessmentEntries,
  generateAssessmentOutward,
  receiveAssessmentEntry,
  returnAssessmentEntry,
} from "../services/assessmentService";

// ─── helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
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

const CONTROLLER_ACTIONS = ["Entry", "Pending", "Outward", "Receiver"];
const ENTRY_USER_ACTIONS = ["Entry"];
const RECEIVER_ACTIONS = ["Receiver"];

const DEFAULT_ENTRY_FORM = {
  entry_date: today(),
  exam_name: "",
  examiner_name: "",
  dummy_number: "",
  total_answer_sheet: "",
  remark: "",
};

const EMPTY_GENERATE_FORM = { receiver_user: "", remarks: "" };

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

// ─── My Entries Table ─────────────────────────────────────────────────────────

const MyEntriesTable = ({ refresh, rights }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(null);
  const [finalRemark, setFinalRemark] = useState({});
  const [flash, setFlash] = useState(null);

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
              <tr key={e.id} className="hover:bg-slate-50">
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
                <td className="px-4 py-3">
                  {e.status === "Returned" && e.detail_id ? (
                    <>
                      <input
                        type="text"
                        placeholder="Final receive remark"
                        className="w-40 rounded border border-slate-300 px-2 py-1 text-xs"
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
                          handleFinalReceive(e.detail_id, finalRemark[e.detail_id])
                        }
                        disabled={finalizing === e.detail_id}
                        className="ml-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {finalizing === e.detail_id ? "Receiving…" : "Receive Back"}
                      </button>
                    </>
                  ) : e.status === "Completed" ? (
                    <div className="text-xs text-emerald-700">
                      ✔ Completed
                      {e.final_receive_remark && (
                        <div className="text-slate-500">{e.final_receive_remark}</div>
                      )}
                    </div>
                  ) : (
                    "—"
                  )}
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
      )}
    </div>
  );
};

// ─── Outward List Tab ─────────────────────────────────────────────────────────

const OutwardTab = ({ rights }) => {
  const [outwards, setOutwards] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    load();
  }, [load]);

  if (loading)
    return (
      <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
    );
  if (!outwards.length)
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No outward records found.
      </p>
    );

  return (
    <div className="space-y-3">
      {outwards.map((o) => (
        <div
          key={o.id}
          className="rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          {/* Header row */}
          <div
            className="flex cursor-pointer items-center justify-between px-5 py-4"
            onClick={() =>
              setExpanded((prev) => (prev === o.id ? null : o.id))
            }
          >
            <div className="flex items-center gap-4">
              <span className="font-mono text-sm font-semibold text-indigo-700">
                {o.outward_no}
              </span>
              <span className="text-sm text-slate-500">
                {fmtDate(o.outward_date)}
              </span>
              <Badge label={o.status} />
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span>
                Receiver:{" "}
                <span className="font-medium text-slate-700">
                  {o.receiver_name || "—"}
                </span>
              </span>
              <span>
                {o.received_count}/{o.total_entries} received
              </span>
              <span>{o.returned_count || 0} returned</span>
              <span>{o.final_received_count || 0} final received</span>
              <span className="text-slate-400">
                {expanded === o.id ? "▲" : "▼"}
              </span>
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
                      "Dummy No.",
                      "Exam",
                      "Examiner",
                      "Sheets",
                      "Entry Remark",
                      "Receive Status",
                      "Return Status",
                      "Return Outward No.",
                      "Completed",
                      "Received By",
                      "Received Date",
                      "Return Remark",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(o.details || []).map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        {d.entry_detail?.dummy_number}
                      </td>
                      <td className="px-3 py-2">
                        {d.entry_detail?.exam_name}
                      </td>
                      <td className="px-3 py-2">
                        {d.entry_detail?.examiner_name}
                      </td>
                      <td className="px-3 py-2">
                        {d.entry_detail?.total_answer_sheet}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {d.entry_detail?.remark || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge label={d.receive_status} />
                      </td>
                      <td className="px-3 py-2">
                        <Badge label={d.return_status || "Pending"} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">
                        {d.return_outward_no || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {d.entry_detail?.status === "Completed" ? (
                          <Badge label="Completed" />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {d.received_by_name || "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {d.received_date ? fmtDate(d.received_date) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {d.return_remark || "—"}
                      </td>
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

// ─── Receiver Tab ─────────────────────────────────────────────────────────────

const ReceiverTab = () => {
  const [outwards, setOutwards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [remark, setRemark] = useState({});
  const [returnRemark, setReturnRemark] = useState({});
  const [receiving, setReceiving] = useState(null);
  const [returning, setReturning] = useState(null);
  const [batchReturning, setBatchReturning] = useState(false);
  const [selectedReturns, setSelectedReturns] = useState({});
  const [flash, setFlash] = useState({});
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

  const handleReceive = async (detailId) => {
    setReceiving(detailId);
    setFlash((f) => ({ ...f, [detailId]: null }));
    try {
      await receiveAssessmentEntry({
        detail_id: detailId,
        remark: remark[detailId] || "",
      });
      setFlash((f) => ({
        ...f,
        [detailId]: { type: "success", msg: "Marked as received." },
      }));
      load();
    } catch (err) {
      const detail =
        err?.response?.data?.detail || "Failed to mark received.";
      setFlash((f) => ({
        ...f,
        [detailId]: { type: "error", msg: detail },
      }));
    } finally {
      setReceiving(null);
    }
  };

  const handleReturn = async (detailId) => {
    setReturning(detailId);
    setFlash((f) => ({ ...f, [detailId]: null }));
    try {
      await returnAssessmentEntry({
        detail_id: detailId,
        remark: returnRemark[detailId] || "",
      });
      setFlash((f) => ({
        ...f,
        [detailId]: { type: "success", msg: "Returned successfully." },
      }));
      load();
    } catch (err) {
      const detail = err?.response?.data?.detail || "Failed to return entry.";
      setFlash((f) => ({
        ...f,
        [detailId]: { type: "error", msg: detail },
      }));
    } finally {
      setReturning(null);
    }
  };

  const toggleReturnSelection = (outwardId, detailId) => {
    setSelectedReturns((prev) => {
      const key = String(outwardId);
      const current = new Set(prev[key] || []);
      if (current.has(detailId)) current.delete(detailId);
      else current.add(detailId);
      return {
        ...prev,
        [key]: current,
      };
    });
  };

  const handleGenerateReturnOutward = async (outwardId) => {
    const key = String(outwardId);
    const flashKey = `outward_${key}`;
    const selected = Array.from(selectedReturns[key] || []);
    if (!selected.length) {
      return;
    }

    const payload = selected.map((detailId) => ({
      detail_id: detailId,
      remark: returnRemark[detailId] || "",
    }));

    setBatchReturning(true);
    try {
      const res = await generateReturnAssessmentOutward(payload);
      const no = res?.data?.return_outward_no || "";
      const returnCount = res?.data?.count || selected.length;
      const returnDate = new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      setReturnSummary({ no, count: returnCount, date: returnDate });
      setFlash((f) => ({
        ...f,
        [flashKey]: {
          type: "success",
          msg: no
            ? `Return outward generated: ${no}`
            : "Return outward generated successfully.",
        },
      }));
      setSelectedReturns((prev) => ({ ...prev, [key]: new Set() }));
      await load();
    } catch (err) {
      const detail =
        err?.response?.data?.detail || "Failed to generate return outward.";
      setFlash((f) => ({
        ...f,
        [flashKey]: { type: "error", msg: detail },
      }));
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
      {returnSummary && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="mb-1 text-sm font-semibold text-purple-800">
                ✔ Return Outward Generated
              </h4>
              <div className="flex flex-wrap gap-4 text-sm text-purple-700">
                <span>
                  Return No:{" "}
                  <strong className="font-mono">{returnSummary.no || "—"}</strong>
                </span>
                <span>
                  Items Returned: <strong>{returnSummary.count}</strong>
                </span>
                <span>
                  Date: <strong>{returnSummary.date}</strong>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReturnSummary(null)}
              className="ml-4 text-xs text-purple-400 hover:text-purple-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      {outwards.map((o) => (
        <div
          key={o.id}
          className="rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div
            className="flex cursor-pointer items-center justify-between px-5 py-4"
            onClick={() =>
              setExpanded((prev) => (prev === o.id ? null : o.id))
            }
          >
            <div className="flex items-center gap-4">
              <span className="font-mono text-sm font-semibold text-indigo-700">
                {o.outward_no}
              </span>
              <span className="text-sm text-slate-500">
                {fmtDate(o.outward_date)}
              </span>
              <Badge label={o.status} />
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span>
                {o.received_count}/{o.total_entries} received
              </span>
              <span className="text-slate-400">
                {expanded === o.id ? "▲" : "▼"}
              </span>
            </div>
          </div>

          {expanded === o.id && (
            <div className="border-t border-slate-100 px-5 pb-4 pt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-4 py-3">
                <p className="text-xs text-slate-600">
                  Select received items to generate one return outward number.
                </p>
                <button
                  type="button"
                  onClick={() => handleGenerateReturnOutward(o.id)}
                  disabled={batchReturning || !(selectedReturns[String(o.id)]?.size > 0)}
                  className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {batchReturning
                    ? "Generating…"
                    : `Generate Return Outward (${selectedReturns[String(o.id)]?.size || 0})`}
                </button>
              </div>

              {flash[`outward_${String(o.id)}`] && (
                <p
                  className={`text-xs ${
                    flash[`outward_${String(o.id)}`].type === "success"
                      ? "text-green-700"
                      : "text-red-600"
                  }`}
                >
                  {flash[`outward_${String(o.id)}`].msg}
                </p>
              )}

              {(o.details || []).map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm font-medium text-slate-800">
                      {d.entry_detail?.exam_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Dummy: {d.entry_detail?.dummy_number} &bull; Sheets:{" "}
                      {d.entry_detail?.total_answer_sheet} &bull; Examiner:{" "}
                      {d.entry_detail?.examiner_name}
                    </p>
                  </div>
                  {d.receive_status === "Received" && d.return_status !== "Returned" ? (
                    <input
                      type="checkbox"
                      checked={!!selectedReturns[String(o.id)]?.has(d.id)}
                      onChange={() => toggleReturnSelection(o.id, d.id)}
                      className="rounded"
                      title="Select for return outward"
                    />
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                  <Badge label={d.receive_status} />
                  <Badge label={d.return_status || "Pending"} />
                  {d.return_outward_no ? (
                    <span className="font-mono text-xs text-purple-700">
                      {d.return_outward_no}
                    </span>
                  ) : null}
                  {d.receive_status === "Pending" ? (
                    <>
                      <input
                        type="text"
                        className="w-44 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                        placeholder="Receive remark"
                        value={remark[d.id] || ""}
                        onChange={(e) =>
                          setRemark((r) => ({
                            ...r,
                            [d.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        disabled={receiving === d.id}
                        onClick={() => handleReceive(d.id)}
                        className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {receiving === d.id ? "Saving…" : "Receive"}
                      </button>
                    </>
                  ) : d.receive_status === "Received" && d.return_status !== "Returned" ? (
                    <>
                      <input
                        type="text"
                        className="w-44 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                        placeholder="Return remark"
                        value={returnRemark[d.id] || ""}
                        onChange={(e) =>
                          setReturnRemark((r) => ({
                            ...r,
                            [d.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        disabled={returning === d.id}
                        onClick={() => handleReturn(d.id)}
                        className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                      >
                        {returning === d.id ? "Returning…" : "Return"}
                      </button>
                    </>
                  ) : (
                    <div className="text-xs text-slate-500">
                      {d.return_status === "Returned" && <span>Returned ✔</span>}
                      {d.receive_remark && (
                        <span className="ml-2">Receive: {d.receive_remark}</span>
                      )}
                      {d.return_remark && (
                        <span className="ml-2">Return: {d.return_remark}</span>
                      )}
                    </div>
                  )}
                  {flash[d.id] && (
                    <p
                      className={`w-full text-xs ${
                        flash[d.id].type === "success"
                          ? "text-green-700"
                          : "text-red-600"
                      }`}
                    >
                      {flash[d.id].msg}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
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
