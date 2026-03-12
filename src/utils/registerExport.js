import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const getRegisterDetail = (record) => record.details || record.extra_data?.subject || record.remark || '';

const getReferenceValue = (record, referenceKeys) => {
  for (const key of referenceKeys) {
    if (record.extra_data?.[key]) {
      return record.extra_data[key];
    }
  }

  return '';
};

export const exportRegisterExcel = ({
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
    [numberKey === 'inward_no' ? 'Inward No' : 'Outward No']: record[numberKey],
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
  data,
  dateKey,
  filename,
  numberKey,
  partyKey,
  partyLabel,
  title,
  typeKey,
}) => {
  const document = new jsPDF();

  document.text(title, 14, 15);
  autoTable(document, {
    startY: 20,
    head: [[numberKey === 'inward_no' ? 'Inward No' : 'Outward No', 'Date', 'Type', partyLabel, 'Details']],
    body: data.map((record) => [
      record[numberKey],
      record[dateKey],
      record[typeKey],
      record[partyKey],
      getRegisterDetail(record),
    ]),
  });
  document.save(filename);
};