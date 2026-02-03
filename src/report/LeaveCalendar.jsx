// LeaveCalendar.jsx (Calendar tab)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from '../api/axiosInstance';
import { useAuth } from '../hooks/AuthContext';
import { normalize, fmtDate } from './utils';
import { printElement } from '../utils/print';

const DEFAULT_COLOR_MAP = {
  CL: '#F4B183',
  HCL1: '#FAD7A0',
  HCL2: '#FAD7A0',
  SL: '#9DC3E6',
  HSL1: '#BDD7EE',
  HSL2: '#BDD7EE',
  EL: '#FFF2CC',
  DL: '#D9D2E9',
  LWP: '#F4CCCC',
  VAC: '#FCE5CD',
  ML: '#F4B6C2',
  PL: '#CFE2F3',
  SANDWICH: '#B7B7B7',
  WEEKEND: '#E7E6E6',
  HOLIDAY: '#C6E0B4',
};

const DARK_TEXT_CODES = new Set([
  'CL',
  'HCL1',
  'HCL2',
  'SL',
  'HSL1',
  'HSL2',
  'EL',
  'DL',
  'LWP',
  'VAC',
  'ML',
  'PL',
  'SANDWICH',
  'WEEKEND',
  'HOLIDAY',
]);

const DAY_NUMBERS = Array.from({ length: 31 }, (_, idx) => idx + 1);
const getEmptySummary = () => ({ main: {}, breakdown: {}, by_code: {} });

const isWeekend = (dateObj) => {
  const day = dateObj.getDay();
  return day === 0; // Sunday only
};

const formatLeaveValue = (value) => {
  if (value === undefined || value === null) return '0';
  const num = Number(value);
  if (Number.isNaN(num)) return '0';
  if (Number.isInteger(num)) return String(num);
  const rounded = Number(num.toFixed(2));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toString();
};

const parseISODate = (isoString) => {
  if (!isoString) return null;
  const parts = isoString.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map((segment) => Number(segment));
  if ([y, m, d].some((value) => Number.isNaN(value))) return null;
  return new Date(y, m - 1, d);
};

const LeaveCalendar = ({ user }) => {
  const { user: authUser, loading: authLoading, refreshToken } = useAuth() || {};
  const currentUser = user || authUser;

  const today = useMemo(() => new Date(), []);
  const initialYear = today.getFullYear();

  const [profiles, setProfiles] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [calendarData, setCalendarData] = useState({});
  const [summary, setSummary] = useState(() => getEmptySummary());
  const [metadata, setMetadata] = useState({});
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const holidaySet = useMemo(() => new Set(metadata?.holiday_dates || []), [metadata]);
  const sandwichSet = useMemo(() => new Set(metadata?.sandwich_days || []), [metadata]);
  const colorMap = metadata?.color_map || DEFAULT_COLOR_MAP;

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const upper = Math.max(now + 1, selectedYear);
    const lower = Math.min(selectedYear - 3, now - 4);
    const options = [];
    for (let year = upper; year >= lower; year -= 1) {
      options.push(year);
    }
    return options;
  }, [selectedYear]);

  const periodBounds = useMemo(() => {
    if (!metadata?.period?.start || !metadata?.period?.end) {
      return null;
    }
    const start = parseISODate(metadata.period.start);
    const end = parseISODate(metadata.period.end);
    if (!start || !end) {
      return null;
    }
    return { start, end };
  }, [metadata]);

  const monthsOfPeriod = useMemo(() => {
    if (!periodBounds) {
      return [];
    }
    const months = [];
    const cursor = new Date(periodBounds.start.getFullYear(), periodBounds.start.getMonth(), 1);
    while (cursor <= periodBounds.end) {
      const year = cursor.getFullYear();
      const monthIndex = cursor.getMonth();
      months.push({
        key: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
        label: cursor.toLocaleString(undefined, { month: 'long' }),
        monthIndex,
        year,
        daysInMonth: new Date(year, monthIndex + 1, 0).getDate(),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }, [periodBounds]);

  useEffect(() => {
    let cancelled = false;

    const fetchProfiles = async (allowRetry = true) => {
      if (!authUser) {
        setProfiles([]);
        return;
      }
      try {
        const response = await axios.get('/api/empprofile/');
        if (!cancelled) {
          setProfiles(normalize(response.data));
          setError('');
        }
      } catch (err) {
        if (err?.response?.status === 401 && allowRetry && refreshToken) {
          const refreshed = await refreshToken();
          if (refreshed && !cancelled) {
            return fetchProfiles(false);
          }
        }
        if (!cancelled) {
          setProfiles([]);
          if (err?.response?.status === 401) {
            setError('Session expired or unauthorized. Please log in again.');
          }
        }
      }
    };

    if (!authLoading) {
      fetchProfiles();
    }

    return () => {
      cancelled = true;
    };
  }, [authLoading, authUser, refreshToken]);

  useEffect(() => {
    if (selectedEmpId || profiles.length === 0) return;
    const match = profiles.find(
      (p) =>
        String(p.username) === String(currentUser?.username) ||
        String(p.usercode) === String(currentUser?.username) ||
        String(p.emp_id) === String(currentUser?.username)
    );
    if (match) {
      setSelectedEmpId(match.emp_id);
    }
  }, [profiles, currentUser, selectedEmpId]);

  // Filtered profiles by name
  const filteredProfiles = useMemo(() => {
    if (!nameFilter) return profiles;
    const nameLower = nameFilter.toLowerCase();
    return profiles.filter((p) => (p.emp_name || '').toLowerCase().includes(nameLower));
  }, [profiles, nameFilter]);

  const loadCalendar = useCallback(
    async (empId, year) => {
      if (!empId || !year) return;
      setLoading(true);
      setError('');
      setSelectedDate('');
      try {
        const response = await axios.get('/api/reports/leave-calendar/', {
          params: { emp_id: empId, year },
        });
        setCalendarData(response.data.calendar || {});
        setSummary(response.data.summary || getEmptySummary());
        setMetadata(response.data.metadata || {});
        setEmployeeInfo(response.data.employee || null);
      } catch (err) {
        const detail = err?.response?.data?.detail || 'Failed to load leave calendar';
        setError(detail);
        setCalendarData({});
        setSummary(getEmptySummary());
        setMetadata({});
        setEmployeeInfo(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedEmpId && selectedYear) {
      loadCalendar(selectedEmpId, selectedYear);
    }
  }, [selectedEmpId, selectedYear, loadCalendar]);

  const summaryMainEntries = useMemo(
    () => Object.entries(summary?.main || {}).sort((a, b) => a[0].localeCompare(b[0])),
    [summary]
  );
  const summaryBreakdown = summary?.breakdown || {};

  const monthlySummary = useMemo(
    () => metadata?.monthly_summary || {},
    [metadata]
  );

  const legendEntries = useMemo(
    () => Object.entries(colorMap).map(([code, color]) => ({ code, color })),
    [colorMap]
  );

  const refresh = () => {
    if (selectedEmpId && selectedYear) {
      loadCalendar(selectedEmpId, selectedYear);
    }
  };

  const selectedDayData = selectedDate ? calendarData[selectedDate] : null;
  const periodLabel = metadata?.period
    ? `${fmtDate(metadata.period.start)} → ${fmtDate(metadata.period.end)}`
    : selectedYear;

  return (
    <div className="space-y-5 p-4" id="leave-calendar-print">
      <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Annual Planner</p>
            <p className="text-2xl font-semibold">Leave Calendar {selectedYear}</p>
            <p className="text-sm text-slate-300">Holiday, weekend, and sandwich rules are auto-applied.</p>
            {metadata?.period && (
              <p className="text-xs text-slate-400">
                Period: {fmtDate(metadata.period.start)} → {fmtDate(metadata.period.end)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Filter by name"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              className="rounded-full border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur min-w-[160px]"
              style={{ color: 'white', background: 'rgba(255,255,255,0.1)', marginRight: 8 }}
              disabled={loading}
            />
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="rounded-full border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur"
            >
              <option value="" className="text-slate-900">Select Employee</option>
              {filteredProfiles.map((p) => (
                <option key={p.id} value={p.emp_id} className="text-slate-900">
                  {p.emp_id} — {p.emp_name}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-full border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year} className="text-slate-900">
                  {year}
                </option>
              ))}
            </select>

            <button
              onClick={refresh}
              disabled={loading || !selectedEmpId}
              className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow disabled:cursor-not-allowed disabled:bg-amber-200"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>

            <button
              onClick={() => printElement('#leave-calendar-print')}
              className="rounded-full border border-white/40 px-5 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Print
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {employeeInfo && (
        <div className="flex flex-wrap gap-4 rounded-2xl border bg-white p-4 text-sm shadow-sm">
          <div>
            <span className="text-slate-500">Employee</span>
            <div className="font-semibold text-slate-900">
              {employeeInfo.emp_name} ({employeeInfo.emp_id})
            </div>
          </div>
          {employeeInfo.emp_designation && (
            <div>
              <span className="text-slate-500">Designation</span>
              <div className="font-semibold text-slate-900">{employeeInfo.emp_designation}</div>
            </div>
          )}
          {employeeInfo.leave_group && (
            <div>
              <span className="text-slate-500">Group</span>
              <div className="font-semibold text-slate-900">{employeeInfo.leave_group}</div>
            </div>
          )}
          <div>
            <span className="text-slate-500">Holidays</span>
            <div className="font-semibold text-slate-900">{holidaySet.size}</div>
          </div>
          <div>
            <span className="text-slate-500">Sandwich Days</span>
            <div className="font-semibold text-slate-900">{sandwichSet.size}</div>
          </div>
        </div>
      )}

      {!selectedEmpId && (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Pick an employee to render the annual calendar grid.
        </div>
      )}

      {selectedEmpId && (
        <>
          <div className="overflow-auto rounded-2xl border bg-white shadow-sm">
            {monthsOfPeriod.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                {loading
                  ? 'Loading period window…'
                  : `Period window not configured for ${selectedYear}. Update leave periods to render the grid.`}
              </div>
            ) : (
              <table className="min-w-[1100px] w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="border px-3 py-2 text-left">Month</th>
                    {DAY_NUMBERS.map((day) => (
                      <th key={`day-${day}`} className="border px-1 py-1 text-center font-semibold">
                        {day}
                      </th>
                    ))}
                    <th className="border px-3 py-2 text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthsOfPeriod.map((month) => {
                    const monthSummary = monthlySummary[month.key] || {};
                    const monthTotal = Object.entries(monthSummary).reduce((acc, [code, value]) => (
                      code === 'SANDWICH' ? acc : acc + Number(value || 0)
                    ), 0);
                    return (
                      <tr key={month.key} className="odd:bg-white even:bg-slate-50/50">
                        <td className="border px-3 py-2 text-sm font-semibold text-slate-700">
                          {month.label} {month.year}
                        </td>
                        {DAY_NUMBERS.map((day) => {
                          if (day > month.daysInMonth) {
                            return <td key={`${month.key}-${day}`} className="border bg-slate-100" />;
                          }

                          const iso = `${month.year}-${String(month.monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const info = calendarData[iso];
                          const dateObj = new Date(month.year, month.monthIndex, day);
                          const weekend = isWeekend(dateObj);
                          const isHoliday = holidaySet.has(iso);
                          const isSandwich = sandwichSet.has(iso) || info?.leave === 'SANDWICH';
                          const leaveCode = info?.leave || (isHoliday ? 'HOLIDAY' : weekend ? 'WEEKEND' : null);
                          const bg = leaveCode ? colorMap[leaveCode] || '#cbd5f5' : 'transparent';
                          const textColor = leaveCode
                            ? DARK_TEXT_CODES.has(leaveCode)
                              ? '#111827'
                              : '#ffffff'
                            : '#1f2937';
                          const showSandwichBorder = isSandwich && !info;
                          const cellStyle = {
                            background: bg,
                            color: textColor,
                            border: showSandwichBorder
                              ? `2px solid ${colorMap.SANDWICH || '#b7b7b7'}`
                              : undefined,
                          };
                          const tooltipParts = [];
                          if (info?.entries?.length) {
                            tooltipParts.push(`${info.entries.length} record(s)`);
                            info.entries.slice(0, 3).forEach((entry) =>
                              tooltipParts.push(`${entry.leave_type_name} (${entry.status})`)
                            );
                          }
                          if (isHoliday) tooltipParts.push('Holiday');
                          if (weekend) tooltipParts.push('Weekend');
                          if (isSandwich) tooltipParts.push('Sandwich');

                          return (
                            <td
                              key={`${month.key}-${day}`}
                              className={`border px-1 py-1 text-center text-[11px] ${
                                info ? 'font-semibold cursor-pointer' : ''
                              }`}
                              style={cellStyle}
                              title={tooltipParts.join(' • ')}
                              onClick={() => info && setSelectedDate(iso)}
                            >
                              <div className="flex flex-col items-center gap-0.5">
                                <span>{day}</span>
                                {isSandwich && <span className="text-[9px] text-slate-900">SW</span>}
                              </div>
                            </td>
                          );
                        })}
                        <td className="border bg-slate-900/90 px-2 py-2 text-center text-[11px] font-bold text-white">
                          {formatLeaveValue(monthTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-700">Yearly Summary</div>
              {summaryMainEntries.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500">No leave data for {periodLabel}.</p>
              ) : (
                <div className="mt-3 space-y-3 text-sm">
                  {summaryMainEntries.map(([code, value]) => {
                    const breakdownEntries = Object.entries(summaryBreakdown[code] || {})
                      .sort((a, b) => a[0].localeCompare(b[0]));
                    return (
                      <div key={code}>
                        <div className="flex items-center justify-between font-semibold text-slate-800">
                          <span>{code}</span>
                          <span>{formatLeaveValue(value)}</span>
                        </div>
                        {breakdownEntries.length > 0 && (
                          <div className="mt-1 space-y-1 pl-3 text-xs text-slate-500">
                            {breakdownEntries.map(([childCode, childValue]) => (
                              <div key={`${code}-${childCode}`} className="flex items-center justify-between">
                                <span>{childCode}</span>
                                <span className="font-semibold text-slate-700">{formatLeaveValue(childValue)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm lg:col-span-2">
              <div className="text-sm font-semibold text-slate-700">Monthly Breakdown</div>
              <div className="mt-3 overflow-auto">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="border px-2 py-2 text-left">Month</th>
                      {legendEntries.map((legend) => (
                        <th key={`legend-${legend.code}`} className="border px-2 py-2 text-center">
                          {legend.code}
                        </th>
                      ))}
                      <th className="border px-2 py-2 text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthsOfPeriod.length === 0 ? (
                      <tr>
                        <td colSpan={legendEntries.length + 2} className="border px-3 py-4 text-center text-xs text-slate-500">
                          {loading ? 'Loading period window…' : `No period months found for ${selectedYear}.`}
                        </td>
                      </tr>
                    ) : (
                      monthsOfPeriod.map((month) => {
                        const monthSummary = monthlySummary[month.key] || {};
                        const monthTotal = Object.entries(monthSummary).reduce((acc, [code, value]) => (
                          code === 'SANDWICH' ? acc : acc + Number(value || 0)
                        ), 0);
                        return (
                          <tr key={`${month.key}-summary`} className="odd:bg-white even:bg-slate-50/60">
                            <td className="border px-2 py-1 font-semibold text-slate-700">
                              {month.label} {month.year}
                            </td>
                            {legendEntries.map((legend) => (
                              <td key={`${month.key}-${legend.code}`} className="border px-2 py-1 text-center">
                                {formatLeaveValue(monthSummary[legend.code] || 0)}
                              </td>
                            ))}
                            <td className="border px-2 py-1 text-center font-semibold">
                              {formatLeaveValue(monthTotal)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-700">Metadata</div>
              <dl className="mt-3 space-y-2 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <dt>Holidays tracked</dt>
                  <dd className="font-semibold text-slate-900">{holidaySet.size}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Sandwich days</dt>
                  <dd className="font-semibold text-slate-900">{sandwichSet.size}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Weekend rule</dt>
                  <dd className="font-semibold text-slate-900">Sunday only</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-700">Color Legend</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-3">
                {legendEntries.map((legend) => (
                  <div key={`key-${legend.code}`} className="flex items-center gap-2">
                    <span className="inline-flex h-3 w-3 rounded-full" style={{ background: legend.color }} />
                    <span>{legend.code}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {selectedDayData && (
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{fmtDate(selectedDate)}</div>
                  <div className="text-xs text-slate-500">
                    {selectedDayData.entries?.length || (selectedDayData.is_sandwich ? 1 : 0)} record(s)
                  </div>
                </div>
                <button
                  className="text-xs font-semibold text-indigo-600"
                  onClick={() => setSelectedDate('')}
                >
                  Clear
                </button>
              </div>

              {selectedDayData.entries && selectedDayData.entries.length > 0 ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {selectedDayData.entries.map((entry) => (
                    <div key={`${entry.report_no}-${entry.start_date}`} className="rounded-xl border p-3 text-xs">
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
                        <span>{entry.leave_type_name}</span>
                        <span>{entry.status}</span>
                      </div>
                      <div className="mt-1 text-slate-600">
                        {fmtDate(entry.start_date)} → {fmtDate(entry.end_date)}
                      </div>
                      {entry.remark && (
                        <div className="mt-1 text-slate-500">Remark: {entry.remark}</div>
                      )}
                      <div className="mt-1 text-[11px] text-slate-400">Report #{entry.report_no}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-xs text-slate-500">
                  {selectedDayData.is_sandwich ? 'Sandwich day counted automatically.' : 'No leave entries.'}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LeaveCalendar;
