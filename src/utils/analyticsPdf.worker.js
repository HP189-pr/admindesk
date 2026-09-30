import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { normalizeDisplayValue as display } from './analyticsDisplay';

// Keep full-report layout work off the interaction thread.
self.onmessage = ({ data: { data, columns, filterEntries } }) => {
  try {
        const doc = new jsPDF({ orientation: 'landscape', format: 'a3' });
        doc.text('Student & Certificate Analytics', 14, 14);
        doc.setFontSize(9); doc.text(`Report generated: ${new Date().toLocaleString()}`, 14, 20);
        const filterText = doc.splitTextToSize(`Filters: ${filterEntries.filter(([key]) => !['page', 'page_size'].includes(key)).map(([key, value]) => `${key}: ${value}`).join(', ') || 'All records'}`, 390);
        doc.setFontSize(9); doc.text(filterText, 14, 27);
        autoTable(doc, { startY: 32 + filterText.length * 4, head: [['Students', ...data.options.document_types.map(type => type.label)]], body: [[data.summary.total, ...data.options.document_types.map(type => data.issuance[type.value])]] });
        for (const [name, rows] of Object.entries(data.breakdowns || {})) {
          doc.addPage(); doc.text(name, 14, 14);
          autoTable(doc, { startY: 20, head: [[name, 'Students', ...data.options.document_types.map(type => type.label)]], body: rows.map(row => [display(row.group), row.students, ...data.options.document_types.map(type => row[type.value])]), styles: { fontSize: 8 } });
        }
        doc.addPage(); doc.text('Filtered Student Records', 14, 14);
        autoTable(doc, { startY: 20, head: [columns.map(([, label]) => label)], body: data.records.results.map(row => columns.map(([key]) => display(row[key]))), styles: { fontSize: 7 } });
        for (const [title, payload] of [['Certificate Records', data.certificate_records], ['Verification Records', data.verification_records]]) {
          if (!payload?.count) continue;
          doc.addPage(); doc.text(title, 14, 14);
          const keys = ['document_type', 'document_number', 'student', 'enrollment_number', 'event_date', 'record_status'];
          autoTable(doc, { startY: 20, head: [['Type', 'Number', 'Student', 'Enrollment', 'Issue / completion date', 'Status']], body: payload.results.map(row => keys.map(key => display(row[key]))), styles: { fontSize: 7 } });
        }
        if (data.document_trend?.rows?.length) {
          doc.addPage(); doc.text('Document issue / completion year (not admission year)', 14, 14);
          autoTable(doc, { startY: 20, head: [['Event year', ...data.options.document_types.map(type => type.label)]], body: data.document_trend.rows.map(row => [row.year, ...data.options.document_types.map(type => row[type.value] || 0)]), styles: { fontSize: 8 } });
        }
        const buffer = doc.output('arraybuffer');
        self.postMessage({ buffer }, [buffer]);
  } catch { self.postMessage({ error: 'Unable to generate PDF' }); }
};
