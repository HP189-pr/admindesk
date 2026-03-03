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
  const [instFallback, setInstFallback] = useState({ inst_veri_number: '', rec_inst_name: '' });

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
  const firstInstitutionalVerification =
    (result?.services?.institutional_verification || []).find(
      (row) => (row?.inst_veri_number || '').trim() || (row?.rec_inst_name || '').trim()
    ) || result?.services?.institutional_verification?.[0];
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

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const row = firstInstitutionalVerification;
      if (!row) {
        setInstFallback({ inst_veri_number: '', rec_inst_name: '' });
        return;
      }

      const hasLocal = (row?.inst_veri_number || '').trim() || (row?.rec_inst_name || '').trim();
      if (hasLocal) {
        setInstFallback({
          inst_veri_number: row?.inst_veri_number || '',
          rec_inst_name: row?.rec_inst_name || '',
        });
        return;
      }

      const docRecId = (row?.doc_rec_id || '').trim();
      if (!docRecId) {
        setInstFallback({ inst_veri_number: '', rec_inst_name: '' });
        return;
      }

      try {
        const token = localStorage.getItem('access_token');
        const res = await fetch(`/api/inst-verification-main/?doc_rec=${encodeURIComponent(docRecId)}&limit=1`, {
          headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        const item = Array.isArray(data)
          ? data[0]
          : Array.isArray(data?.results)
          ? data.results[0]
          : null;
        if (!cancelled && item) {
          setInstFallback({
            inst_veri_number: item?.inst_veri_number || '',
            rec_inst_name: item?.rec_inst_name || '',
          });
        }
      } catch {
        if (!cancelled) {
          setInstFallback({ inst_veri_number: '', rec_inst_name: '' });
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [firstInstitutionalVerification]);

  const SERVICE_BG = {
    verification: '#ffebe0',
    provisional: '#fffbe8',
    migration: '#d6eef4',
    degree: '#dcffd1',
    institutional_verification: '#f5f5f5'
  };

  /* ================= UI HELPERS ================= */

  const Field = ({ label, value }) => (
    <div className="flex justify-between text-[12px] text-slate-600">
      <span>{label}</span>
      <span className="font-medium text-slate-800">
        {value !== undefined && value !== null && value !== '' ? value : '-'}
      </span>
    </div>
  );

  const Card = ({ title, count, children, bgColor = '#ffffff', cardClassName = '' }) => (
    <div className={`border border-slate-200 rounded-xl p-3 ${cardClassName}`} style={{ backgroundColor: bgColor }}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-[13px] text-slate-600">{title}</span>
        <span className="text-lg font-semibold text-slate-800">{count}</span>
      </div>
      <div className="border-t border-white/70 pt-2 space-y-1">{children}</div>
    </div>
  );

  /* ================= UI ================= */

  return (
    <div className="fixed right-24 bottom-2 z-30 w-[380px] max-w-full">
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
                <div className="grid grid-cols-2 gap-1 items-stretch min-h-[300px]">
                  <div className="h-full">
                    <Card
                      title={<span className="font-bold">Verification</span>}
                      count={counts.verification}
                      bgColor={SERVICE_BG.verification}
                      cardClassName="min-h-[228px]"
                    >
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
                  </div>

                  <div className="h-full flex flex-col gap-2">
                    <div className="flex-1">
                      <Card
                        title={<span className="font-bold">Provisional</span>}
                        count={counts.provisional}
                        bgColor={SERVICE_BG.provisional}
                      >
                        <Field label="pvr_number" value={provisionalNumbers} />
                        <Field label="pvr_date" value={provisionalDate} />
                      </Card>
                    </div>

                    <div className="flex-1">
                      <Card
                        title={<span className="font-bold">Migration</span>}
                        count={counts.migration}
                        bgColor={SERVICE_BG.migration}
                      >
                        <Field label="mg_number" value={migrationNumbers} />
                        <Field label="mg_date" value={migrationDate} />
                      </Card>
                    </div>
                  </div>

                    {/* Degree — FULL WIDTH */}
                    <div className="col-span-2">
                        <Card
                          title={<span className="font-bold">Degree</span>}
                          count={counts.degree}
                          bgColor={SERVICE_BG.degree}
                        >
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
                        title={<span className="font-bold">Institutional Verification</span>}
                        count={counts.institutional_verification}
                      bgColor={SERVICE_BG.institutional_verification}
                        >
                          <Field
                            label="Letter No"
                            value={firstInstitutionalVerification?.inst_veri_number || instFallback?.inst_veri_number}
                          />
                          <Field
                            label="Verification From"
                            value={firstInstitutionalVerification?.rec_inst_name || instFallback?.rec_inst_name}
                          />
                        </Card>
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
