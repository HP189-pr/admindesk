import React, { useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const SERVICES = [
  { key: 'ENROLLMENT', label: 'Enrollment' },
  { key: 'MIGRATION', label: 'Migration' },
  { key: 'VERIFICATION', label: 'Verification' },
  { key: 'PROVISIONAL', label: 'Provisional' },
  { key: 'DEGREE', label: 'Degree' },
];

export default function DataAnalysis() {
  const { token } = useAuth();
  const [service, setService] = useState('ENROLLMENT');
  const [report, setReport] = useState(null);
  const [duplicates, setDuplicates] = useState(null);
  const [currentGroupKey, setCurrentGroupKey] = useState(null);
  const [currentGroupType, setCurrentGroupType] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [analysisOptions, setAnalysisOptions] = useState({
    DUPLICATE_ENROLL_NAME_MONTH_YEAR: true,
    ENROLLMENT_SAME_NAME_DIFFER: true,
    ENROLLMENT_NAME_DIFF_YEARS: true,
    ENROLLMENT_NAME_DIFF_MONTHS: false,
    NAME_SAME_DIFFERENT_ENROLLMENT: false,
    STATS_CONVOCATION: true,
    STATS_COURSE: true,
    STATS_COLLEGE: true,
    STATS_YEAR: false,
    STATS_MONTH: false,
    MISSING_CONVOCATION: false,
    MISSING_EXAM_MONTH_OR_YEAR: false,
    DUPLICATE_DG_SR_NO: false,
  });
  const [filterConvocation, setFilterConvocation] = useState('');
  const [filterExamMonth, setFilterExamMonth] = useState('');
  const [filterExamYear, setFilterExamYear] = useState('');
  const [filterInstitute, setFilterInstitute] = useState('');
  const apiBase = '/api';

  const isDegree = service && String(service).toUpperCase() === 'DEGREE';
  const isEnrollment = service && String(service).toUpperCase() === 'ENROLLMENT';

  const runAnalysis = async () => {
    try {
      let qs = `service=${service}`;
      if (isDegree) {
        const selected = Object.entries(analysisOptions).filter(([_, v]) => v).map(([k]) => k).join(',');
        if (selected) qs += `&analysis=${encodeURIComponent(selected)}`;
        if (filterExamMonth) qs += `&exam_month=${encodeURIComponent(filterExamMonth)}`;
        if (filterExamYear) qs += `&exam_year=${encodeURIComponent(filterExamYear)}`;
        if (filterConvocation) qs += `&convocation_no=${encodeURIComponent(filterConvocation)}`;
        if (filterInstitute) qs += `&institute=${encodeURIComponent(filterInstitute)}`;
      }

          const res = await fetch(`${apiBase}/data-analysis/?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) throw new Error('Analysis request failed');
          const data = await res.json();
          setReport(data);
          setSelectedIds(new Set());
          setDuplicates(null);
        } catch (e) {
          alert('Failed: ' + e.message);
        }
      };

      const loadRecordsForKey = async (key, groupType = null) => {
        try {
          setDuplicates(null);
          setSelectedIds(new Set());
          if (isDegree) {
            setCurrentGroupKey(key);
            setCurrentGroupType(groupType);
            const res = await fetch(`${apiBase}/data-analysis/?service=Degree&group_type=${encodeURIComponent(groupType || '')}&group_key=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error('Failed to fetch group records');
            const data = await res.json();
            setDuplicates(data.records || []);
            return;
          }

          // fallback for other services
          let endpoint = '';
          if (service === 'PROVISIONAL') endpoint = `${apiBase}/provisional/?search=${encodeURIComponent(key)}`;
          else if (isEnrollment) endpoint = `${apiBase}/enrollments/?search=${encodeURIComponent(key)}`;
          else endpoint = `${apiBase}/provisional/?search=${encodeURIComponent(key)}`;

          const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) throw new Error('Failed to fetch records');
          const data = await res.json();
          setDuplicates(data.results || data || []);
        } catch (e) {
          alert('Failed to load records: ' + e.message);
        }
      };

      const toggleSelect = (id) => {
        const s = new Set(selectedIds);
        if (s.has(id)) s.delete(id); else s.add(id);
        setSelectedIds(s);
      };

      const deleteSelected = async () => {
        if (selectedIds.size === 0) return alert('No rows selected');
        if (!confirm(`Delete ${selectedIds.size} selected record(s)? This cannot be undone.`)) return;
        try {
          const endpointRoot = isDegree ? 'degrees' : isEnrollment ? 'enrollments' : 'provisional';
          for (const id of Array.from(selectedIds)) {
            const res = await fetch(`${apiBase}/${endpointRoot}/${id}/`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) console.warn('Failed to delete', id, await res.text());
          }
          // refresh list and analysis
          setSelectedIds(new Set());
          if (currentGroupKey) {
            await loadRecordsForKey(currentGroupKey, currentGroupType);
          }
          await runAnalysis();
        } catch (e) { alert('Delete error: '+e.message); }
      };

      const deleteDuplicatesKeepOne = async (key) => {
        if (!confirm(`Delete duplicate records for '${key}', keeping one record?`)) return;
        try {
          const endpointRoot = isDegree ? 'degrees' : isEnrollment ? 'enrollments' : 'provisional';
          let rows = [];
          if (isDegree) {
            const res = await fetch(`${apiBase}/data-analysis/?service=Degree&group_type=${encodeURIComponent(currentGroupType || '')}&group_key=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } });
            const j = await res.json();
            rows = j.records || [];
          } else {
            const res = await fetch(`${apiBase}/${endpointRoot}/?search=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            rows = data.results || data || [];
          }
          if (!rows || rows.length <= 1) return alert('No duplicates found');
          // keep first, delete rest
          for (let i = 1; i < rows.length; i++) {
            const id = rows[i].id;
            const dres = await fetch(`${apiBase}/${endpointRoot}/${id}/`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (!dres.ok) console.warn('Failed to delete', id, await dres.text());
          }
          await runAnalysis();
          // if the duplicates view was open for this key, reload it
          if (currentGroupKey) await loadRecordsForKey(currentGroupKey, currentGroupType);
        } catch (e) { alert('Error deleting duplicates: '+e.message); }
      };

      const editRecord = async (row) => {
        try {
          if (isDegree) {
            const newName = prompt('Student name', row.student_name_dg || row.student_name || '');
            if (newName === null) return; // cancelled
            const newMonth = prompt('Exam month', row.last_exam_month || '');
            if (newMonth === null) return;
            const newYear = prompt('Exam year', String(row.last_exam_year || ''));
            if (newYear === null) return;
            const payload = {
              student_name_dg: newName,
              last_exam_month: newMonth,
              last_exam_year: newYear ? parseInt(newYear) : null,
            };
            const res = await fetch(`${apiBase}/degrees/${row.id}/`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error('Failed to save');
            await loadRecordsForKey(row.enrollment_no || row.enrollment || '');
            await runAnalysis();
            alert('Saved');
          } else {
            alert('Edit not implemented for this service');
          }
        } catch (e) { alert('Edit failed: '+e.message); }
      };

      return (
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <label className="font-semibold">Service:</label>
            <select value={service} onChange={(e) => setService(e.target.value)} className="border rounded p-1 text-black">
              {SERVICES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <button onClick={runAnalysis} className="ml-2 px-3 py-1 bg-blue-600 text-white rounded">Run Analysis</button>
          </div>

          {isDegree && (
            <div className="p-4 bg-white rounded text-sm space-y-3 text-black border border-gray-200 shadow-sm">
              <div className="text-lg font-semibold">Degree Analysis Types</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="underline font-medium mb-1">A. Duplicate & Mismatch</div>
                  <label className="block text-sm mb-1"><span className="inline-flex items-center"><input type="checkbox" className="mr-2" checked={analysisOptions.DUPLICATE_ENROLL_NAME_MONTH_YEAR} onChange={(e) => setAnalysisOptions({...analysisOptions, DUPLICATE_ENROLL_NAME_MONTH_YEAR: e.target.checked})} /> <span>Duplicate Enrollment + Name + Exam Month + Exam Year</span></span></label>
                  <label className="block text-sm mb-1"><span className="inline-flex items-center"><input type="checkbox" className="mr-2" checked={analysisOptions.ENROLLMENT_SAME_NAME_DIFFER} onChange={(e) => setAnalysisOptions({...analysisOptions, ENROLLMENT_SAME_NAME_DIFFER: e.target.checked})} /> <span>Same Enrollment but Different Name</span></span></label>
                  <label className="block text-sm mb-1"><span className="inline-flex items-center"><input type="checkbox" className="mr-2" checked={analysisOptions.ENROLLMENT_NAME_DIFF_YEARS} onChange={(e) => setAnalysisOptions({...analysisOptions, ENROLLMENT_NAME_DIFF_YEARS: e.target.checked})} /> <span>Enrollment+Name Same but Exam Year Different</span></span></label>
                  <label className="block text-sm mb-1"><span className="inline-flex items-center"><input type="checkbox" className="mr-2" checked={analysisOptions.ENROLLMENT_NAME_DIFF_MONTHS} onChange={(e) => setAnalysisOptions({...analysisOptions, ENROLLMENT_NAME_DIFF_MONTHS: e.target.checked})} /> <span>Enrollment+Name Same but Exam Month Different</span></span></label>
                  <label className="block text-sm"><span className="inline-flex items-center"><input type="checkbox" className="mr-2" checked={analysisOptions.NAME_SAME_DIFFERENT_ENROLLMENT} onChange={(e) => setAnalysisOptions({...analysisOptions, NAME_SAME_DIFFERENT_ENROLLMENT: e.target.checked})} /> <span>Same Name but Different Enrollment</span></span></label>
                </div>

                <div>
                  <div className="underline font-medium mb-1">B. Convocation & Summary</div>
                  <label className="block text-sm mb-1"><span className="inline-flex items-center"><input type="checkbox" className="mr-2" checked={analysisOptions.STATS_CONVOCATION} onChange={(e) => setAnalysisOptions({...analysisOptions, STATS_CONVOCATION: e.target.checked})} /> <span>Number of Degrees by Convocation</span></span></label>
                  <label className="block text-sm mb-1"><span className="inline-flex items-center"><input type="checkbox" className="mr-2" checked={analysisOptions.STATS_COURSE} onChange={(e) => setAnalysisOptions({...analysisOptions, STATS_COURSE: e.target.checked})} /> <span>Course-wise Total Degrees</span></span></label>
                  <label className="block text-sm mb-1"><span className="inline-flex items-center"><input type="checkbox" className="mr-2" checked={analysisOptions.STATS_COLLEGE} onChange={(e) => setAnalysisOptions({...analysisOptions, STATS_COLLEGE: e.target.checked})} /> <span>College-wise Total Degrees</span></span></label>
                  <label className="block text-sm mb-1"><span className="inline-flex items-center"><input type="checkbox" className="mr-2" checked={analysisOptions.STATS_YEAR} onChange={(e) => setAnalysisOptions({...analysisOptions, STATS_YEAR: e.target.checked})} /> <span>Year-wise Degree Count</span></span></label>
                  <label className="block text-sm"><span className="inline-flex items-center"><input type="checkbox" className="mr-2" checked={analysisOptions.STATS_MONTH} onChange={(e) => setAnalysisOptions({...analysisOptions, STATS_MONTH: e.target.checked})} /> <span>Month-wise Degree Count</span></span></label>
                </div>

                <div>
                  <div className="underline font-medium mb-1">C. Special Analysis</div>
                  <label className="block text-sm mb-1"><span className="inline-flex items-center"><input type="checkbox" className="mr-2" checked={analysisOptions.MISSING_CONVOCATION} onChange={(e) => setAnalysisOptions({...analysisOptions, MISSING_CONVOCATION: e.target.checked})} /> <span>Degrees Missing Convocation</span></span></label>
                  <label className="block text-sm mb-1"><span className="inline-flex items-center"><input type="checkbox" className="mr-2" checked={analysisOptions.MISSING_EXAM_MONTH_OR_YEAR} onChange={(e) => setAnalysisOptions({...analysisOptions, MISSING_EXAM_MONTH_OR_YEAR: e.target.checked})} /> <span>Degrees Missing Exam Month/Year</span></span></label>
                  <label className="block text-sm"><span className="inline-flex items-center"><input type="checkbox" className="mr-2" checked={analysisOptions.DUPLICATE_DG_SR_NO} onChange={(e) => setAnalysisOptions({...analysisOptions, DUPLICATE_DG_SR_NO: e.target.checked})} /> <span>Duplicate Degree Serial Number</span></span></label>
                </div>
              </div>
              <div className="pt-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Filter Convocation</label>
                    <input placeholder="Convocation no (e.g., 33)" aria-label="Filter Convocation" className="w-full border px-2 py-1 rounded bg-white text-black placeholder-gray-400" value={filterConvocation} onChange={(e)=>setFilterConvocation(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Exam Month</label>
                    <input placeholder="e.g., Jan, Feb or 01" aria-label="Exam Month" className="w-full border px-2 py-1 rounded bg-white text-black placeholder-gray-400" value={filterExamMonth} onChange={(e)=>setFilterExamMonth(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Exam Year</label>
                    <input placeholder="e.g., 2023" aria-label="Exam Year" className="w-full border px-2 py-1 rounded bg-white text-black placeholder-gray-400" value={filterExamYear} onChange={(e)=>setFilterExamYear(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {report && (
            <div className="space-y-3">
              <div>
                <div className="text-sm">Total issues: {report.summary?.total_issues}</div>
                <div className="text-sm">By type:</div>
                <ul className="list-disc ml-6 text-sm">
                  {report.summary && report.summary.by_type && Object.entries(report.summary.by_type).map(([k, v]) => (
                    <li key={k}>{k}: {v}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-gray-800 rounded p-3 overflow-auto" style={{ maxHeight: 320 }}>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left pr-4 pb-1 border-b border-gray-700">Type</th>
                      <th className="text-left pr-4 pb-1 border-b border-gray-700">Key</th>
                      <th className="text-left pr-4 pb-1 border-b border-gray-700">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    { (report.issues || report.duplicates || []).map((it, i) => (
                      <tr key={i} className="border-b border-gray-700">
                        <td className="pr-4 py-1">{it.type}</td>
                        <td className="pr-4 py-1">{it.key}</td>
                        <td className="pr-4 py-1">{it.message}</td>
                        <td className="pl-4 py-1">
                          {(service === 'PROVISIONAL' && (it.type?.includes('DUPLICATE') || it.type === 'DUPLICATE_PRV_NUMBER')) && (
                            <div className="flex gap-2">
                              <button onClick={() => loadRecordsForKey(it.key)} className="px-2 py-0.5 bg-green-600 text-white rounded text-xs">View</button>
                              <button onClick={() => deleteDuplicatesKeepOne(it.key)} className="px-2 py-0.5 bg-red-600 text-white rounded text-xs">Delete dup (keep 1)</button>
                            </div>
                          )}
                          {service === 'DEGREE' && (
                            <div className="flex gap-2">
                              <button onClick={() => loadRecordsForKey(it.key, it.type)} className="px-2 py-0.5 bg-green-600 text-white rounded text-xs">View</button>
                              <button onClick={() => deleteDuplicatesKeepOne(it.key)} className="px-2 py-0.5 bg-red-600 text-white rounded text-xs">Delete dup (keep 1)</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {duplicates && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Duplicate records ({duplicates.length})</div>
                <div className="flex gap-2">
                  <button onClick={deleteSelected} className="px-3 py-1 bg-red-600 text-white rounded">Delete selected</button>
                </div>
              </div>
              <div className="bg-gray-800 rounded p-3 overflow-auto" style={{ maxHeight: 320 }}>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left pr-4 pb-1 border-b border-gray-700">#</th>
                      <th className="text-left pr-4 pb-1 border-b border-gray-700">Sel</th>
                      <th className="text-left pr-4 pb-1 border-b border-gray-700">ID</th>
                      {service === 'DEGREE' ? (
                        <>
                          <th className="text-left pr-4 pb-1 border-b border-gray-700">DG SR No</th>
                          <th className="text-left pr-4 pb-1 border-b border-gray-700">Enrollment</th>
                          <th className="text-left pr-4 pb-1 border-b border-gray-700">Student Name</th>
                          <th className="text-left pr-4 pb-1 border-b border-gray-700">Exam Month</th>
                          <th className="text-left pr-4 pb-1 border-b border-gray-700">Exam Year</th>
                          <th className="text-left pr-4 pb-1 border-b border-gray-700">Convocation</th>
                          <th className="text-left pr-4 pb-1 border-b border-gray-700">Degree</th>
                        </>
                      ) : (
                        <>
                          <th className="text-left pr-4 pb-1 border-b border-gray-700">prv_number</th>
                          <th className="text-left pr-4 pb-1 border-b border-gray-700">doc_rec_id</th>
                          <th className="text-left pr-4 pb-1 border-b border-gray-700">enrollment_no</th>
                          <th className="text-left pr-4 pb-1 border-b border-gray-700">student_name</th>
                          <th className="text-left pr-4 pb-1 border-b border-gray-700">prv_date</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {duplicates.map((r, i) => (
                      <tr key={r.id} className="border-b border-gray-700">
                        <td className="pr-4 py-1">{i+1}</td>
                        <td className="pr-4 py-1"><input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                        <td className="pr-4 py-1">{r.id}</td>
                        {service === 'DEGREE' ? (
                          <>
                            <td className="pr-4 py-1">{r.dg_sr_no}</td>
                            <td className="pr-4 py-1">{r.enrollment_no}</td>
                            <td className="pr-4 py-1">{r.student_name_dg}</td>
                            <td className="pr-4 py-1">{r.last_exam_month}</td>
                            <td className="pr-4 py-1">{r.last_exam_year}</td>
                            <td className="pr-4 py-1">{r.convocation_no}</td>
                            <td className="pr-4 py-1">{r.degree_name}</td>
                          </>
                        ) : (
                          <>
                            <td className="pr-4 py-1">{r.prv_number}</td>
                            <td className="pr-4 py-1">{r.doc_rec_id || r.doc_rec || ''}</td>
                            <td className="pr-4 py-1">{r.enrollment_no || r.enrollment || ''}</td>
                            <td className="pr-4 py-1">{r.student_name}</td>
                            <td className="pr-4 py-1">{r.prv_date}</td>
                          </>
                        )}
                        <td className="pr-4 py-1">
                          {service === 'DEGREE' && (
                            <div className="flex gap-2">
                              <button onClick={() => editRecord(r)} className="px-2 py-0.5 bg-yellow-600 text-white rounded text-xs">Edit</button>
                              <button onClick={() => { setSelectedIds(new Set([r.id])); deleteSelected(); }} className="px-2 py-0.5 bg-red-600 text-white rounded text-xs">Delete</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      );
    }
