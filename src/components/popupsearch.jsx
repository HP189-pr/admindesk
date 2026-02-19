import React, { useEffect, useMemo, useState } from 'react';
import {
  FaSearch,
  FaChevronUp,
  FaChevronDown,
  FaUserGraduate,
  FaTimes
} from 'react-icons/fa';
import { searchStudent, formatDate } from '../services/studentSearchService';

const PopupSearch = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  /* ================= LOGIC (UNCHANGED) ================= */

  useEffect(() => {
    const trimmed = query.trim();
    if (!open) return;
    if (!trimmed) {
      setResult(null);
      setError('');
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await searchStudent(trimmed);
        setResult(data);
      } catch (err) {
        setResult(null);
        setError(err?.message || 'Search failed');
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, open]);

  const general = result?.general || {};
  const counts = useMemo(
    () => ({
      verification: result?.services?.verification?.length || 0,
      provisional: result?.services?.provisional?.length || 0,
      migration: result?.services?.migration?.length || 0,
      institutional_verification:
        result?.services?.institutional_verification?.length || 0,
      degree: result?.services?.degree?.length || 0
    }),
    [result]
  );

  const firstVerification = result?.services?.verification?.[0];
  const firstProvisional = result?.services?.provisional?.[0];
  const firstMigration = result?.services?.migration?.[0];
  const firstDegree = result?.services?.degree?.[0];

  // Join multiple values with comma
  const finalNos = (result?.services?.verification || [])
    .map(v => v.final_no)
    .filter(Boolean)
    .join(', ') || '-';

  const provisionalNumbers = (result?.services?.provisional || [])
    .map(p => p.prv_number || p.final_no)
    .filter(Boolean)
    .join(', ') || '-';
  const provisionalDate = formatDate(
    firstProvisional?.prv_date || firstProvisional?.date
  );

  const migrationNumbers = (result?.services?.migration || [])
    .map(m => m.mg_number || m.final_no)
    .filter(Boolean)
    .join(', ') || '-';
  const migrationDate = formatDate(
    firstMigration?.mg_date || firstMigration?.date
  );

  /* ================= UI HELPERS ================= */

  const Field = ({ label, value }) => (
    <div className="flex justify-between text-[12px] text-slate-600">
      <span>{label}</span>
      <span className="font-medium text-slate-800">
        {value !== undefined && value !== null && value !== '' ? value : '-'}
      </span>
    </div>
  );

  const Card = ({ title, count, children }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[13px] text-slate-600">{title}</span>
        <span className="text-lg font-semibold text-slate-800">{count}</span>
      </div>
      <div className="border-t pt-2 space-y-1">{children}</div>
    </div>
  );

  /* ================= UI ================= */

  return (
    <div className="fixed right-4 bottom-4 z-40 w-[380px] max-w-full">
      <div className="bg-white border shadow-xl rounded-2xl overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-2 bg-indigo-600 text-white cursor-pointer"
          onClick={() => setOpen(!open)}
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center">
              <FaUserGraduate />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Student Search</div>
              <div className="text-[11px] text-indigo-100">
                Type Name, Enrollment No, Temp Enrollment No
              </div>
            </div>
          </div>
          {open ? <FaChevronDown /> : <FaChevronUp />}
        </div>

        {open && (
          <div className="p-4 space-y-3">
            {/* Search */}
            <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50">
              <FaSearch className="text-slate-400" />
              <input
                className="flex-1 bg-transparent outline-none text-sm"
                placeholder="Search student…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button onClick={() => setQuery('')}>
                  <FaTimes className="text-slate-400" />
                </button>
              )}
            </div>

            {loading && <div className="text-sm text-indigo-600">Searching…</div>}
            {error && <div className="text-sm text-rose-600">{error}</div>}

            {result && !loading && !error && (
              <>
                {/* Student Header */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                  <div className="flex justify-between items-center">
                    <div className="text-[13px] font-semibold text-slate-800 uppercase">
                      {general.student_name || '-'}
                    </div>
                    <span className="text-[11px] bg-white border border-slate-300 px-2 py-0.5 rounded-full">
                      {general.enrollment_no || general.temp_enrollment_no}
                    </span>
                  </div>
                </div>

                                    {/* GRID */}
                    <div className="grid grid-cols-2 gap-2">
                    {/* Verification */}
                    <Card title="Verification" count={counts.verification}>
                        <div className="grid grid-cols-6 gap-1 text-[12px] text-slate-700">
                        <span>TR</span><span>{firstVerification?.tr_count ?? '-'}</span>
                        <span>MS</span><span>{firstVerification?.ms_count ?? '-'}</span>
                        <span>DG</span><span>{firstVerification?.dg_count ?? '-'}</span>
                        </div>
                        <Field label="Final No" value={finalNos} />
                        <Field label="ECA Name" value={firstVerification?.eca_name} />
                        <Field label="ECA REF NO" value={firstVerification?.eca_ref_no} />
                        <Field
                        label="ECA SEND DATE"
                        value={formatDate(firstVerification?.eca_send_date)}
                        />
                        <Field label="ECA Status" value={firstVerification?.eca_status} />
                    </Card>

                    {/* Provisional + Migration */}
                    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
                        {/* Provisional */}
                        <div>
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[13px] text-slate-600">Provisional</span>
                            <span className="text-lg font-semibold text-slate-800">
                            {counts.provisional}
                            </span>
                        </div>
                        <div className="border-t pt-2 space-y-1">
                            <Field label="pvr_number" value={provisionalNumbers} />
                            <Field label="pvr_date" value={provisionalDate} />
                        </div>
                        </div>

                        {/* Migration */}
                        <div className="border-t pt-2">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[13px] text-slate-600">Migration</span>
                            <span className="text-lg font-semibold text-slate-800">
                            {counts.migration}
                            </span>
                        </div>
                        <div className="border-t pt-2 space-y-1">
                            <Field label="mg_number" value={migrationNumbers} />
                            <Field label="mg_date" value={migrationDate} />
                        </div>
                        </div>
                    </div>

                    {/* Degree — FULL WIDTH */}
                    <div className="col-span-2">
                        <Card title="Degree" count={counts.degree}>
                        <Field
                            label="Convocation No"
                            value={firstDegree?.convocation_no}
                        />
                        <Field
                            label="Convocation Month-Year"
                            value={firstDegree?.convocation_period}
                        />
                        <Field
                          label="Class Obtain"
                          value={firstDegree?.class_obtain}
                        />
                        </Card>
                    </div>

                    {/* Inst-Verification — FULL WIDTH */}
                    <div className="col-span-2">
                        <Card
                        title="Inst-Verification"
                        count={counts.institutional_verification}
                        />
                    </div>
                    </div>


                <div className="text-[11px] text-slate-500">
                  Auto-search runs after you stop typing.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PopupSearch;
