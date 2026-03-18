import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaEdit, FaTrash } from "react-icons/fa";
import {
  createCctvCopyCase,
  deleteCctvCopyCase,
  getCctvCopyCases,
  getOutward,
  updateCctvCopyCase,
} from "../services/cctvservice";
import { printElement } from "../utils/print";

const EMPTY_FORM = {
  college_name: "",
  course: "",
  semester: "",
  dvd_no: "",
  report_no: "",
  no_of_student: "",
  remark: "",
};

const toResultsArray = (payload) =>
  Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];

export default function CCTVREPORT({ rights = { can_view: true, can_create: true, can_edit: true, can_delete: true } }) {
  const [outwards, setOutwards] = useState([]);
  const [selectedOutwardId, setSelectedOutwardId] = useState("");
  const [copyCases, setCopyCases] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loadingOutwards, setLoadingOutwards] = useState(false);
  const [loadingCases, setLoadingCases] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const printRef = useRef(null);

  const selectedOutward = useMemo(
    () => outwards.find((row) => String(row.id) === String(selectedOutwardId)) || null,
    [outwards, selectedOutwardId]
  );

  const totalStudents = useMemo(
    () => copyCases.reduce((sum, row) => sum + Number(row.no_of_student || 0), 0),
    [copyCases]
  );

  const hydrateFormFromOutward = (row) => {
    if (!row) {
      setForm(EMPTY_FORM);
      return;
    }
    setForm({
      college_name: row.college_name || "",
      course: row.course || "",
      semester: row.semester || "",
      dvd_no: row.cc_start_label || "",
      report_no: row.rep_nos || "",
      no_of_student: "",
      remark: row.note || "",
    });
  };

  const loadOutwards = async () => {
    setLoadingOutwards(true);
    setStatus("");
    try {
      const res = await getOutward();
      const rows = toResultsArray(res?.data);
      const caseFoundRows = rows.filter((row) => !!row.case_found);
      setOutwards(caseFoundRows);

      if (!caseFoundRows.length) {
        setSelectedOutwardId("");
        setCopyCases([]);
        setStatus("No outward records found where Case Found is Yes.");
      } else if (!caseFoundRows.some((row) => String(row.id) === String(selectedOutwardId))) {
        setSelectedOutwardId(String(caseFoundRows[0].id));
      }
    } catch (err) {
      setOutwards([]);
      setStatus(err?.response?.data?.detail || err.message || "Failed to load outward records.");
    } finally {
      setLoadingOutwards(false);
    }
  };

  const loadCopyCases = async (outwardId) => {
    if (!outwardId) {
      setCopyCases([]);
      return;
    }
    setLoadingCases(true);
    try {
      const res = await getCctvCopyCases({ outward: outwardId });
      setCopyCases(toResultsArray(res?.data));
    } catch (err) {
      setCopyCases([]);
      setStatus(err?.response?.data?.detail || err.message || "Failed to load copy cases.");
    } finally {
      setLoadingCases(false);
    }
  };

  useEffect(() => {
    if (!rights.can_view) return;
    loadOutwards();
  }, [rights.can_view]);

  useEffect(() => {
    if (!selectedOutwardId) {
      setCopyCases([]);
      return;
    }
    loadCopyCases(selectedOutwardId);
  }, [selectedOutwardId]);

  useEffect(() => {
    if (!editingId) {
      hydrateFormFromOutward(selectedOutward);
    }
  }, [selectedOutward, editingId]);

  const resetForm = () => {
    setEditingId(null);
    hydrateFormFromOutward(selectedOutward);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOutwardId) {
      setStatus("Select outward record first.");
      return;
    }
    if (!selectedOutward?.case_found) {
      setStatus("Copy case report is required only when Case Found is Yes.");
      return;
    }

    setSaving(true);
    setStatus("");

    const payload = {
      outward: Number(selectedOutwardId),
      college_name: String(form.college_name || "").trim(),
      course: String(form.course || "").trim(),
      semester: String(form.semester || "").trim(),
      dvd_no: String(form.dvd_no || "").trim(),
      report_no: String(form.report_no || "").trim(),
      no_of_student: Number(form.no_of_student || 0),
      remark: String(form.remark || "").trim(),
    };

    try {
      if (editingId) {
        await updateCctvCopyCase(editingId, payload);
      } else {
        await createCctvCopyCase(payload);
      }
      await loadCopyCases(selectedOutwardId);
      resetForm();
    } catch (err) {
      setStatus(err?.response?.data?.detail || err.message || "Failed to save copy case row.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (row) => {
    setEditingId(row.id);
    setForm({
      college_name: row.college_name || "",
      course: row.course || "",
      semester: row.semester || "",
      dvd_no: row.dvd_no || "",
      report_no: row.report_no || "",
      no_of_student: row.no_of_student ?? "",
      remark: row.remark || "",
    });
  };

  const handleDelete = async (rowId) => {
    if (!rights.can_delete) {
      setStatus("You do not have permission to delete.");
      return;
    }
    if (!window.confirm("Delete this copy-case row?")) return;

    try {
      await deleteCctvCopyCase(rowId);
      await loadCopyCases(selectedOutwardId);
    } catch (err) {
      setStatus(err?.response?.data?.detail || err.message || "Failed to delete row.");
    }
  };

  const handleGenerateReport = () => {
    if (!selectedOutward) {
      setStatus("Select outward record first.");
      return;
    }
    if (!selectedOutward.case_found) {
      setStatus("Copy case report is required only when Case Found is Yes.");
      return;
    }
    if (!copyCases.length) {
      setStatus("No copy-case rows found for selected outward.");
      return;
    }
    printElement(printRef.current, { orientation: "portrait", pageSize: "A4", marginMm: 10 });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[320px] flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Outward Record
            </label>
            <select
              value={selectedOutwardId}
              onChange={(e) => {
                setSelectedOutwardId(e.target.value);
                setEditingId(null);
              }}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select Record No</option>
              {outwards.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.cctv_record_no || row.outward_no || `Record ${row.id}`} | {row.college_name || "-"}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Only records with Case Found = Yes are listed.</p>
          </div>

          <button
            type="button"
            className="refresh-icon-button"
            onClick={loadOutwards}
            disabled={loadingOutwards}
            title="Reload"
            aria-label="Reload"
          >
            <span className="refresh-symbol" aria-hidden="true">↻</span>
          </button>

          <button
            type="button"
            className="save-button"
            onClick={handleGenerateReport}
            disabled={!selectedOutward || !selectedOutward.case_found || !copyCases.length}
          >
            Generate Report
          </button>
        </div>

        {selectedOutward && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm text-slate-700">
            <div><span className="font-semibold">Outward No:</span> {selectedOutward.outward_no || "-"}</div>
            <div><span className="font-semibold">Date:</span> {selectedOutward.outward_date || "-"}</div>
            <div><span className="font-semibold">Exam On:</span> {selectedOutward.exam_on || "-"}</div>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <h3 className="font-semibold mb-3">Copy Case Entry</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">College Name</label>
              <input
                type="text"
                value={form.college_name}
                onChange={(e) => setForm({ ...form, college_name: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Course</label>
              <input
                type="text"
                value={form.course}
                onChange={(e) => setForm({ ...form, course: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Semester</label>
              <input
                type="text"
                value={form.semester}
                onChange={(e) => setForm({ ...form, semester: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">DVD No</label>
              <input
                type="text"
                value={form.dvd_no}
                onChange={(e) => setForm({ ...form, dvd_no: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Report No</label>
              <input
                type="text"
                value={form.report_no}
                onChange={(e) => setForm({ ...form, report_no: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Students</label>
              <input
                type="number"
                min="0"
                value={form.no_of_student}
                onChange={(e) => setForm({ ...form, no_of_student: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-9">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Remark</label>
              <input
                type="text"
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-3 flex items-end gap-2">
              <button type="submit" className="save-button w-full" disabled={saving || !rights.can_create}>
                {editingId ? "Update" : "Add"}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} className="reset-button w-full">
                  Cancel
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <h3 className="font-semibold mb-3">Copy Case Rows</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
              <tr>
                <th className="px-3 py-2 text-left">College Name</th>
                <th className="px-3 py-2 text-left">Course</th>
                <th className="px-3 py-2 text-left">Semester</th>
                <th className="px-3 py-2 text-left">DVD No</th>
                <th className="px-3 py-2 text-left">Report No</th>
                <th className="px-3 py-2 text-left">No of Student</th>
                <th className="px-3 py-2 text-left">Remark</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingCases && (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-slate-500">Loading...</td>
                </tr>
              )}
              {!loadingCases && copyCases.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">No copy-case rows for selected outward.</td>
                </tr>
              )}
              {!loadingCases &&
                copyCases.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2">{row.college_name || "-"}</td>
                    <td className="px-3 py-2">{row.course || "-"}</td>
                    <td className="px-3 py-2">{row.semester || "-"}</td>
                    <td className="px-3 py-2">{row.dvd_no || "-"}</td>
                    <td className="px-3 py-2">{row.report_no || "-"}</td>
                    <td className="px-3 py-2">{row.no_of_student ?? 0}</td>
                    <td className="px-3 py-2">{row.remark || "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(row)}
                          className="w-7 h-7 inline-flex items-center justify-center rounded icon-edit-button"
                          title="Edit"
                          aria-label="Edit copy case"
                          disabled={!rights.can_edit}
                        >
                          <FaEdit size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row.id)}
                          className="w-7 h-7 inline-flex items-center justify-center rounded icon-delete-button"
                          title="Delete"
                          aria-label="Delete copy case"
                          disabled={!rights.can_delete}
                        >
                          <FaTrash size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td className="px-3 py-2" colSpan={5}>Total Students</td>
                <td className="px-3 py-2">{totalStudents}</td>
                <td className="px-3 py-2" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {status && <div className="text-sm text-red-600">{status}</div>}

      <div style={{ display: "none" }}>
        <div ref={printRef} className="print-area">
          <div style={{ fontSize: "14pt", fontWeight: 700, marginBottom: "8px" }}>CCTV Copy Case Report</div>
          <div style={{ marginBottom: "4px" }}><b>Record No:</b> {selectedOutward?.cctv_record_no || "-"}</div>
          <div style={{ marginBottom: "4px" }}><b>Outward No:</b> {selectedOutward?.outward_no || "-"}</div>
          <div style={{ marginBottom: "4px" }}><b>Date:</b> {selectedOutward?.outward_date || "-"}</div>
          <div style={{ marginBottom: "4px" }}><b>Exam On:</b> {selectedOutward?.exam_on || "-"}</div>
          <div style={{ marginBottom: "10px" }}><b>Primary College:</b> {selectedOutward?.college_name || "-"}</div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #555", padding: "6px" }}>No.</th>
                <th style={{ border: "1px solid #555", padding: "6px" }}>College Name</th>
                <th style={{ border: "1px solid #555", padding: "6px" }}>Course</th>
                <th style={{ border: "1px solid #555", padding: "6px" }}>Semester</th>
                <th style={{ border: "1px solid #555", padding: "6px" }}>DVD No</th>
                <th style={{ border: "1px solid #555", padding: "6px" }}>Report No</th>
                <th style={{ border: "1px solid #555", padding: "6px" }}>No of Student</th>
                <th style={{ border: "1px solid #555", padding: "6px" }}>Remark</th>
              </tr>
            </thead>
            <tbody>
              {copyCases.map((row, idx) => (
                <tr key={row.id || idx}>
                  <td style={{ border: "1px solid #777", padding: "5px" }}>{idx + 1}</td>
                  <td style={{ border: "1px solid #777", padding: "5px" }}>{row.college_name || "-"}</td>
                  <td style={{ border: "1px solid #777", padding: "5px" }}>{row.course || "-"}</td>
                  <td style={{ border: "1px solid #777", padding: "5px" }}>{row.semester || "-"}</td>
                  <td style={{ border: "1px solid #777", padding: "5px" }}>{row.dvd_no || "-"}</td>
                  <td style={{ border: "1px solid #777", padding: "5px" }}>{row.report_no || "-"}</td>
                  <td style={{ border: "1px solid #777", padding: "5px" }}>{row.no_of_student ?? 0}</td>
                  <td style={{ border: "1px solid #777", padding: "5px" }}>{row.remark || "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ border: "1px solid #555", padding: "6px", fontWeight: 700 }} colSpan={6}>Total Students</td>
                <td style={{ border: "1px solid #555", padding: "6px", fontWeight: 700 }}>{totalStudents}</td>
                <td style={{ border: "1px solid #555", padding: "6px" }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
