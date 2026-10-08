// src/components/popupsearch.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  FaUserGraduate,
  FaGraduationCap,
  FaChevronDown,
  FaChevronUp,
  FaTimes
} from 'react-icons/fa';
import SearchField from './SearchField';
import StudentStatusIndicator from './StudentStatusIndicator';
import { searchStudent, formatDate } from '../services/studentSearchService';

const PopupSearch = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [instFallback, setInstFallback] = useState({ inst_veri_number: '', inst_veri_date: '', rec_inst_name: '' });

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

  const formatProvisionalNumber = (value) => {
    const text = String(value || '').trim();
    const erpMatch = text.match(/^KSV\/PRO\/(\d{4})\/(\d+)$/i);
    return erpMatch ? `${erpMatch[1]}/${erpMatch[2]}` : (text || '-');
  };

  const provisionalNumbers = (result?.services?.provisional || [])
    .map(p => p.prv_number || p.final_no)
    .filter(Boolean)
    .map(formatProvisionalNumber)
    .join(', ') || '-';
  const provisionalDate = formatDate(
    firstProvisional?.prv_date || firstProvisional?.date
  );
  const provisionalClass = firstProvisional?.class_obtain || '-';

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
        setInstFallback({ inst_veri_number: '', inst_veri_date: '', rec_inst_name: '' });
        return;
      }

      const hasLocal = (row?.inst_veri_number || '').trim() || (row?.rec_inst_name || '').trim();
      if (hasLocal) {
        setInstFallback({
          inst_veri_number: row?.inst_veri_number || '',
          inst_veri_date: row?.date || row?.inst_veri_date || '',
          rec_inst_name: row?.rec_inst_name || '',
        });
        return;
      }

      const docRecId = (row?.doc_rec_id || '').trim();
      if (!docRecId) {
        setInstFallback({ inst_veri_number: '', inst_veri_date: '', rec_inst_name: '' });
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
            inst_veri_date: item?.inst_veri_date || '',
            rec_inst_name: item?.rec_inst_name || '',
          });
        }
      } catch {
        if (!cancelled) {
          setInstFallback({ inst_veri_number: '', inst_veri_date: '', rec_inst_name: '' });
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
      <span className="min-w-0 max-w-[68%] break-words text-right font-medium text-slate-800">
        {value !== undefined && value !== null && value !== '' ? value : '-'}
      </span>
    </div>
  );

  const Card = ({ title, count, children, bgColor = '#ffffff', cardClassName = '' }) => (
    <div className={`h-full border border-slate-200 rounded-xl p-3 ${cardClassName}`} style={{ backgroundColor: bgColor }}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-[13px] text-slate-600">{title}</span>
        <span className="text-lg font-semibold text-slate-800">{count}</span>
      </div>
      <div className="border-t border-white/70 pt-2 space-y-1">{children}</div>
    </div>
  );

  const ClassHighlight = ({ value, tone = 'amber' }) => {
    const toneClasses = tone === 'green'
      ? 'border-green-300 bg-green-50 text-green-900 text-green-700'
      : 'border-amber-300 bg-amber-50 text-amber-900 text-amber-700';
    const [borderClass, backgroundClass, textClass, iconClass] = toneClasses.split(' ');
    return (
      <div className={`mt-1 flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-center text-[11px] font-bold uppercase leading-tight ${borderClass} ${backgroundClass} ${textClass}`}>
        <FaGraduationCap className={`shrink-0 text-lg ${iconClass}`} aria-hidden="true" />
        <span>{value || '-'}</span>
      </div>
    );
  };

  /* ================= UI ================= */

  return (
    <div className={`fixed right-2 bottom-4 z-[60] ${open ? 'w-[calc(100vw-1rem)] max-w-[520px] max-h-[calc(100vh-5rem)]' : 'w-14 h-14'}`}>
      <div className={open ? 'flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden rounded-2xl border bg-white shadow-xl' : 'w-fit ml-auto'}>
        {/* Header */}
        <div
          className={
            open
              ? 'flex items-center justify-between px-4 py-2 bg-indigo-600 text-white cursor-pointer'
              : 'flex items-center justify-center h-14 w-14 bg-indigo-600 text-white cursor-pointer rounded-full shadow-xl'
          }
          onClick={() => setOpen(!open)}
        >
          <div className={`flex items-center ${open ? 'gap-3' : 'justify-center w-full'}`}>
            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center">
              <FaUserGraduate />
            </div>
            {open && (
              <div className="leading-tight">
                <div className="text-sm font-semibold">Student Search</div>
                <div className="text-[11px] text-indigo-100">
                  Type Name, Enrollment No, Temp Enrollment No
                </div>
              </div>
            )}
          </div>
          {open && (
              <span aria-hidden="true" className="text-xl leading-none">«</span>
            )}
        </div>

        {open && (
          <div className="min-h-0 overflow-y-auto p-3 space-y-3 sm:p-4">
            {/* Search */}
            <div className="relative">
              <SearchField
                className="w-full"
                inputClassName="border-slate-200 bg-slate-50 pr-10 text-sm"
                placeholder="Search student…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
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
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-[13px] font-semibold uppercase text-slate-800">
                      {general.student_name || '-'}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px]">
                        {general.enrollment_no || general.temp_enrollment_no}
                      </span>
                      <StudentStatusIndicator status={general.status} cancel={general.cancel} />
                      <button
                        type="button"
                        onClick={() => setDetailsExpanded((expanded) => !expanded)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-indigo-700"
                        aria-label={detailsExpanded ? 'Collapse student details' : 'Expand student details'}
                        aria-expanded={detailsExpanded}
                      >
                        {detailsExpanded ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
                      </button>
                    </div>
                  </div>
                </div>

                {detailsExpanded ? (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                    <div className="mb-2 text-[13px] font-bold text-slate-700">Student Details</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                      <Field label="Batch" value={general.batch} />
                      <Field label="Gender" value={general.gender} />
                      <Field label="Birth Date" value={formatDate(general.birth_date)} />
                      <Field label="Category" value={general.category} />
                      <Field label="Temp Enrollment No" value={general.temp_enroll_no || general.temp_enrollment_no} />
                      <Field label="Mother Name" value={general.mother_name} />
                      <Field label="Father Name" value={general.father_name} />
                      <Field label="Admission Date" value={formatDate(general.admission_date)} />
                      <Field label="Hostel Required" value={general.hostel_required ? 'Yes' : 'No'} />
                      <Field label="Aadhaar No" value={general.aadhar_no} />
                      <Field label="ABC ID" value={general.abc_id} />
                      <Field label="Contact" value={general.contact_no} />
                      <Field label="Email" value={general.email} />
                      <Field label="Institute Code" value={general.institute_code} />
                    </div>
                  </div>
                ) : (
                /* GRID */
                <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-2 sm:grid-rows-[200px_160px_auto]">
                  <div className="h-full">
                    <Card
                      title={<span className="font-bold">Verification</span>}
                      count={counts.verification}
                      bgColor={SERVICE_BG.verification}
                      cardClassName="min-h-[210px] sm:min-h-0"
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

                  <div className="h-full">
                    <Card
                      title={<span className="font-bold">Degree</span>}
                      count={counts.degree}
                      bgColor={SERVICE_BG.degree}
                      cardClassName="min-h-[210px] sm:min-h-0"
                    >
                      <Field label="Convocation No" value={firstDegree?.convocation_no} />
                      <Field label="Convocation Month-Year" value={firstDegree?.convocation_period} />
                      <div className="flex justify-between gap-2 text-[12px] text-slate-600">
                        <span>Class Obtain</span>
                      </div>
                      <ClassHighlight value={firstDegree?.class_obtain} tone="green" />
                    </Card>
                  </div>

                  <div className="h-full">
                    <Card
                      title={<span className="font-bold">Migration</span>}
                      count={counts.migration}
                      bgColor={SERVICE_BG.migration}
                      cardClassName="min-h-[190px] sm:min-h-0"
                    >
                      <Field label="mg_number" value={migrationNumbers} />
                      <Field label="mg_date" value={migrationDate} />
                    </Card>
                  </div>

                  <div className="h-full">
                    <Card
                      title={<span className="font-bold">Provisional</span>}
                      count={counts.provisional}
                      bgColor={SERVICE_BG.provisional}
                      cardClassName="min-h-[190px] sm:min-h-0"
                    >
                      <Field label="pvr_number" value={provisionalNumbers} />
                      <Field label="pvr_date" value={provisionalDate} />
                      <ClassHighlight value={provisionalClass} />
                    </Card>
                  </div>

                  {/* Inst-Verification — FULL WIDTH */}
                  <div className="col-span-1 sm:col-span-2">
                        <Card
                        title={<span className="font-bold">Institutional Verification</span>}
                        count={counts.institutional_verification}
                      bgColor={SERVICE_BG.institutional_verification}
                        >
                          <div className="grid grid-cols-2 gap-x-4">
                            <Field
                              label="Letter No"
                              value={firstInstitutionalVerification?.inst_veri_number || instFallback?.inst_veri_number}
                            />
                            <Field
                              label="Inst Veri Date"
                              value={formatDate(
                                firstInstitutionalVerification?.inst_veri_date ||
                                firstInstitutionalVerification?.date ||
                                instFallback?.inst_veri_date
                              )}
                            />
                          </div>
                          <Field
                            label="Verification From"
                            value={firstInstitutionalVerification?.rec_inst_name || instFallback?.rec_inst_name}
                          />
                        </Card>
                    </div>
                    </div>
                  )}


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
