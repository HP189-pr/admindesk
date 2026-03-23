// src/report/assessment_report.jsx
// PDF and Excel export helpers for the Assessment module.
// Imported by src/pages/assessment.jsx to keep that file manageable.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportAssessmentExcel } from "../services/assessmentService";

// ── Date formatter (shared across assessment pages) ─────────────────────────────
export const fmtDate = (d) => {
  if (!d) return "—";
  try {
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

// ── All-entries PDF (portrait) ─────────────────────────────────────────────────
export const generateEntriesPdf = (entries, title = "Assessment Entries") => {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 18);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, 14, 25);
  autoTable(doc, {
    startY: 30,
    head: [["#", "Date", "Exam", "Examiner", "Dummy No.", "Sheets", "Status", "Outward No.", "Return Status", "Returned By", "Return Date", "Sign"]],
    body: entries.map((e, i) => [
      i + 1,
      fmtDate(e.entry_date),
      e.exam_name || "—",
      e.examiner_name || "—",
      e.dummy_number || "—",
      e.total_answer_sheet || "—",
      e.status || "—",
      e.outward_no || "—",
      e.return_status || "—",
      e.returned_by_name || "—",
      e.returned_date ? fmtDate(e.returned_date) : "—",
      "",
    ]),
    styles: { fontSize: 7.5 },
    headStyles: { fillColor: [79, 70, 229] },
    columnStyles: { 11: { minCellWidth: 28 } },
  });
  doc.save(`${title.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ── Return-entries PDF (landscape) ────────────────────────────────────────────
export const generateReturnEntriesPdf = (entries) => {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Return Entries", 7, 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, 7, 20);
  autoTable(doc, {
    startY: 26,
    margin: { left: 7, right: 7 },
    head: [["#", "Date", "Exam", "Examiner", "Dummy No.", "Sheets", "Status", "Outward No.", "Returned By", "Return Date", "Sign"]],
    body: entries.map((e, i) => [
      i + 1,
      fmtDate(e.entry_date),
      e.exam_name || "—",
      e.examiner_name || "—",
      e.dummy_number || "—",
      e.total_answer_sheet || "—",
      e.status || "—",
      e.outward_no || "—",
      e.returned_by_name || "—",
      e.returned_date ? fmtDate(e.returned_date) : "—",
      "",
    ]),
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [124, 58, 237] },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 7 },
      1: { cellWidth: 20 },
      2: { cellWidth: 60 },
      3: { cellWidth: 45 },
      4: { cellWidth: 22 },
      5: { cellWidth: 13 },
      6: { cellWidth: 22 },
      7: { cellWidth: 40 },
      8: { cellWidth: 20 },
      9: { cellWidth: 18 },
      10: { cellWidth: 16 },
    },
  });
  doc.save(`ReturnEntries_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ── Outward PDF (landscape) ───────────────────────────────────────────────────
export const generateOutwardPdf = (o) => {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Assessment Outward", 7, 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Outward No: ${o.outward_no}`, 7, 20);
  doc.text(`Date: ${fmtDate(o.outward_date)}`, 100, 20);
  doc.text(`Receiver: ${o.receiver_name || "—"}`, 180, 20);
  let startY = 26;
  if (o.remarks) {
    doc.text(`Remarks: ${o.remarks}`, 7, 26);
    startY = 32;
  }
  autoTable(doc, {
    startY,
    margin: { left: 7, right: 7 },
    head: [["#", "Dummy No.", "Exam", "Examiner", "Sheets", "Entry Remark", "Sign"]],
    body: (o.details || []).map((d, i) => [
      i + 1,
      d.entry_detail?.dummy_number ?? "—",
      d.entry_detail?.exam_name ?? "—",
      d.entry_detail?.examiner_name ?? "—",
      d.entry_detail?.total_answer_sheet ?? "—",
      d.entry_detail?.remark || "—",
      "",
    ]),
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [79, 70, 229] },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 30 },
      2: { cellWidth: 72 },
      3: { cellWidth: 58 },
      4: { cellWidth: 18 },
      5: { cellWidth: 52 },
      6: { cellWidth: 45 },
    },
  });
  doc.save(`Outward_${o.outward_no}.pdf`);
};

// ── Return-outward PDF (landscape) ────────────────────────────────────────────
export const generateReturnOutwardPdf = (returnOutwardNo, dateStr, rows) => {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Assessment Return Outward", 7, 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Return Outward No: ${returnOutwardNo}`, 7, 20);
  doc.text(`Date: ${dateStr || new Date().toLocaleDateString("en-IN")}`, 180, 20);
  autoTable(doc, {
    startY: 26,
    margin: { left: 7, right: 7 },
    head: [["#", "Exam", "Dummy No.", "Sheets", "Outward No.", "Return Remark", "Sign"]],
    body: rows.map((r, i) => [
      i + 1,
      r.exam || "—",
      r.dummy || "—",
      r.sheets || "—",
      r.outwardNo || "—",
      r.remark || "—",
      "",
    ]),
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [124, 58, 237] },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 80 },
      2: { cellWidth: 35 },
      3: { cellWidth: 18 },
      4: { cellWidth: 45 },
      5: { cellWidth: 72 },
      6: { cellWidth: 25 },
    },
  });
  doc.save(`ReturnOutward_${returnOutwardNo}.pdf`);
};

// ── Receiver Return-Outward PDF (portrait – Receiver/D role) ────────────────────
// Different from generateReturnOutwardPdf: portrait, shows Receiver + Outward Ref.
export const generateReceiverReturnPdf = ({ returnNo, receiverName, items, outwardNo }) => {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Assessment Return Outward", 14, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Return Outward No: ${returnNo || "\u2014"}`, 14, 28);
  doc.text(`Outward Ref: ${outwardNo || "\u2014"}`, 14, 35);
  doc.text(`Receiver: ${receiverName || "\u2014"}`, 14, 42);
  doc.text(`Date: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`, 14, 49);
  autoTable(doc, {
    startY: 56,
    head: [["#", "Dummy No.", "Exam", "Examiner", "Sheets", "Return Remark"]],
    body: items.map((item, i) => [
      i + 1,
      item.dummy_number ?? "\u2014",
      item.exam_name ?? "\u2014",
      item.examiner_name ?? "\u2014",
      item.total_answer_sheet ?? "\u2014",
      item.return_remark || "\u2014",
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [79, 70, 229] },
    alternateRowStyles: { fillColor: [248, 248, 248] },
  });
  doc.save(`Return_Outward_${returnNo || "draft"}.pdf`);
};

// ── Excel downloads ───────────────────────────────────────────────────────────
export const downloadEntriesExcel = async () => {
  try {
    const res = await exportAssessmentExcel({});
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Assessment_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch {
    alert("Excel download failed.");
  }
};

export const downloadOutwardExcel = async (outwardNo, setLoading) => {
  setLoading(true);
  try {
    const res = await exportAssessmentExcel({ outward_no: outwardNo });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Outward_${outwardNo}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch { /* silent */ } finally {
    setLoading(false);
  }
};

export const downloadReturnOutwardExcel = async (returnOutwardNo, setLoading) => {
  setLoading(true);
  try {
    const res = await exportAssessmentExcel({ return_outward_no: returnOutwardNo });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ReturnOutward_${returnOutwardNo}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch { /* silent */ } finally {
    setLoading(false);
  }
};
