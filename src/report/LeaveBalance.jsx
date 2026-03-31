// src/report/LeaveBalance.jsx
// LeaveBalance.jsx (Balance tab)
import React, { useEffect, useMemo, useState } from 'react';
import axios from '../api/axiosInstance';
import { useAuth } from '../hooks/AuthContext';
import { printElement } from '../utils/print';
import { normalize, fmtDate, roundLeave } from './utils';
import { fetchLeaveReport, fetchMyLeaveBalance } from '../services/empLeaveService';

const LeaveBalance = ({ user, selectedPeriod: controlledPeriod, setSelectedPeriod: setControlledPeriod }) => {
  const { user: authUser } = useAuth() || {};
  const currentUser = user || authUser;
  const hasMgmt = currentUser?.is_admin || currentUser?.is_staff || currentUser?.is_superuser;

  const [periods, setPeriods] = useState([]);
  const [internalPeriod, setInternalPeriod] = useState('');
  const [balanceMode, setBalanceMode] = useState('all-employees');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [leaveGroupFilter, setLeaveGroupFilter] = useState('all');
  const [nameFilter, setNameFilter] = useState('');
  const [balanceData, setBalanceData] = useState(null);
  const [balanceError, setBalanceError] = useState(null);
  const [myBalances, setMyBalances] = useState([]);
  const [loading, setLoading] = useState(false);

  // Use controlled period if provided, else fallback to internal state
  const selectedPeriod = controlledPeriod !== undefined ? controlledPeriod : internalPeriod;
  const setSelectedPeriod = setControlledPeriod !== undefined ? setControlledPeriod : setInternalPeriod;

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
  }, [selectedPeriod, setSelectedPeriod]);

  // Removed defaultPeriod effect, now controlled by parent

  useEffect(() => {
    if (!hasMgmt) {
      fetchMyLeaveBalance()
        .then((data) => setMyBalances(Array.isArray(data) ? data : []))
        .catch(() => setMyBalances([]));
    }
  }, [hasMgmt]);

  // Prevent infinite loop: only call onPeriodChange if provided and value is different
  // Removed useEffect that calls onPeriodChange to prevent infinite loop.

  const handlePrintClick = (selector) => {
    const printable = document.querySelector(selector);
    if (printable) printElement(printable);
  };

  const period = periods.find((p) => String(p.id) === String(selectedPeriod));

  const loadBalanceData = async () => {
    if (!hasMgmt) return;

    setLoading(true);
    setBalanceData(null);
    setBalanceError(null);

    try {
      let endpoint = '';
      let params = {};

      switch (balanceMode) {
        case 'employee-summary':
          if (!selectedEmpId || !selectedPeriod) {
            setBalanceError('Please enter Employee ID and select a Period');
            setLoading(false);
            return;
          }
          endpoint = 'employee-summary';
          params = { emp_id: selectedEmpId, period_id: selectedPeriod };
          break;
        case 'employee-range':
        case 'certificate-range':
          if (!selectedEmpId || !fromDate || !toDate) {
            setBalanceError('Please enter Employee ID and select both dates');
            setLoading(false);
            return;
          }
          endpoint = 'employee-range';
          params = { emp_id: selectedEmpId, from: fromDate, to: toDate };
          break;
        case 'multi-year':
          if (!selectedEmpId) {
            setBalanceError('Please enter Employee ID');
            setLoading(false);
            return;
          }
          endpoint = 'multi-year';
          params = { emp_id: selectedEmpId };
          break;
        case 'all-employees':
          if (!selectedPeriod) {
            setBalanceError('Please select a Period');
            setLoading(false);
            return;
          }
          endpoint = 'all-employees-balance';
          params = { period_id: selectedPeriod };
          break;
        case 'no-employee-leave':
          if (!selectedEmpId || !selectedYear) {
            setBalanceError('Please enter Employee Code / ID and select Year');
            setLoading(false);
            return;
          }
          endpoint = 'no-employee-leave';
          params = { emp_code: selectedEmpId, year: selectedYear };
          break;
        default:
          setLoading(false);
          return;
      }

      try {
        const data = await fetchLeaveReport(endpoint, params);
        console.log('[DEBUG] API Response:', data);
        console.log('[DEBUG] Year:', data.year, '| Period:', data.period?.name, '| Records:', data.employees?.length);
        setBalanceData(data);
        setBalanceError(null);
      } catch (error) {
        let errorMsg = 'Failed to load balance data';
        if (error.response) {
          if (error.response.status === 404) {
            errorMsg = error.response.data?.error || 'No data found for the selected employee or period.';
            // Show available periods if provided
            if (error.response.data?.available_periods?.length > 0) {
              const periods = error.response.data.available_periods.map(p => `${p.period_name} (${p.start_date} to ${p.end_date})`).join('; ');
              errorMsg += `\n\nAvailable periods: ${periods}`;
            }
          } else if (error.response.status === 403) {
            errorMsg = 'You do not have permission to view this data.';
          } else {
            errorMsg = error.response.data?.detail || error.message || errorMsg;
          }
        } else {
          errorMsg = error.message || errorMsg;
        }
        console.error('[DEBUG] API Error:', errorMsg, error.response?.data);
        setBalanceError(errorMsg);
        setBalanceData(null);
      }
    } catch (error) {
      setBalanceError('Unexpected error occurred.');
      setBalanceData(null);
    }

    setLoading(false);
  };

  const opening = balanceData?.opening || { CL: 0, SL: 0, EL: 0, VAC: 0 };
  const allocated = balanceData?.allocated || { CL: 0, SL: 0, EL: 0, VAC: 0 };
  const used = balanceData?.used || { CL: 0, SL: 0, EL: 0, VAC: 0, DL: 0, LWP: 0, ML: 0, PL: 0 };
  const closing = balanceData?.closing || { CL: 0, SL: 0, EL: 0, VAC: 0 };
  const employeeSummaryLeaveCodes = React.useMemo(() => {
    const codes = new Set([
      ...Object.keys(opening || {}),
      ...Object.keys(allocated || {}),
      ...Object.keys(used || {}),
      ...Object.keys(closing || {}),
    ]);
    const order = ['CL', 'SL', 'EL', 'VAC', 'DL', 'LWP', 'ML', 'PL'];
    return Array.from(codes)
      .filter(Boolean)
      .sort((a, b) => {
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        if (ai !== -1 || bi !== -1) {
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        }
        return String(a).localeCompare(b);
      });
  }, [opening, allocated, used, closing]);
  const yearsArr = Array.isArray(balanceData?.years) ? balanceData.years : [];
  const employeesArr = Array.isArray(balanceData?.employees) ? balanceData.employees : [];

  const filteredEmployees = useMemo(() => {
    let filtered = employeesArr;
    if (leaveGroupFilter && leaveGroupFilter !== 'all') {
      filtered = filtered.filter((emp) => {
        const raw = emp?.leave_group || emp?.emp_leave_group || '';
        const normalized = raw.toString().toLowerCase();
        if (leaveGroupFilter === 'vc') return normalized.includes('vc');
        if (leaveGroupFilter === 'el') return normalized.includes('el');
        return true;
      });
    }
    if (nameFilter) {
      const nameLower = nameFilter.toLowerCase();
      filtered = filtered.filter((emp) => (emp.emp_name || '').toLowerCase().includes(nameLower));
    }
    return filtered;
  }, [employeesArr, leaveGroupFilter, nameFilter]);

  if (!hasMgmt) {
    return (
      <div className="p-4">
        <div className="font-semibold mb-2">My Leave Balance</div>
        {myBalances.length === 0 ? (
          <div className="text-gray-500 text-sm">No leave data available.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myBalances.map((b) => (
              <div key={b.leave_type} className="border rounded p-3 bg-white">
                <div className="font-semibold">
                  {b.leave_type_name} ({b.leave_type})
                </div>
                <div>Allocated: {b.allocated}</div>
                <div>Used: {b.used}</div>
                <div>Balance: {b.balance}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="text-lg font-semibold mb-4">Leave Balance</div>

      <div className="mb-4 p-4 bg-gray-50 rounded border">
        <div className="flex flex-nowrap gap-3 items-end overflow-x-auto">
          <div className="flex-shrink-0 min-w-[250px]">
            <label className="block text-sm font-medium mb-2">Select Report Mode</label>
            <select
              value={balanceMode}
              onChange={(e) => setBalanceMode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="employee-summary">1. Employee Yearly Summary</option>
              <option value="employee-range">2. Employee Date Range</option>
              <option value="multi-year">3. Multi-Year Employee Report</option>
              <option value="all-employees">4. All Employees for Year</option>
              <option value="certificate-range">5. Certificate (From → To)</option>
              <option value="no-employee-leave">6. Employee Leave Reports</option>
            </select>
          </div>

          {balanceMode === 'employee-summary' && (
            <>
              <div className="flex-shrink-0 min-w-[200px]">
                <label className="block text-sm font-medium mb-2">Employee ID *</label>
                <input
                  type="text"
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="flex-shrink-0 min-w-[200px]">
                <label className="block text-sm font-medium mb-2">Period *</label>
                <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                  <option value="">Select Period</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.period_name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {(balanceMode === 'employee-range' || balanceMode === 'certificate-range') && (
            <>
              <div className="flex-shrink-0 min-w-[200px]">
                <label className="block text-sm font-medium mb-2">Employee ID *</label>
                <input
                  type="text"
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="flex-shrink-0 min-w-[150px]">
                <label className="block text-sm font-medium mb-2">From Date *</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              <div className="flex-shrink-0 min-w-[150px]">
                <label className="block text-sm font-medium mb-2">To Date *</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
            </>
          )}

          {balanceMode === 'multi-year' && (
            <div className="flex-shrink-0 min-w-[200px]">
              <label className="block text-sm font-medium mb-2">Employee ID *</label>
              <input
                type="text"
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          )}

          {balanceMode === 'all-employees' && (
            <>
              <div className="flex-shrink-0 min-w-[200px]">
                <label className="block text-sm font-medium mb-2">Period *</label>
                <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                  <option value="">Select Period</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.period_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-shrink-0 min-w-[150px]">
                <label className="block text-sm font-medium mb-2">Leave Group</label>
                <select value={leaveGroupFilter} onChange={(e) => setLeaveGroupFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                  <option value="all">All (VC & EL)</option>
                  <option value="vc">Vacation (VC)</option>
                  <option value="el">EL only</option>
                </select>
              </div>
              <div className="flex-shrink-0 min-w-[150px]">
                <label className="block text-sm font-medium mb-2">Filter Name</label>
                <input
                  type="text"
                  placeholder="Employee name"
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  disabled={loading}
                />
              </div>
            </>
          )}

          {balanceMode === 'no-employee-leave' && (
            <>
              <div className="flex-shrink-0 min-w-[200px]">
                <label className="block text-sm font-medium mb-2">Employee Code / ID *</label>
                <input
                  type="text"
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter employee code or ID"
                />
              </div>
              <div className="flex-shrink-0 min-w-[150px]">
                <label className="block text-sm font-medium mb-2">Allocation Year *</label>
                <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                  <option value="">Select Year</option>
                  <option value="2023">2023</option>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                  <option value="2028">2028</option>
                </select>
              </div>
            </>
          )}

          {balanceError && (
            <div className="flex-shrink-0 text-red-700 text-sm" style={{marginTop: '24px'}}>
              ⚠️
            </div>
          )}

          <button
            onClick={loadBalanceData}
            disabled={loading}
            className="flex-shrink-0 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 font-medium"
            style={{marginTop: '24px'}}
          >
            {loading ? 'Loading...' : 'Show Report'}
          </button>
        </div>

        {balanceError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{balanceError}</div>
        )}
      </div>

      {balanceData && balanceMode === 'certificate-range' && balanceData.period && (
        <div id="certificate-range-print" className="bg-white border rounded p-6 max-w-3xl mx-auto">
          <div className="flex justify-between items-start mb-4">
            <div className="text-center w-full">
              <div className="text-2xl font-bold">Balance Certificate</div>
              <div className="text-sm text-gray-600 mt-1">
                {balanceData?.period?.name || ''} • {balanceData?.period?.start || ''} to {balanceData?.period?.end || ''}
              </div>
            </div>
            <div className="ml-4">
              <button onClick={() => handlePrintClick('#certificate-range-print')} className="px-3 py-1 bg-blue-600 text-white rounded text-sm no-print">
                Print / Save PDF
              </button>
            </div>
          </div>

          <div className="mb-4 text-sm">
            <div>
              <strong>Employee:</strong> {balanceData?.emp_name || ''} (#{balanceData?.emp_short || ''})
            </div>
            <div>
              <strong>Designation:</strong> {balanceData?.emp_designation || ''}
            </div>
            <div>
              <strong>Joining:</strong> {balanceData?.actual_joining || ''} &nbsp; <strong>Leaving:</strong> {balanceData?.left_date || 'Cont'}
            </div>
          </div>

          <div className="overflow-auto" data-print-expand>
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 border text-left">Leave Type</th>
                  <th className="p-2 border text-right">Start (Allocated)</th>
                  <th className="p-2 border text-right">Allocated</th>
                  <th className="p-2 border text-right">Used</th>
                  <th className="p-2 border text-right">Closing</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const lg = balanceData?.leave_group || balanceData?.emp_leave_group || balanceData?.emp?.leave_group;
                  const codes = lg?.toLowerCase() === 'el' ? ['CL', 'SL', 'EL'] : lg?.toLowerCase() === 'vc' ? ['CL', 'SL', 'VAC'] : ['CL', 'SL', 'EL', 'VAC'];
                  return codes.map((code) => (
                    <tr key={code} className="border-b hover:bg-gray-50">
                      <td className="p-2 border font-semibold">{code}</td>
                      <td className="p-2 border text-right">
                        {roundLeave(opening[code] ?? 0, code)}{' '}
                        {allocated[code] ? <span className="text-xs text-gray-600">({roundLeave(allocated[code], code)})</span> : null}
                      </td>
                      <td className="p-2 border text-right">{roundLeave(allocated[code] ?? 0, code)}</td>
                      <td className="p-2 border text-right">{roundLeave(used[code] ?? 0, code)}</td>
                      <td className="p-2 border text-right font-semibold">{roundLeave(closing[code] ?? 0, code)}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(balanceMode === 'employee-summary' || balanceMode === 'employee-range') && balanceData && balanceData.period && (
        <div id="employee-summary-print" className="bg-white border rounded p-4">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-lg font-semibold">
                {balanceData?.emp_name || ''} (#{balanceData?.emp_short || ''})
              </h3>
              <p className="text-sm text-gray-600">
                {balanceData?.period?.name || ''} • {balanceData?.period?.start || ''} to {balanceData?.period?.end || ''}
              </p>
            </div>
            <div>
              <button onClick={() => handlePrintClick('#employee-summary-print')} className="px-3 py-1 bg-blue-600 text-white rounded text-sm no-print">
                Print / Save PDF
              </button>
            </div>
          </div>

          <div className="overflow-auto mb-4" data-print-expand>
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="p-2 border">Leave Type</th>
                  <th className="p-2 border text-right">Opening</th>
                  <th className="p-2 border text-right">Allocated</th>
                  <th className="p-2 border text-right">Used</th>
                  <th className="p-2 border text-right">Closing</th>
                </tr>
              </thead>
              <tbody>
                {employeeSummaryLeaveCodes.map((code) => (
                  <tr key={code} className="border-b hover:bg-gray-50">
                    <td className="p-2 border font-semibold">{code}</td>
                    <td className="p-2 border text-right">{roundLeave(opening[code] ?? 0, code)}</td>
                    <td className="p-2 border text-right">{roundLeave(allocated[code] ?? 0, code)}</td>
                    <td className="p-2 border text-right">{roundLeave(used[code] ?? 0, code)}</td>
                    <td className="p-2 border text-right font-semibold">{roundLeave(closing[code] ?? 0, code)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(['DL', 'LWP', 'ML', 'PL'].some((code) => (used[code] || 0) !== 0)) && (
            <div className="overflow-auto mb-4">
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="p-2 border">Leave Type</th>
                    <th className="p-2 border text-right">Used</th>
                  </tr>
                </thead>
                <tbody>
                  {['DL', 'LWP', 'ML', 'PL'].map((code) => (
                    <tr key={code} className="border-b hover:bg-gray-50">
                      <td className="p-2 border font-semibold">{code}</td>
                      <td className="p-2 border text-right">{roundLeave(used[code] ?? 0, code)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {balanceMode === 'multi-year' && yearsArr.length > 0 && (
        <div id="multi-year-print" className="bg-white border rounded p-4">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="text-lg font-semibold">
                {balanceData?.emp_name || ''} (#{balanceData?.emp_short || ''})
              </h3>
              <p className="text-sm text-gray-600">
                Multi-Year Leave Report
              </p>
            </div>
            <button onClick={() => handlePrintClick('#multi-year-print')} className="px-3 py-1 bg-blue-600 text-white rounded text-sm no-print">
              Print / Save PDF
            </button>
          </div>

          <div className="overflow-auto" data-print-expand>
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="p-2 border">Year</th>
                  <th className="p-2 border">Period</th>
                  <th className="p-2 border">Leave Type</th>
                  <th className="p-2 border text-right">Opening</th>
                  <th className="p-2 border text-right">Allocated</th>
                  <th className="p-2 border text-right">Used</th>
                  <th className="p-2 border text-right">Closing</th>
                </tr>
              </thead>
              <tbody>
                {yearsArr.flatMap((year, yearIdx) => {
                  const yearLabel = year.period?.name || `Year ${yearIdx + 1}`;
                  const periodLabel = `${year.period?.start || ''} to ${year.period?.end || ''}`;
                  return ['CL', 'SL', 'EL', 'VAC'].map((code, rowIdx) => (
                    <tr key={`${yearIdx}-${code}`} className="border-b hover:bg-gray-50">
                      <td className="p-2 border text-sm" style={{ verticalAlign: 'top' }}>
                        {rowIdx === 0 ? yearLabel : ''}
                      </td>
                      <td className="p-2 border text-sm" style={{ verticalAlign: 'top' }}>
                        {rowIdx === 0 ? periodLabel : ''}
                      </td>
                      <td className="p-2 border font-semibold">{code}</td>
                      <td className="p-2 border text-right">{roundLeave(year.opening?.[code] || 0, code)}</td>
                      <td className="p-2 border text-right">{roundLeave(year.allocated?.[code] || 0, code)}</td>
                      <td className="p-2 border text-right">{roundLeave(year.used?.[code] || 0, code)}</td>
                      <td className="p-2 border text-right">{roundLeave(year.closing?.[code] || 0, code)}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {balanceMode === 'all-employees' && balanceData && balanceData.period && filteredEmployees.length > 0 && (
        <div id="all-employees-print" className="bg-white border rounded print-area all-employees-report">
          <div className="p-3 bg-gray-50 border-b">
            <div className="flex items-start justify-between">
              <div className="flex-1 text-center">
                <div className="text-2xl font-bold">{balanceData?.org_name || 'Organization Name'}</div>
                <div className="text-xl font-semibold text-blue-700 mt-1">
                  {(() => {
                    const p = balanceData.period || period || null;
                    if (!p) return '';
                    const start = p.start || p.start_date || '';
                    const end = p.end || p.end_date || '';
                    return `${fmtDate(start)} to ${fmtDate(end)}`;
                  })()}
                </div>
                <div className="text-base font-semibold mt-2">Leave Balance</div>
              </div>
              <div className="text-right ml-4">
                <button onClick={() => handlePrintClick('#all-employees-print')} className="px-3 py-1 bg-blue-600 text-white rounded text-sm no-print">
                  Print / Save PDF
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-auto" data-print-expand>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-center font-semibold">
                  <th rowSpan={2} className="p-2 border">
                    Emp ID
                  </th>
                  <th rowSpan={2} className="p-2 border text-left">
                    Name
                  </th>
                  <th colSpan={2} className="p-2 border bg-blue-50">
                    Balance Start (Allocated)
                  </th>
                  <th colSpan={4} className="p-2 border bg-green-50">
                    Leave Allocation
                  </th>
                  <th colSpan={8} className="p-2 border bg-orange-50">
                    Used Leave
                  </th>
                  <th colSpan={4} className="p-2 border bg-purple-50">
                    Balance (End)
                  </th>
                </tr>
                <tr className="bg-gray-50 text-center text-xs">
                  <th className="p-2 border bg-blue-50">SL</th>
                  <th className="p-2 border bg-blue-50">EL</th>
                  <th className="p-2 border bg-green-50">CL</th>
                  <th className="p-2 border bg-green-50">SL</th>
                  <th className="p-2 border bg-green-50">EL</th>
                  <th className="p-2 border bg-green-50">VAC</th>
                  <th className="p-2 border bg-orange-50">CL</th>
                  <th className="p-2 border bg-orange-50">SL</th>
                  <th className="p-2 border bg-orange-50">EL</th>
                  <th className="p-2 border bg-orange-50">VAC</th>
                  <th className="p-2 border bg-orange-50">DL</th>
                  <th className="p-2 border bg-orange-50">LWP</th>
                  <th className="p-2 border bg-orange-50">ML</th>
                  <th className="p-2 border bg-orange-50">PL</th>
                  <th className="p-2 border bg-purple-50">CL</th>
                  <th className="p-2 border bg-purple-50">SL</th>
                  <th className="p-2 border bg-purple-50">EL</th>
                  <th className="p-2 border bg-purple-50">VAC</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp, idx) => {
                  const types = Array.isArray(emp.leave_types) ? emp.leave_types : [];
                  const byCode = types.reduce((acc, lt) => {
                    const code = (lt.code || lt.leave_type || '').toString().toUpperCase();
                    acc[code] = lt;
                    return acc;
                  }, {});
                  const safe = (code, key) => {
                    const val = byCode[code];
                    return val && val[key] !== undefined ? val[key] : 0;
                  };
                  return (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="p-2 border text-center">{emp.emp_short || emp.emp_id}</td>
                      <td className="p-2 border">{emp.emp_name}</td>
                      <td className="p-2 border text-right">{roundLeave(safe('SL', 'starting') || safe('SL', 'start') || 0, 'SL')}</td>
                      <td className="p-2 border text-right">{roundLeave(safe('EL', 'starting') || safe('EL', 'start') || 0, 'EL')}</td>
                      <td className="p-2 border text-right">{roundLeave(safe('CL', 'allocated'), 'CL')}</td>
                      <td className="p-2 border text-right">{roundLeave(safe('SL', 'allocated'), 'SL')}</td>
                      <td className="p-2 border text-right">{roundLeave(safe('EL', 'allocated'), 'EL')}</td>
                      <td className="p-2 border text-right">{roundLeave(safe('VAC', 'allocated'), 'VAC')}</td>
                      <td className="p-2 border text-right">{roundLeave(safe('CL', 'used'), 'CL')}</td>
                      <td className="p-2 border text-right">{roundLeave(safe('SL', 'used'), 'SL')}</td>
                      <td className="p-2 border text-right">{roundLeave(safe('EL', 'used'), 'EL')}</td>
                      <td className="p-2 border text-right">{roundLeave(safe('VAC', 'used'), 'VAC')}</td>
                      <td className="p-2 border text-right">{roundLeave(safe('DL', 'used') || 0, 'CL')}</td>
                      <td className="p-2 border text-right">{roundLeave(safe('LWP', 'used') || 0, 'CL')}</td>
                      <td className="p-2 border text-right">{roundLeave(safe('ML', 'used') || 0, 'CL')}</td>
                      <td className="p-2 border text-right">{roundLeave(safe('PL', 'used') || 0, 'CL')}</td>
                      <td className="p-2 border text-right font-semibold">{roundLeave(safe('CL', 'balance'), 'CL')}</td>
                      <td className="p-2 border text-right font-semibold">{roundLeave(safe('SL', 'balance'), 'SL')}</td>
                      <td className="p-2 border text-right font-semibold">{roundLeave(safe('EL', 'balance'), 'EL')}</td>
                      <td className="p-2 border text-right font-semibold">{roundLeave(safe('VAC', 'balance'), 'VAC')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {balanceMode === 'no-employee-leave' && balanceData && filteredEmployees.length > 0 && (
        <div id="no-employee-leave-print" className="bg-white border rounded p-4">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-lg font-semibold">
                Employee Leave Report - {balanceData?.emp_name || balanceData?.emp_code || ''} (#{balanceData?.emp_short || balanceData?.emp_id || ''})
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Allocation Year {balanceData?.year}: {balanceData?.period?.name} ({balanceData?.period?.start_date} to {balanceData?.period?.end_date})
              </p>
            </div>
            <div>
              <button onClick={() => handlePrintClick('#no-employee-leave-print')} className="px-3 py-1 bg-blue-600 text-white rounded text-sm no-print">
                Print / Save PDF
              </button>
            </div>
          </div>

          <div className="overflow-auto" data-print-expand>
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 text-center font-semibold">
                  <th className="p-2 border">Report No</th>
                  <th className="p-2 border">Start Date</th>
                  <th className="p-2 border">End Date</th>
                  <th className="p-2 border">Leave Type</th>
                  <th className="p-2 border text-right">Total Leave Days</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length > 0 ? (
                  filteredEmployees.map((leave, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="p-2 border text-center">{leave.report_no || leave.id || idx + 1}</td>
                      <td className="p-2 border text-center">{fmtDate(leave.start_date || leave.from_date || '')}</td>
                      <td className="p-2 border text-center">{fmtDate(leave.end_date || leave.to_date || '')}</td>
                      <td className="p-2 border text-center font-semibold">{leave.leave_type || leave.leave_type_name || '-'}</td>
                      <td className="p-2 border text-right font-semibold">{roundLeave(leave.total_days || leave.days || 0, 'CL')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="p-4 text-center text-gray-500">No leave records found for this employee.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default LeaveBalance;
