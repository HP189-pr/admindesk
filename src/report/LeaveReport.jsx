// src/report/LeaveReport.jsx
// LeaveReport.jsx (Report tab)
import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { CalendarRange, FileText, Search } from 'lucide-react';
import { FaFileExcel, FaFilePdf } from 'react-icons/fa6';
import axios from '../api/axiosInstance';
import { useAuth } from '../hooks/AuthContext';
import { printElement } from '../utils/print';
import { normalize, parseDMY, fmtDate, roundLeave } from './utils';

const TOOLBAR_CARD_CLASS = 'rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm';
const CONTROL_LABEL_CLASS = 'mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500';
const CONTROL_INPUT_CLASS = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/15 disabled:cursor-not-allowed disabled:bg-slate-50';
const EXPORT_EXCEL_BUTTON_CLASS = 'inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50';
const EXPORT_PDF_BUTTON_CLASS = 'inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 shadow-sm shadow-rose-100 transition duration-200 hover:-translate-y-0.5 hover:bg-rose-100 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50';

const sanitizeFilenamePart = (value) =>
  String(value || 'Report')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Report';

const LeaveReport = ({ user, defaultPeriod = '', onPeriodChange }) => {
  const { user: authUser } = useAuth() || {};
  const currentUser = user || authUser;
  const hasMgmt = currentUser?.is_admin || currentUser?.is_staff || currentUser?.is_superuser;

  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod || '');
  const [allocations, setAllocations] = useState([]);
  const [computedReport, setComputedReport] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nameFilter, setNameFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get('/api/leave-periods/');
        const pd = normalize(r.data);
        setPeriods(pd);
        if (!selectedPeriod && pd.length > 0) {
          setSelectedPeriod(String(pd[0].id));
        }
      } catch (e) {
        console.error('Failed to load periods:', e);
        setPeriods([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get('/api/empprofile/');
        setProfiles(normalize(r.data));
      } catch (e) {
        setProfiles([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedPeriod) {
      setComputedReport(null);
      if (onPeriodChange) onPeriodChange(selectedPeriod);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const r2 = await axios.get('/api/leave-report/all-employees-balance/', {
          params: { period_id: selectedPeriod }
        });
        setComputedReport(r2.data);
      } catch (error) {
        let errorMsg = 'Failed to load leave report data.';
        if (error.response) {
          if (error.response.status === 404) {
            errorMsg = 'No data found for the selected filters.';
          } else if (error.response.status === 403) {
            errorMsg = 'You do not have permission to view this data.';
          } else {
            errorMsg = error.response.data?.detail || error.message || errorMsg;
          }
        } else {
          errorMsg = error.message || errorMsg;
        }
        setComputedReport({ error: errorMsg });
        // console.error('[LeaveReport] Error fetching leave-report:', error);
      }
      setLoading(false);
      if (onPeriodChange) onPeriodChange(selectedPeriod);
    };

    load();
  }, [selectedPeriod, onPeriodChange]);

  useEffect(() => {
    if (defaultPeriod && defaultPeriod !== selectedPeriod) {
      setSelectedPeriod(defaultPeriod);
    }
  }, [defaultPeriod, selectedPeriod]);

  const handlePrintClick = () => {
    const printable = document.querySelector('#leave-report-print');
    if (printable) printElement(printable);
  };

  const handleExcelExport = () => {
    if (!sorted.length) return;

    const exportRows = sorted.map((row) => ({
      'Emp ID': row.emp_short || row.emp_id || '',
      'Emp Name': row.emp_name || '',
      Position: row.emp_designation || '',
      'Leave Group': row.leave_group || '',
      'Joining Date': fmtDate(row.actual_joining) || '',
      'Leaving Date': row.left_date || 'Cont',
      'Balance Start SL': roundLeave(row.start_sl, 'SL'),
      'Balance Start EL': roundLeave(row.start_el, 'EL'),
      'Allocated CL': roundLeave(row.alloc_cl, 'CL'),
      'Allocated SL': roundLeave(row.alloc_sl, 'SL'),
      'Allocated EL': roundLeave(row.alloc_el, 'EL'),
      'Allocated VC': roundLeave(row.alloc_vac, 'VC'),
      'Used CL': roundLeave(row.used_cl, 'CL'),
      'Used SL': roundLeave(row.used_sl, 'SL'),
      'Used EL': roundLeave(row.used_el, 'EL'),
      'Used VC': roundLeave(row.used_vac, 'VC'),
      'Used DL': roundLeave(row.used_dl, 'DL'),
      'Used LWP': roundLeave(row.used_lwp, 'LWP'),
      'Used ML': roundLeave(row.used_ml, 'ML'),
      'Used PL': roundLeave(row.used_pl, 'PL'),
      'Balance End CL': roundLeave(row.end_cl, 'CL'),
      'Balance End SL': roundLeave(row.end_sl, 'SL'),
      'Balance End EL': roundLeave(row.end_el, 'EL'),
      'Balance End VC': roundLeave(row.end_vac, 'VC'),
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!cols'] = [
      { wch: 10 },
      { wch: 28 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    const sheetName = periodYearDisplay ? `Leave ${periodYearDisplay}` : 'Leave Report';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
    XLSX.writeFile(
      workbook,
      `Leave_Report_${sanitizeFilenamePart(periodName || periodYearDisplay || 'Report')}.xlsx`
    );
  };

  // Convert Balance-style data to report rows
  const convertFromBalance = (emp) => {
    const types = Array.isArray(emp.leave_types) ? emp.leave_types : [];
    const byCode = types.reduce((acc, t) => {
      acc[t.code] = t;
      return acc;
    }, {});
    const g = (code, key) => byCode[code]?.[key] ?? 0;
    return {
      emp_short: emp.emp_short || emp.emp_id,
      emp_id: emp.emp_id,
      emp_name: emp.emp_name,
      emp_designation: emp.emp_designation,
      leave_group: emp.leave_group,
      actual_joining: emp.actual_joining,
      left_date: emp.left_date || 'Cont',
      start_sl: g('SL', 'starting'),
      start_el: g('EL', 'starting'),
      alloc_cl: g('CL', 'allocated'),
      alloc_sl: g('SL', 'allocated'),
      alloc_el: g('EL', 'allocated'),
      alloc_vac: g('VAC', 'allocated'),
      used_cl: g('CL', 'used'),
      used_sl: g('SL', 'used'),
      used_el: g('EL', 'used'),
      used_vac: g('VAC', 'used'),
      used_dl: g('DL', 'used'),
      used_lwp: g('LWP', 'used'),
      used_ml: g('ML', 'used'),
      used_pl: g('PL', 'used'),
      end_cl: g('CL', 'balance'),
      end_sl: g('SL', 'balance'),
      end_el: g('EL', 'balance'),
      end_vac: g('VAC', 'balance'),
    };
  };

  const rows = useMemo(() => {
    if (!computedReport?.employees) return [];
    return computedReport.employees.map(convertFromBalance);
  }, [computedReport]);

  const period = periods.find((p) => String(p.id) === String(selectedPeriod));
  const periodLabel = period ? `${fmtDate(period.start_date)} to ${fmtDate(period.end_date)}` : '';
  const periodName = period?.period_name ? String(period.period_name) : '';
  const periodYearMatch = periodName.match(/\d{4}/);
  const periodYearDisplay = periodYearMatch ? periodYearMatch[0] : '';

  const filteredRows = useMemo(() => {
    let filtered = rows;
    if (period && period.start_date && period.end_date) {
      const periodStart = parseDMY(period.start_date);
      const periodEnd = parseDMY(period.end_date);
      if (periodStart && periodEnd) {
        filtered = filtered.filter((r) => {
          if (r.actual_joining) {
            const joinDate = parseDMY(r.actual_joining);
            if (joinDate && joinDate > periodEnd) return false;
          }
          if (r.left_date && r.left_date !== 'Cont') {
            const leftDate = parseDMY(r.left_date);
            if (leftDate && leftDate < periodStart) return false;
          }
          return true;
        });
      }
    }
    if (nameFilter) {
      const nameLower = nameFilter.toLowerCase();
      filtered = filtered.filter((r) =>
        (r.emp_name || '').toLowerCase().includes(nameLower)
      );
    }
    return filtered;
  }, [period, rows, nameFilter]);

  const sorted = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const nA = Number(String(a.emp_short || a.emp_id || '').replace(/\D/g, '')) || 0;
      const nB = Number(String(b.emp_short || b.emp_id || '').replace(/\D/g, '')) || 0;
      return nA - nB;
    });
  }, [filteredRows]);

  const canExport = !loading && !!selectedPeriod && !computedReport?.error && sorted.length > 0;

  if (!hasMgmt) {
    return (
      <div className="p-4">
        <div className="text-sm text-red-600 font-semibold">Access denied</div>
        <div className="text-xs text-gray-600 mt-2">You don't have permission to view the full leave report.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className={TOOLBAR_CARD_CLASS}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <FileText size={18} className="text-blue-600" />
              <span>Leave Report</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Review yearly leave balances and export the current period in PDF or Excel.
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-end">
            <div className="min-w-[180px]">
              <label className={CONTROL_LABEL_CLASS}>
                <CalendarRange size={14} />
                <span>Period</span>
              </label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className={CONTROL_INPUT_CLASS}
                disabled={loading || periods.length === 0}
              >
                <option value="">Select Period</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.period_name || `Period ${p.id}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[220px]">
              <label className={CONTROL_LABEL_CLASS}>
                <Search size={14} />
                <span>Filter By Name</span>
              </label>
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="Filter by name"
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  className={`${CONTROL_INPUT_CLASS} pl-9`}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 lg:pt-0">
              <button
                type="button"
                onClick={handleExcelExport}
                className={`${EXPORT_EXCEL_BUTTON_CLASS} no-print`}
                aria-label="Export Excel"
                title="Export Excel"
                disabled={!canExport}
              >
                <FaFileExcel size={20} color="#1D6F42" />
              </button>
              <button
                type="button"
                onClick={handlePrintClick}
                className={`${EXPORT_PDF_BUTTON_CLASS} no-print`}
                aria-label="Export PDF"
                title="Export PDF"
                disabled={!canExport}
              >
                <FaFilePdf size={20} color="#D32F2F" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {periods.length === 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              No leave periods available. Please create a period.
            </span>
          )}
          {selectedPeriod && !computedReport?.error && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {sorted.length} employee record{sorted.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      <div id="leave-report-print">
        {loading ? (
          <div className="text-center py-8 text-blue-600">Loading data...</div>
        ) : !selectedPeriod ? (
          <div className="text-center py-8 text-gray-500">Please select a period to view report</div>
        ) : computedReport && computedReport.error ? (
          <div className="text-center py-8 text-red-600">{computedReport.error}</div>
        ) : (
          <>
            <div className="flex flex-col items-center mb-4">
              <div className="text-4xl font-bold text-blue-600">{periodYearDisplay}</div>
              <div className="text-sm text-red-600 mt-1">{periodLabel}</div>
            </div>

            <div className="overflow-auto border rounded" data-print-expand>
              <table className="min-w-full text-xs table-auto border-collapse all-employees-report">
                <thead>
                  <tr className="bg-yellow-50">
                    <th rowSpan={2} className="p-2 border font-semibold">Emp ID</th>
                    <th rowSpan={2} className="p-2 border font-semibold name-col">Emp Name</th>
                    <th rowSpan={2} className="p-2 border font-semibold">Position</th>
                    <th rowSpan={2} className="p-2 border font-semibold print-hide">Leave Group</th>
                    <th rowSpan={2} className="p-2 border font-semibold">Joining Date</th>
                    <th rowSpan={2} className="p-2 border font-semibold print-hide">Leaving Date</th>
                    <th colSpan={2} className="p-2 border text-center font-semibold bg-blue-50">Balance: Start (Allocated)</th>
                    <th colSpan={4} className="p-2 border text-center font-semibold bg-green-50">Leave Allocation</th>
                    <th colSpan={8} className="p-2 border text-center font-semibold bg-orange-50">Used Leave</th>
                    <th colSpan={4} className="p-2 border text-center font-semibold bg-purple-50">Balance (End)</th>
                  </tr>
                  <tr className="bg-yellow-50">
                    <th className="p-2 border font-semibold bg-blue-50">SL</th>
                    <th className="p-2 border font-semibold bg-blue-50">EL</th>
                    <th className="p-2 border font-semibold bg-green-50">CL</th>
                    <th className="p-2 border font-semibold bg-green-50">SL</th>
                    <th className="p-2 border font-semibold bg-green-50">EL</th>
                    <th className="p-2 border font-semibold bg-green-50">VC</th>
                    <th className="p-2 border font-semibold bg-orange-50">CL</th>
                    <th className="p-2 border font-semibold bg-orange-50">SL</th>
                    <th className="p-2 border font-semibold bg-orange-50">EL</th>
                    <th className="p-2 border font-semibold bg-orange-50">VC</th>
                    <th className="p-2 border font-semibold bg-orange-50">DL</th>
                    <th className="p-2 border font-semibold bg-orange-50">LWP</th>
                    <th className="p-2 border font-semibold bg-orange-50">ML</th>
                    <th className="p-2 border font-semibold bg-orange-50">PL</th>
                    <th className="p-2 border font-semibold bg-purple-50">CL</th>
                    <th className="p-2 border font-semibold bg-purple-50">SL</th>
                    <th className="p-2 border font-semibold bg-purple-50">EL</th>
                    <th className="p-2 border font-semibold bg-purple-50">VC</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr>
                      <td colSpan={24} className="text-center p-6 text-gray-500">
                        No report data available
                      </td>
                    </tr>
                  ) : (
                    <>
                      {/* Check if all allocation and used leave columns are zero for all rows */}
                      {sorted.every(r =>
                        [r.alloc_cl, r.alloc_sl, r.alloc_el, r.alloc_vac, r.used_cl, r.used_sl, r.used_el, r.used_vac, r.used_dl, r.used_lwp, r.used_ml, r.used_pl].every(v => !v || Number(v) === 0)
                      ) && (
                        <tr>
                          <td colSpan={24} className="text-center p-2 text-yellow-700 bg-yellow-100">
                            No leave allocation or used leave data available for this period. Please check backend data.
                          </td>
                        </tr>
                      )}
                      {sorted.map((r, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="p-2 border text-center">{r.emp_short || r.emp_id}</td>
                          <td className="p-2 border">{r.emp_name}</td>
                          <td className="p-2 border">{r.emp_designation || ''}</td>
                          <td className="p-2 border text-center print-hide">{r.leave_group || ''}</td>
                          <td className="p-2 border text-center">{fmtDate(r.actual_joining) || ''}</td>
                          <td className="p-2 border text-center print-hide">{r.left_date || 'Cont'}</td>
                          <td className="p-2 border text-right">
                            {roundLeave(r.start_sl, 'SL')}
                          </td>
                          <td className="p-2 border text-right">
                            {roundLeave(r.start_el, 'EL')}
                          </td>
                          <td className="p-2 border text-right">{roundLeave(r.alloc_cl, 'CL')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.alloc_sl, 'SL')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.alloc_el, 'EL')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.alloc_vac, 'VC')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.used_cl, 'CL')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.used_sl, 'SL')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.used_el, 'EL')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.used_vac, 'VC')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.used_dl, 'DL')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.used_lwp, 'LWP')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.used_ml, 'ML')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.used_pl, 'PL')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.end_cl, 'CL')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.end_sl, 'SL')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.end_el, 'EL')}</td>
                          <td className="p-2 border text-right">{roundLeave(r.end_vac, 'VC')}</td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LeaveReport;
