// LeaveReport.jsx (Report tab)
import React, { useEffect, useMemo, useState } from 'react';
import axios from '../api/axiosInstance';
import { useAuth } from '../hooks/AuthContext';
import { printElement } from '../utils/print';
import { normalize, parseDMY, fmtDate, roundLeave } from './utils';

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
        const r = await axios.get('/leave-periods/');
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

  if (!hasMgmt) {
    return (
      <div className="p-4">
        <div className="text-sm text-red-600 font-semibold">Access denied</div>
        <div className="text-xs text-gray-600 mt-2">You don't have permission to view the full leave report.</div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <div className="text-lg font-semibold">Leave Report</div>
        <div className="flex gap-2 items-center">
          <label className="text-sm font-medium">Period</label>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="border px-3 py-2 rounded text-sm min-w-[160px]"
            disabled={loading || periods.length === 0}
          >
            <option value="">Select Period</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.period_name || `Period ${p.id}`}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Filter by name"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            className="border px-3 py-2 rounded text-sm min-w-[160px]"
            disabled={loading}
            style={{ marginLeft: 8 }}
          />
          {periods.length === 0 && <span className="text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded">No leave periods available. Please create a period.</span>}
          <button onClick={handlePrintClick} className="px-4 py-2 bg-blue-600 text-white rounded text-sm no-print">
            Generate PDF
          </button>
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
