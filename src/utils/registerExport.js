// src/utils/registerExport.js
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { isoToDMY } from './date';

export const getRegisterDetail = (record) => record.details || record.extra_data?.subject || record.remark || '';

const getPDFDate = (value) => {
  const formatted = isoToDMY(value) || String(value || '').trim();
  return formatted.slice(0, 11);
};

const getReferenceValue = (record, referenceKeys) => {
  for (const key of referenceKeys) {
    if (record.extra_data?.[key]) {
      return record.extra_data[key];
    }
  }

  return '';
};

export const exportRegisterExcel = ({
  commonRefKey,
  data,
  dateKey,
  directionKey,
  directionLabel,
  extraPartyKey,
  extraPartyLabel,
  filename,
  numberKey,
  partyKey,
  partyLabel,
  referenceKeys = ['inward_ref'],
  sheetName,
  typeKey,
}) => {
  const rows = data.map((record) => ({
    'Common Ref': commonRefKey ? record[commonRefKey] : '',
    [numberKey === 'inward_no' ? 'Inward No' : 'Outward No']: record[numberKey],
    'File No.': record.extra_data?.file_no || '',
    Date: record[dateKey],
    Type: record[typeKey],
    [partyLabel]: record[partyKey],
    [directionLabel]: record[directionKey] || '',
    Details: getRegisterDetail(record),
    Remark: record.remark || '',
    College: record.extra_data?.college || '',
    'Main Course': record.extra_data?.main_course || '',
    'Sub Course': record.extra_data?.sub_course || '',
    Students: record.extra_data?.students || '',
    [extraPartyLabel]: record.extra_data?.[extraPartyKey] || '',
    Place: record.extra_data?.place || '',
    Subject: record.extra_data?.subject || '',
    'Inward Ref No': getReferenceValue(record, referenceKeys),
    'Enrollment No(s)': record.extra_data?.enrollment_nos || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
};

export const exportRegisterPDF = ({
  commonRefKey,
  data,
  dateKey,
  filename,
  numberKey,
  partyKey,
  partyLabel,
  title,
  typeKey,
}) => {
  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const generatedAt = new Date().toLocaleString();
  const registerNoLabel = numberKey === 'inward_no' ? 'Inward No' : 'Outward No';
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();

  document.setFillColor(15, 76, 129);
  document.rect(8, 8, pageWidth - 16, 15, 'F');
  document.setTextColor(255, 255, 255);
  document.setFont('helvetica', 'bold');
  document.setFontSize(13);
  document.text(title, 12, 17.5);
  document.setFont('helvetica', 'normal');
  document.setFontSize(7);
  document.text(`Generated: ${generatedAt}`, pageWidth - 12, 17.5, { align: 'right' });
  document.setTextColor(45, 55, 72);

  autoTable(document, {
    startY: 28,
    margin: { top: 28, right: 8, bottom: 12, left: 8 },
    tableWidth: 'auto',
    theme: 'grid',
    head: [['Common Ref', registerNoLabel, 'File No.', 'Place', 'Date', 'Type', partyLabel, 'Details']],
    body: data.map((record) => [
      commonRefKey ? record[commonRefKey] : '',
      record[numberKey],
      record.extra_data?.file_no || '',
      record.extra_data?.place || '',
      getPDFDate(record[dateKey]),
      record[typeKey],
      record[partyKey],
      getRegisterDetail(record),
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 5.5,
      cellPadding: { top: 0.9, right: 0.8, bottom: 0.9, left: 0.8 },
      overflow: 'linebreak',
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      textColor: [45, 55, 72],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [31, 111, 170],
      textColor: [255, 255, 255],
      fontSize: 6,
      fontStyle: 'bold',
      halign: 'left',
      minCellHeight: 6,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 27 },
      2: { cellWidth: 14 },
      3: { cellWidth: 20 },
      4: { cellWidth: 11 },
      5: { cellWidth: 9, halign: 'center' },
      6: { cellWidth: 68 },
      7: { cellWidth: 'auto' },
    },
    didDrawPage: () => {
      const pageNumber = document.internal.getCurrentPageInfo().pageNumber;
      document.setFontSize(7);
      document.setTextColor(100, 116, 139);
      document.text(`Page ${pageNumber}`, pageWidth - 8, pageHeight - 5, { align: 'right' });
    },
  });
  document.save(filename);
};
