import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaFileExcel, FaFilePdf } from "react-icons/fa6";
import PageTopbar from "../components/PageTopbar";
import { isoToDMY } from "../utils/date";
import {
  fetchExamScheduleEmployees,
  generateExamSchedule,
} from "../services/exam_service";
import {
  buildExamScheduleDutySubtitle,
  buildExamScheduleFilename,
  buildExamScheduleGroups,
  buildExamScheduleHeading,
  exportExamScheduleExcel,
  exportExamSchedulePDF,
  getDutyTimingValue,
} from "../utils/examScheduleExport";

const ACTIONS = ["Schedule"];
const DEFAULT_RIGHTS = {
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
};
const EXPORT_EXCEL_BUTTON_CLASS = "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 shadow transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60";
const EXPORT_PDF_BUTTON_CLASS = "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 shadow transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60";

const createInitialForm = () => ({
  startDate: new Date().toISOString().slice(0, 10),
  daysPerPhase: "6",
  phaseCount: "2",
  dutyTiming: "9.30 AM To 5.00 PM",
});

const emptyResult = {
  rows: [],
  skipped_dates: [],
  holidays: [],
  metadata: null,
};

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.detail || error?.message || fallback;

const ExamManage = ({
  rights = DEFAULT_RIGHTS,
  onToggleSidebar,
  onToggleChatbox,
}) => {
  const [selectedAction, setSelectedAction] = useState(ACTIONS[0]);
  const [formState, setFormState] = useState(createInitialForm);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeError, setEmployeeError] = useState("");
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(emptyResult);
  const [flash, setFlash] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!flash?.text) return undefined;
    const timer = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [flash]);

  const loadEmployees = useCallback(async (attempt = 0) => {
    if (!rights.can_view) return;

    setLoadingEmployees(true);
    if (attempt === 0) {
      setEmployeeError("");
    }

    try {
      const rows = await fetchExamScheduleEmployees();
      if (!isMountedRef.current) return;
      setEmployees(rows);
      setEmployeeError("");
    } catch (error) {
      if (!isMountedRef.current) return;
      const message = getErrorMessage(error, "Failed to load employees.");
      const statusCode = error?.response?.status || 0;
      setEmployeeError(message);

      const shouldRetry = attempt < 2 && [0, 404, 502, 503, 504].includes(statusCode);
      if (shouldRetry) {
        window.setTimeout(() => {
          if (isMountedRef.current) {
            loadEmployees(attempt + 1);
          }
        }, 1200 * (attempt + 1));
      } else {
        setFlash({
          type: "error",
          text: message,
        });
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingEmployees(false);
      }
    }
  }, [rights.can_view]);

  useEffect(() => {
    if (!rights.can_view) return;
    loadEmployees();
  }, [rights.can_view, loadEmployees]);

  const selectedEmployeeSet = useMemo(
    () => new Set(selectedEmployeeIds),
    [selectedEmployeeIds]
  );

  const selectionIndexById = useMemo(() => {
    const map = {};
    selectedEmployeeIds.forEach((empId, index) => {
      map[empId] = index + 1;
    });
    return map;
  }, [selectedEmployeeIds]);

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) => {
      const haystack = [
        employee.emp_id,
        employee.emp_name,
        employee.emp_designation,
        employee.status,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [employees, employeeSearch]);

  const selectedEmployees = useMemo(() => {
    const employeeMap = new Map(employees.map((employee) => [employee.emp_id, employee]));
    return selectedEmployeeIds
      .map((employeeId) => employeeMap.get(employeeId))
      .filter(Boolean);
  }, [employees, selectedEmployeeIds]);
  const dutyTiming = useMemo(() => getDutyTimingValue(formState.dutyTiming), [formState.dutyTiming]);
  const scheduleGroups = useMemo(
    () => buildExamScheduleGroups(result.rows, dutyTiming),
    [result.rows, dutyTiming]
  );
  const scheduleHeading = useMemo(() => buildExamScheduleHeading(result.metadata), [result.metadata]);
  const scheduleDutySubtitle = useMemo(
    () => buildExamScheduleDutySubtitle(dutyTiming),
    [dutyTiming]
  );

  const orderedSkippedDates = useMemo(() => {
    const rows = Array.isArray(result.skipped_dates) ? [...result.skipped_dates] : [];
    return rows.sort((left, right) => {
      const leftOrder = selectionIndexById[left.employee_no] || Number.MAX_SAFE_INTEGER;
      const rightOrder = selectionIndexById[right.employee_no] || Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      if ((left.phase || 0) !== (right.phase || 0)) {
        return (left.phase || 0) - (right.phase || 0);
      }
      return String(left.date || "").localeCompare(String(right.date || ""));
    });
  }, [result.skipped_dates, selectionIndexById]);

  const toggleEmployee = (employeeId) => {
    setSelectedEmployeeIds((prev) => {
      if (prev.includes(employeeId)) {
        return prev.filter((id) => id !== employeeId);
      }
      return [...prev, employeeId];
    });
  };

  const selectAllFiltered = () => {
    setSelectedEmployeeIds((prev) => {
      const next = [...prev];
      const seen = new Set(prev);
      filteredEmployees.forEach((employee) => {
        if (!seen.has(employee.emp_id)) {
          seen.add(employee.emp_id);
          next.push(employee.emp_id);
        }
      });
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedEmployeeIds([]);
  };

  const handleGenerate = async () => {
    if (!formState.startDate) {
      setFlash({ type: "error", text: "Start Date is required." });
      return;
    }
    if (!selectedEmployeeIds.length) {
      setFlash({ type: "error", text: "Select at least one employee." });
      return;
    }

    const daysPerPhase = Number(formState.daysPerPhase);
    const phaseCount = Number(formState.phaseCount);
    if (!daysPerPhase || daysPerPhase < 1 || !phaseCount || phaseCount < 1) {
      setFlash({
        type: "error",
        text: "Number of Days per phase and Number of Phases must both be greater than zero.",
      });
      return;
    }

    setGenerating(true);
    try {
      const payload = await generateExamSchedule({
        start_date: formState.startDate,
        days_per_phase: daysPerPhase,
        phase_count: phaseCount,
        employee_ids: selectedEmployeeIds,
      });
      setResult({
        rows: Array.isArray(payload.rows) ? payload.rows : [],
        skipped_dates: Array.isArray(payload.skipped_dates) ? payload.skipped_dates : [],
        holidays: Array.isArray(payload.holidays) ? payload.holidays : [],
        metadata: payload.metadata || null,
      });
      setFlash({ type: "success", text: "Schedule generated successfully." });
    } catch (error) {
      setFlash({
        type: "error",
        text: getErrorMessage(error, "Failed to generate schedule."),
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleExportExcel = useCallback(() => {
    if (!result.rows.length) return;
    exportExamScheduleExcel({
      rows: result.rows,
      metadata: result.metadata,
      dutyTiming,
      filename: buildExamScheduleFilename(result.metadata, "xlsx"),
    });
  }, [result.rows, result.metadata, dutyTiming]);

  const handleExportPDF = useCallback(() => {
    if (!result.rows.length) return;
    exportExamSchedulePDF({
      rows: result.rows,
      metadata: result.metadata,
      dutyTiming,
      filename: buildExamScheduleFilename(result.metadata, "pdf"),
    });
  }, [result.rows, result.metadata, dutyTiming]);

  return (
    <div className="h-full space-y-4 bg-slate-100 p-2 md:p-3">
      <PageTopbar
        title="Exam Management"
        actions={ACTIONS}
        selected={selectedAction}
        onSelect={setSelectedAction}
        onToggleSidebar={onToggleSidebar}
        onToggleChatbox={onToggleChatbox}
        actionsOnLeft
        leftSlot={
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl text-white">
            🗓️
          </div>
        }
      />

      {flash?.text && (
        <div
          className={[
            "rounded-2xl border px-4 py-2 text-sm shadow-sm",
            flash.type === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700",
          ].join(" ")}
        >
          {flash.text}
        </div>
      )}

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Schedule Setup</h3>
            <p className="text-sm text-slate-500">
              Select employees, define the schedule window, and generate phase-wise duty rows.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !rights.can_view}
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? "Generating..." : "Generate Schedule"}
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Start Date</label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={formState.startDate}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, startDate: event.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Days Per Phase</label>
            <input
              type="number"
              min="1"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={formState.daysPerPhase}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, daysPerPhase: event.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Number Of Phases</label>
            <input
              type="number"
              min="1"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={formState.phaseCount}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, phaseCount: event.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Duty Timing</label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={formState.dutyTiming}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, dutyTiming: event.target.value }))
              }
              placeholder="9.30 AM To 5.00 PM"
            />
          </div>
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Employees</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{selectedEmployeeIds.length}</div>
            <div className="text-xs text-slate-500">Selection order is used while generating each phase.</div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Employees</h3>
              <p className="text-sm text-slate-500">Loaded from EmpProfile for multi-selection.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {employees.length} available
              </span>
              <button
                type="button"
                onClick={() => loadEmployees()}
                disabled={loadingEmployees}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingEmployees ? "Loading..." : "Reload Employees"}
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {employeeError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {employeeError}
              </div>
            )}
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Search employee no, name, or designation"
              value={employeeSearch}
              onChange={(event) => setEmployeeSearch(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAllFiltered}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Select Filtered
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Clear Selection
              </button>
            </div>

            {selectedEmployees.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Selected Order
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedEmployees.map((employee, index) => (
                    <button
                      key={employee.emp_id}
                      type="button"
                      onClick={() => toggleEmployee(employee.emp_id)}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200"
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-semibold text-white">
                        {index + 1}
                      </span>
                      <span>{employee.emp_id}</span>
                      <span className="text-slate-400">{employee.emp_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loadingEmployees ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Loading employees...
              </div>
            ) : (
              <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-200">
                {filteredEmployees.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">No employees match the current search.</div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {filteredEmployees.map((employee) => {
                      const selectedIndex = selectionIndexById[employee.emp_id];
                      return (
                        <label
                          key={employee.emp_id}
                          className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600"
                            checked={selectedEmployeeSet.has(employee.emp_id)}
                            onChange={() => toggleEmployee(employee.emp_id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-slate-900">{employee.emp_id}</span>
                              {selectedIndex ? (
                                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                                  #{selectedIndex}
                                </span>
                              ) : null}
                            </div>
                            <div className="truncate text-sm text-slate-700">{employee.emp_name}</div>
                            <div className="text-xs text-slate-500">
                              {employee.emp_designation || "No designation"}
                              {employee.status ? ` • ${employee.status}` : ""}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Exam Schedule</h3>
              <p className="text-sm text-slate-500">
                Phase generation runs sequentially, then the display is grouped employee-wise in the export format.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {result.metadata && (
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  Start {isoToDMY(result.metadata.start_date)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  End {isoToDMY(result.metadata.schedule_end_date)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  {result.metadata.phase_count} phase(s)
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  {result.metadata.days_per_phase} working day(s) / phase
                </span>
                </div>
              )}
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={!result.rows.length}
                className={EXPORT_EXCEL_BUTTON_CLASS}
                aria-label="Export Excel"
                title="Export Excel"
              >
                <FaFileExcel size={20} color="#1D6F42" />
              </button>
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={!result.rows.length}
                className={EXPORT_PDF_BUTTON_CLASS}
                aria-label="Export PDF"
                title="Export PDF"
              >
                <FaFilePdf size={20} color="#D32F2F" />
              </button>
            </div>
          </div>

          {!result.rows.length ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
              Generate a schedule to see employee-wise phase rows here.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-4 text-center">
                  <h4 className="text-xl font-semibold text-slate-900">{scheduleHeading}</h4>
                  <p className="mt-1 text-sm font-medium text-slate-600">{scheduleDutySubtitle}</p>
                </div>
                <div className="overflow-auto p-4">
                  <table className="min-w-full table-fixed border-collapse text-sm text-slate-900">
                    <thead>
                      <tr className="bg-white">
                        <th className="border border-black px-4 py-3 text-center text-[15px] font-bold">No</th>
                        <th className="border border-black px-4 py-3 text-center text-[15px] font-bold">Start Date</th>
                        <th className="border border-black px-4 py-3 text-center text-[15px] font-bold">End Date</th>
                        <th className="border border-black px-4 py-3 text-center text-[15px] font-bold">Time</th>
                        <th className="border border-black px-4 py-3 text-center text-[15px] font-bold">Name</th>
                        <th className="border border-black px-4 py-3 text-center text-[15px] font-bold">Sign</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleGroups.map((group) =>
                        group.phases.map((phase, phaseIndex) => (
                          <tr key={`${group.employeeNo || group.employeeName}-${phase.phase}-${phaseIndex}`}>
                            {phaseIndex === 0 && (
                              <td
                                rowSpan={group.phases.length}
                                className="border border-black px-4 py-3 text-center align-middle text-base font-semibold"
                              >
                                {group.serial}
                              </td>
                            )}
                            <td className="border border-black px-4 py-3 text-center text-base font-semibold">
                              {isoToDMY(phase.startDate)}
                            </td>
                            <td className="border border-black px-4 py-3 text-center text-base font-semibold">
                              {isoToDMY(phase.endDate)}
                            </td>
                            {phaseIndex === 0 && (
                              <td
                                rowSpan={group.phases.length}
                                className="border border-black px-4 py-3 text-center align-middle text-base font-semibold"
                              >
                                {group.dutyTiming}
                              </td>
                            )}
                            {phaseIndex === 0 && (
                              <td
                                rowSpan={group.phases.length}
                                className="border border-black px-4 py-3 text-center align-middle text-base font-semibold"
                              >
                                {group.employeeName}
                              </td>
                            )}
                            {phaseIndex === 0 && (
                              <td
                                rowSpan={group.phases.length}
                                className="border border-black px-4 py-3 align-middle"
                              >
                                &nbsp;
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-2xl border border-slate-200">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <h4 className="font-semibold text-slate-900">Excluded Dates</h4>
                    <p className="text-xs text-slate-500">
                      Sundays and holidays skipped while calculating each employee phase.
                    </p>
                  </div>
                  {orderedSkippedDates.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">No Sundays or holidays were skipped for this schedule.</div>
                  ) : (
                    <div className="max-h-[320px] overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left">Employee</th>
                            <th className="px-3 py-2 text-left">Phase</th>
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-left">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderedSkippedDates.map((row, index) => (
                            <tr key={`${row.employee_no}-${row.phase}-${row.date}-${index}`} className="border-t border-slate-200">
                              <td className="px-3 py-2 text-slate-700">
                                <div className="font-medium text-slate-900">{row.employee_no}</div>
                                <div className="text-xs text-slate-500">{row.employee_name}</div>
                              </td>
                              <td className="px-3 py-2 text-slate-700">Phase {row.phase}</td>
                              <td className="px-3 py-2 text-slate-700">{isoToDMY(row.date)}</td>
                              <td className="px-3 py-2 text-slate-700">{(row.reasons || []).join(", ")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="font-semibold text-slate-900">Holiday Dates Used</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Existing Holiday records considered within the generated range.
                  </p>
                  {result.holidays.length === 0 ? (
                    <div className="mt-4 text-sm text-slate-500">No holidays fell inside this generated schedule window.</div>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {result.holidays.map((holiday) => (
                        <div key={`${holiday.date}-${holiday.holiday_name}`} className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
                          <div className="text-sm font-semibold text-slate-900">{isoToDMY(holiday.date)}</div>
                          <div className="text-xs text-slate-600">{holiday.holiday_name || "Holiday"}</div>
                          {holiday.holiday_day ? (
                            <div className="text-[11px] uppercase tracking-wide text-slate-400">{holiday.holiday_day}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ExamManage;