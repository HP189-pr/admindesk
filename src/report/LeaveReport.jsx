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
      setAllocations([]);
      if (onPeriodChange) onPeriodChange(selectedPeriod);
      return;
    }

    const load = async () => {
      setLoading(true);
      const params = `?period=${selectedPeriod}`;
      try {
        const r1 = await axios.get(`/api/leave-allocations/${params}`);
        setAllocations(normalize(r1.data));
      } catch (_) {
        setAllocations([]);
      }

      try {
        const r2 = await axios.get(`/api/leave-report/${params}`);
        setComputedReport(r2.data);
      } catch (e) {
        try {
          const r3 = await axios.get(`/api/reports/leave-balance${params}`);
          setComputedReport(r3.data);
        } catch (_) {
          setComputedReport(null);
        }
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

  const convertFromCodes = (row) => {
    if (row.alloc_cl !== undefined || row.alloc_sl !== undefined || row.alloc_el !== undefined) {
      return {
        ...row,
        emp_short: row.emp_short || row.emp_id,
        emp_name: row.emp_name || '',
        emp_designation: row.emp_designation || row.designation || '',
        leave_group: row.leave_group || '',
        actual_joining: row.actual_joining || row.start_date || '',
        left_date: row.left_date || 'Cont',
      };
    }

    const get = (code, key) => row?.codes?.[code]?.[key] ?? 0;

    return {
      ...row,
      emp_short: row.emp_short || row.emp_id,
      emp_name: row.emp_name || '',
      emp_designation: row.emp_designation || row.designation || '',
      leave_group: row.leave_group || '',
      actual_joining: row.actual_joining || row.start_date || '',
      left_date: row.left_date || 'Cont',
      start_sl: get('SL', 'starting') || get('SL', 'start') || 0,
      start_el: get('EL', 'starting') || get('EL', 'start') || 0,
      alloc_cl: get('CL', 'allocated'),
      alloc_sl: get('SL', 'allocated'),
      alloc_el: get('EL', 'allocated'),
      alloc_vac: get('VAC', 'allocated'),
      used_cl: get('CL', 'used'),
      used_sl: get('SL', 'used'),
      used_el: get('EL', 'used'),
      used_vac: get('VAC', 'used'),
      used_dl: get('DL', 'used'),
      used_lwp: get('LWP', 'used'),
      used_ml: get('ML', 'used'),
      used_pl: get('PL', 'used'),
      end_cl: get('CL', 'balance'),
      end_sl: get('SL', 'balance'),
      end_el: get('EL', 'balance'),
      end_vac: get('VAC', 'balance'),
    };
  };

  const rows = useMemo(() => {
    if (computedReport && Array.isArray(computedReport.rows) && computedReport.rows.length > 0) {
      return computedReport.rows.map(convertFromCodes);
    }

    if (profiles.length > 0) {
      return profiles.map((p) => {
        const empAllocs = allocations.filter(
          (a) => String(a.emp_id) === String(p.emp_id) || String(a.profile) === String(p.id)
        );
        const findAlloc = (codeStarts) => {
          const found = empAllocs.find((a) => (a.leave_code || a.leave_type || '').toString().toLowerCase().startsWith(codeStarts));
          return found ? (found.allocated ?? 0) : 0;
        };
        const start_sl = Number(p.sl_balance || 0);
        const start_el = Number(p.el_balance || 0);
        const alloc_cl = findAlloc('cl');
        const alloc_sl = findAlloc('sl');
        const alloc_el = findAlloc('el');
        const alloc_vac = findAlloc('vac');
        const used_cl = 0;
        const used_sl = 0;
        const used_el = 0;
        const used_vac = 0;
        const used_dl = 0;
        const used_lwp = 0;
        const used_ml = 0;
        const used_pl = 0;
        const end_cl = +(start_sl + alloc_cl - used_cl).toFixed(2);
        const end_sl = +(start_sl + alloc_sl - used_sl).toFixed(2);
        const end_el = +(start_el + alloc_el - used_el).toFixed(2);
        const end_vac = +(Number(p.vacation_balance || 0) + alloc_vac - used_vac).toFixed(2);

        return {
          emp_short: p.emp_short || p.emp_id || p.id,
          emp_id: p.emp_id || p.id,
          emp_name: p.emp_name,
          emp_designation: p.emp_designation || '',
          leave_group: p.leave_group || '',
          actual_joining: p.actual_joining || p.emp_birth_date || '',
          left_date: p.left_date || 'Cont',
          start_sl,
          start_el,
          alloc_cl,
          alloc_sl,
          alloc_el,
          alloc_vac,
          used_cl,
          used_sl,
          used_el,
          used_vac,
          used_dl,
          used_lwp,
          used_ml,
          used_pl,
          end_cl,
          end_sl,
          end_el,
          end_vac,
        };
      });
    }

    return [];
  }, [allocations, computedReport, profiles]);

  const period = periods.find((p) => String(p.id) === String(selectedPeriod));
  const periodLabel = period ? `${fmtDate(period.start_date)} to ${fmtDate(period.end_date)}` : '';
  const periodName = period?.period_name ? String(period.period_name) : '';
  const periodYearMatch = periodName.match(/\d{4}/);
  const periodYearDisplay = periodYearMatch ? periodYearMatch[0] : '';

  const filteredRows = useMemo(() => {
    if (!period || !period.start_date || !period.end_date) return rows;

    const periodStart = parseDMY(period.start_date);
    const periodEnd = parseDMY(period.end_date);
    if (!periodStart || !periodEnd) return rows;

    return rows.filter((r) => {
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
  }, [period, rows]);

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
          {periods.length === 0 && <span className="text-xs text-gray-500">(No periods available)</span>}
          <button onClick={handlePrintClick} className="px-4 py-2 bg-blue-600 text-white rounded text-sm no-print">
            Generate PDF
          </button>
        </div>
      </div>

      <div id="leave-report-print">
        {!selectedPeriod ? (
          <div className="text-center py-8 text-gray-500">Please select a period to view report</div>
        ) : (
          <>
            <div className="flex flex-col items-center mb-4">
              <div className="text-4xl font-bold text-blue-600">{periodYearDisplay}</div>
              <div className="text-sm text-red-600 mt-1">{periodLabel}</div>
            </div>

            <div className="overflow-auto border rounded" data-print-expand>
              <table className="min-w-full text-xs table-auto border-collapse">
                <thead>
                  <tr className="bg-yellow-50">
                    <th rowSpan={2} className="p-2 border font-semibold">Emp ID</th>
                    <th rowSpan={2} className="p-2 border font-semibold">Emp Name</th>
                    <th rowSpan={2} className="p-2 border font-semibold">Position</th>
                    <th rowSpan={2} className="p-2 border font-semibold">Leave Group</th>
                    <th rowSpan={2} className="p-2 border font-semibold">Joining Date</th>
                    <th rowSpan={2} className="p-2 border font-semibold">Leaving Date</th>
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
                    sorted.map((r, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="p-2 border text-center">{r.emp_short || r.emp_id}</td>
                        <td className="p-2 border">{r.emp_name}</td>
                        <td className="p-2 border">{r.emp_designation || ''}</td>
                        <td className="p-2 border text-center">{r.leave_group || ''}</td>
                        <td className="p-2 border text-center">{fmtDate(r.actual_joining) || ''}</td>
                        <td className="p-2 border text-center">{r.left_date || 'Cont'}</td>
                        <td className="p-2 border text-right">
                          {roundLeave(r.start_sl, 'SL')}{' '}
                          {r.alloc_sl ? <span className="text-xs text-gray-600">({roundLeave(r.alloc_sl, 'SL')})</span> : null}
                        </td>
                        <td className="p-2 border text-right">
                          {roundLeave(r.start_el, 'EL')}{' '}
                          {r.alloc_el ? <span className="text-xs text-gray-600">({roundLeave(r.alloc_el, 'EL')})</span> : null}
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
                    ))
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
