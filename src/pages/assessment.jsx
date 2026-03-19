import React, { useCallback, useEffect, useRef, useState } from "react";
import PageTopbar from "../components/PageTopbar";
import API from "../api/axiosInstance";
import {
  createAssessmentEntry,
  deleteAssessmentEntry,
  getAllAssessmentEntries,
  getAssessmentEntries,
  getAssessmentOutwards,
  getMyAssessmentOutwards,
  getPendingAssessmentEntries,
  generateAssessmentOutward,
  receiveAssessmentEntry,
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
    case "PartiallyReceived":
      return "bg-orange-100 text-orange-800";
    case "Received":
      return "bg-green-100 text-green-800";
    case "Completed":
      return "bg-green-100 text-green-800";
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

const ACTIONS = ["Entry", "Pending", "Outward", "Receiver"];

const DEFAULT_ENTRY_FORM = {
  entry_date: today(),
  exam_name: "",
  examiner_name: "",
  dummy_number: "",
  total_answer_sheet: "",
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
              "Outward No.",
              "Status",
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
              <td className="px-4 py-3 font-mono text-xs">
                {e.outward_no || "—"}
              </td>
              <td className="px-4 py-3">
                <Badge label={e.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
                      "Receive Status",
                      "Received By",
                      "Received Date",
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
                      <td className="px-3 py-2">
                        <Badge label={d.receive_status} />
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {d.received_by_name || "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {d.received_date ? fmtDate(d.received_date) : "—"}
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
  const [receiving, setReceiving] = useState(null);
  const [flash, setFlash] = useState({});

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
                  <Badge label={d.receive_status} />
                  {d.receive_status === "Pending" ? (
                    <>
                      <input
                        type="text"
                        className="w-44 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                        placeholder="Remark (optional)"
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
                        {receiving === d.id ? "Saving…" : "Mark Received"}
                      </button>
                    </>
                  ) : (
                    <div className="text-xs text-slate-500">
                      {d.receive_remark && (
                        <span>Remark: {d.receive_remark}</span>
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
  onToggleSidebar,
  onToggleChatbox,
}) => {
  const [selectedAction, setSelectedAction] = useState(ACTIONS[0]);
  const [entryRefresh, setEntryRefresh] = useState(0);

  return (
    <div className="flex h-full flex-col">
      <PageTopbar
        title="Assessment System"
        actions={ACTIONS}
        selected={selectedAction}
        onSelect={setSelectedAction}
        onToggleSidebar={onToggleSidebar}
        onToggleChatbox={onToggleChatbox}
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

        {selectedAction === "Pending" && <PendingTab rights={rights} />}

        {selectedAction === "Outward" && <OutwardTab rights={rights} />}

        {selectedAction === "Receiver" && <ReceiverTab />}
      </div>
    </div>
  );
};

export default AssessmentPage;
