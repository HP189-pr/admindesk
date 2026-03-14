import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { isoToDMY } from "./date";

const DEFAULT_DUTY_TIMING = "9.30 AM To 5.00 PM";

const toDate = (isoDate) => {
  if (!isoDate) return null;
  const value = new Date(`${String(isoDate).slice(0, 10)}T00:00:00`);
  return Number.isNaN(value.getTime()) ? null : value;
};

const sanitizeFilenamePart = (value) =>
  String(value || "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "Exam_Schedule";

export const getDutyTimingValue = (value) => {
  const cleaned = String(value || "").trim();
  return cleaned || DEFAULT_DUTY_TIMING;
};

export const buildExamScheduleMonthRange = (metadata) => {
  const start = toDate(metadata?.start_date);
  const end = toDate(metadata?.schedule_end_date);
  if (!start || !end) return "";

  const startMonth = start.toLocaleString("en-US", { month: "long" });
  const endMonth = end.toLocaleString("en-US", { month: "long" });
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  if (startYear === endYear) {
    if (startMonth === endMonth) {
      return `${startMonth} ${startYear}`;
    }
    return `${startMonth}-${endMonth} ${startYear}`;
  }

  return `${startMonth} ${startYear}-${endMonth} ${endYear}`;
};

export const buildExamScheduleHeading = (metadata) => {
  const rangeLabel = buildExamScheduleMonthRange(metadata);
  return rangeLabel ? `Exam Schedule ${rangeLabel}` : "Exam Schedule";
};

export const buildExamScheduleDutySubtitle = (dutyTiming) =>
  `Duty Timing: ${getDutyTimingValue(dutyTiming)}`;

export const buildExamScheduleFilename = (metadata, extension) => {
  const rangeLabel = buildExamScheduleMonthRange(metadata);
  const base = rangeLabel ? `Exam_Schedule_${sanitizeFilenamePart(rangeLabel)}` : "Exam_Schedule";
  return `${base}.${extension}`;
};

export const buildExamScheduleGroups = (rows = [], dutyTiming) => {
  const resolvedDutyTiming = getDutyTimingValue(dutyTiming);
  const groups = [];
  const groupByEmployee = new Map();

  rows.forEach((row) => {
    const employeeKey = row.employee_no || row.employee_name || `row_${groups.length}`;
    if (!groupByEmployee.has(employeeKey)) {
      const group = {
        serial: groups.length + 1,
        employeeNo: row.employee_no || "",
        employeeName: row.employee_name || "",
        dutyTiming: resolvedDutyTiming,
        phases: [],
      };
      groups.push(group);
      groupByEmployee.set(employeeKey, group);
    }

    groupByEmployee.get(employeeKey).phases.push({
      phase: row.phase,
      startDate: row.start_date,
      endDate: row.end_date,
      totalDays: row.total_days,
    });
  });

  groups.forEach((group) => {
    group.phases.sort((left, right) => (left.phase || 0) - (right.phase || 0));
  });

  return groups;
};

export const exportExamScheduleExcel = ({ rows, metadata, dutyTiming, filename }) => {
  const groups = buildExamScheduleGroups(rows, dutyTiming);
  if (!groups.length) return;

  const sheetRows = [
    [buildExamScheduleHeading(metadata)],
    [buildExamScheduleDutySubtitle(dutyTiming)],
    [],
    ["No", "Start Date", "End Date", "Time", "Name", "Sign"],
  ];

  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
  ];

  groups.forEach((group) => {
    const startRowIndex = sheetRows.length;
    group.phases.forEach((phase, index) => {
      sheetRows.push([
        index === 0 ? group.serial : "",
        isoToDMY(phase.startDate),
        isoToDMY(phase.endDate),
        index === 0 ? group.dutyTiming : "",
        index === 0 ? group.employeeName : "",
        "",
      ]);
    });

    const endRowIndex = sheetRows.length - 1;
    if (endRowIndex > startRowIndex) {
      [0, 3, 4, 5].forEach((columnIndex) => {
        merges.push({
          s: { r: startRowIndex, c: columnIndex },
          e: { r: endRowIndex, c: columnIndex },
        });
      });
    }
  });

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet["!merges"] = merges;
  worksheet["!cols"] = [
    { wch: 8 },
    { wch: 15 },
    { wch: 15 },
    { wch: 22 },
    { wch: 22 },
    { wch: 18 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Exam Schedule");
  XLSX.writeFile(workbook, filename || buildExamScheduleFilename(metadata, "xlsx"));
};

export const exportExamSchedulePDF = ({ rows, metadata, dutyTiming, filename }) => {
  const groups = buildExamScheduleGroups(rows, dutyTiming);
  if (!groups.length) return;

  const document = new jsPDF({ orientation: "landscape" });
  const title = buildExamScheduleHeading(metadata);
  const subtitle = buildExamScheduleDutySubtitle(dutyTiming);
  const pageWidth = document.internal.pageSize.getWidth();

  document.setFontSize(16);
  document.text(title, pageWidth / 2, 14, { align: "center" });
  document.setFontSize(11);
  document.text(subtitle, pageWidth / 2, 22, { align: "center" });

  const body = [];

  groups.forEach((group) => {
    group.phases.forEach((phase, index) => {
      if (index === 0) {
        body.push({
          serial: {
            content: String(group.serial),
            rowSpan: group.phases.length,
            styles: { valign: "middle", halign: "center", fontStyle: "bold" },
          },
          startDate: isoToDMY(phase.startDate),
          endDate: isoToDMY(phase.endDate),
          dutyTime: {
            content: group.dutyTiming,
            rowSpan: group.phases.length,
            styles: { valign: "middle", halign: "center", fontStyle: "bold" },
          },
          employeeName: {
            content: group.employeeName,
            rowSpan: group.phases.length,
            styles: { valign: "middle", halign: "center", fontStyle: "bold" },
          },
          sign: {
            content: "",
            rowSpan: group.phases.length,
            styles: { valign: "middle", halign: "center" },
          },
        });
      } else {
        body.push({
          startDate: isoToDMY(phase.startDate),
          endDate: isoToDMY(phase.endDate),
        });
      }
    });
  });

  autoTable(document, {
    startY: 28,
    columns: [
      { header: "No", dataKey: "serial" },
      { header: "Start Date", dataKey: "startDate" },
      { header: "End Date", dataKey: "endDate" },
      { header: "Time", dataKey: "dutyTime" },
      { header: "Name", dataKey: "employeeName" },
      { header: "Sign", dataKey: "sign" },
    ],
    body,
    theme: "grid",
    styles: {
      fontSize: 10,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      halign: "center",
      valign: "middle",
      cellPadding: 2,
      minCellHeight: 14,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      serial: { cellWidth: 18 },
      startDate: { cellWidth: 38 },
      endDate: { cellWidth: 38 },
      dutyTime: { cellWidth: 55 },
      employeeName: { cellWidth: 58 },
      sign: { cellWidth: 52 },
    },
  });

  document.save(filename || buildExamScheduleFilename(metadata, "pdf"));
};