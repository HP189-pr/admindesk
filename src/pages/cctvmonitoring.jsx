import React, { useEffect, useMemo, useState } from "react";
import PageTopbar from "../components/PageTopbar";
import {
  getExams,
  createCentre,
  getCentres,
  createOutward,
  getOutward,
  getDVDs,
  assignCcNumbers,
  updateOutward,
  deleteOutward,
  syncCctvExamsFromSheet,
  syncCctvFromSheet,
} from "../services/cctvservice";

const ACTIONS = ["CCTV Monitoring", "CCTV-Outward"];
const EXAM_SESSIONS = ["2026-1", "2026-2", "2027-1", "2027-2", "2028-1", "2028-2"];
const DEFAULT_PLACES = ["Kadi", "15-LDRP", "15VSITR", "23", "12"];

const CCTVMonitoring = ({
  rights = { can_view: true, can_create: true, can_edit: true, can_delete: true },
  onToggleSidebar,
  onToggleChatbox,
}) => {
  const [exams, setExams] = useState([]);
  const [centres, setCentres] = useState([]);
  const [dvds, setDvds] = useState([]);
  const [outwards, setOutwards] = useState([]);
  const [selectedAction, setSelectedAction] = useState(ACTIONS[0]);
  const [selectedSession, setSelectedSession] = useState("2026-1");
  const [sessionByExam, setSessionByExam] = useState({});
  const [placeInputByKey, setPlaceInputByKey] = useState({});
  const [irregularityByKey, setIrregularityByKey] = useState({});
  const [ccRequestByKey, setCcRequestByKey] = useState({});
  const [syncing, setSyncing] = useState(false);
  const [flash, setFlash] = useState(null);

  const [centreForm] = useState({
    exam: "",
    place: "",
    session: "A",
    no_of_cd: "",
  });

  const [outwardForm, setOutwardForm] = useState({
    outward_date: "",
    cctv_record_no: "",
    college_name: "",
    centre_name: "",
    exam_on: "",
    last_date: "",
    cc_start_label: "",
    cc_end_label: "",
    no_of_dvd: "",
    no_of_report: "",
    return_received: false,
    case_found: false,
    case_type: "",
    case_details: "",
    remark: "",
    id: null,
  });

  // ============================
  // Load Exams
  // ============================

  useEffect(() => {
    fetchExams();
    fetchCentres();
    fetchDvds();
    fetchOutwards();
  }, []);

  const fetchExams = async () => {
    try {
      const res = await getExams();
      const data = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.data?.results)
        ? res.data.results
        : [];
      setExams(data);
    } catch (err) {
      setExams([]);
      const msg = err?.response?.data?.detail || err.message || "Failed to load exams.";
      setFlashMessage("error", msg);
    }
  };

  const fetchCentres = async () => {
    try {
      const res = await getCentres();
      const data = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.data?.results)
        ? res.data.results
        : [];
      setCentres(data);
    } catch (err) {
      setCentres([]);
      const msg = err?.response?.data?.detail || err.message || "Failed to load centres.";
      setFlashMessage("error", msg);
    }
  };

  const fetchDvds = async () => {
    try {
      const res = await getDVDs();
      const data = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.data?.results)
        ? res.data.results
        : [];
      setDvds(data);
    } catch (err) {
      setDvds([]);
      const msg = err?.response?.data?.detail || err.message || "Failed to load DVDs.";
      setFlashMessage("error", msg);
    }
  };

  const fetchOutwards = async () => {
    try {
      const res = await getOutward();
      const data = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.data?.results)
        ? res.data.results
        : [];
      setOutwards(data);
    } catch (err) {
      setOutwards([]);
      const msg = err?.response?.data?.detail || err.message || "Failed to load outwards.";
      setFlashMessage("error", msg);
    }
  };

  const selectedExam = useMemo(() => {
    const selectedId = outwardForm.exam;
    if (selectedId) {
      return exams.find((exam) => String(exam.id) === String(selectedId)) || null;
    }
    return exams.length ? exams[0] : null;
  }, [outwardForm.exam, exams]);

  const examSession = selectedSession || selectedExam?.exam_year_session || "";

  const examsById = useMemo(() => {
    const map = {};
    exams.forEach((exam) => {
      map[String(exam.id)] = exam;
    });
    return map;
  }, [exams]);

  const placeColumns = useMemo(() => {
    const set = new Set(DEFAULT_PLACES);
    centres.forEach((row) => {
      if (row?.place) set.add(String(row.place).trim());
    });
    return Array.from(set);
  }, [centres]);

  const centresByExamSession = useMemo(() => {
    const map = {};
    centres.forEach((row) => {
      const exam = examsById[String(row.exam)];
      if (!exam) return;
      const key = `${exam.exam_date}:${exam.course}:${row.session}`;
      if (!map[key]) map[key] = [];
      map[key].push(row);
    });
    Object.keys(map).forEach((key) => {
      map[key] = map[key].slice().sort((a, b) => {
        const aStart = a.start_number || 0;
        const bStart = b.start_number || 0;
        return aStart - bStart;
      });
    });
    return map;
  }, [centres, examsById]);

  const dvdsByCentreId = useMemo(() => {
    const map = {};
    dvds.forEach((dvd) => {
      const key = String(dvd.centre);
      if (!map[key]) map[key] = [];
      map[key].push(dvd);
    });
    return map;
  }, [dvds]);

  const groupedExams = useMemo(() => {
    const groups = {};

    exams.forEach((exam) => {
      const key = `${exam.exam_date}_${exam.course}`;

      if (!groups[key]) {
        groups[key] = {
          exam_date: exam.exam_date,
          course: exam.course,
          times: new Set(),
          rows: [],
        };
      }

      if (exam.exam_time) groups[key].times.add(exam.exam_time);
      groups[key].rows.push(exam);
    });

    return Object.values(groups).map((group) => ({
      ...group,
      times: Array.from(group.times),
    }));
  }, [exams]);

  const setFlashMessage = (type, text) => {
    setFlash({ type, text });
    if (text) {
      setTimeout(() => setFlash(null), 3500);
    }
  };

  const handleRefresh = async () => {
    if (!rights.can_view) return;
    if (!examSession) {
      setFlashMessage("error", "Select an exam with a valid exam_year_session first.");
      return;
    }
    setSyncing(true);
    try {
      setFlashMessage("info", "Syncing CCTV data from Google Sheet...");
      const result = await syncCctvExamsFromSheet(examSession);
      const summary = result?.data?.summary;
      if (summary) {
        setFlashMessage(
          "success",
          `Sheet sync complete. Created: ${summary.created}, Updated: ${summary.updated}, Skipped: ${summary.skipped}.`
        );
      } else {
        setFlashMessage("success", "Sheet sync completed.");
      }
      await fetchExams();
      await fetchCentres();
      await fetchDvds();
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || "Failed to sync from sheet.";
      setFlashMessage("error", msg);
    } finally {
      setSyncing(false);
    }
  };

  // ============================
  // Centre Submit
  // ============================

  const handleCentreSubmit = async (e) => {
    e.preventDefault();
  };

  // ============================
  // Outward Submit
  // ============================

  const handleOutwardSubmit = async (e) => {
    e.preventDefault();
    const isEdit = Boolean(outwardForm.id);
    if (isEdit && !rights.can_edit) {
      alert("You do not have permission to edit outward entries.");
      return;
    }
    if (!isEdit && !rights.can_create) {
      alert("You do not have permission to create outward entries.");
      return;
    }

    const payload = {
      outward_date: outwardForm.outward_date,
      college_name: outwardForm.college_name,
      centre_name: outwardForm.centre_name,
      exam_on: outwardForm.exam_on,
      last_date: outwardForm.last_date,
      cc_start_label: outwardForm.cc_start_label,
      cc_end_label: outwardForm.cc_end_label,
      no_of_dvd: outwardForm.no_of_dvd,
      no_of_report: outwardForm.no_of_report,
      return_received: outwardForm.return_received,
      case_found: outwardForm.case_found,
      case_type: outwardForm.case_found ? outwardForm.case_type : "",
      case_details: outwardForm.case_found ? outwardForm.case_details : "",
      remark: outwardForm.remark,
    };

    if (isEdit) {
      await updateOutward(outwardForm.id, payload);
      alert("Outward Updated");
    } else {
      await createOutward(payload);
      alert("Outward Created");
    }

    setOutwardForm({
      outward_date: "",
      cctv_record_no: "",
      college_name: "",
      centre_name: "",
      exam_on: "",
      last_date: "",
      cc_start_label: "",
      cc_end_label: "",
      no_of_dvd: "",
      no_of_report: "",
      return_received: false,
      case_found: false,
      case_type: "",
      case_details: "",
      remark: "",
      id: null,
    });
    fetchOutwards();
  };

  const handleOutwardEdit = (row) => {
    setSelectedAction(ACTIONS[1]);
    setOutwardForm({
      id: row.id,
      outward_date: row.outward_date || "",
      cctv_record_no: row.cctv_record_no || "",
      college_name: row.college_name || "",
      centre_name: row.centre_name || "",
      exam_on: row.exam_on || "",
      last_date: row.last_date || "",
      cc_start_label: row.cc_start_label || "",
      cc_end_label: row.cc_end_label || "",
      no_of_dvd: row.no_of_dvd || "",
      no_of_report: row.no_of_report || "",
      return_received: !!row.return_received,
      case_found: !!row.case_found,
      case_type: row.case_type || "",
      case_details: row.case_details || "",
      remark: row.remark || "",
    });
  };

  const handleOutwardDelete = async (row) => {
    if (!rights.can_delete) {
      alert("You do not have permission to delete outward entries.");
      return;
    }
    if (!confirm("Delete this outward entry?")) return;
    await deleteOutward(row.id);
    fetchOutwards();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 h-full">
      <PageTopbar
        title="CCTV Monitoring"
        leftSlot={
          <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-800 text-white text-xl">
            📹
          </div>
        }
        actions={ACTIONS}
        selected={selectedAction}
        onSelect={setSelectedAction}
        actionsOnLeft={false}
        onToggleSidebar={onToggleSidebar}
        onToggleChatbox={onToggleChatbox}
        rightSlot={
          <div className="flex items-center gap-2">
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-slate-300 bg-white"
            >
              {EXAM_SESSIONS.map((session) => (
                <option key={session} value={session}>
                  {session}
                </option>
              ))}
            </select>
            <span className="text-xs px-2 py-1 rounded-full bg-slate-100 border text-slate-700">
              {examSession || "No exam session"}
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              className="px-3 py-2 rounded bg-slate-800 text-white text-sm hover:bg-slate-700 disabled:bg-slate-400"
              disabled={syncing || !rights.can_view}
            >
              {syncing ? "Syncing..." : "↻ Refresh"}
            </button>
          </div>
        }
      />

      {flash && (
        <div
          className={`px-4 py-2 rounded-2xl border text-sm shadow-sm ${
            flash.type === "success"
              ? "bg-green-50 border-green-200 text-green-700"
              : flash.type === "error"
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-blue-50 border-blue-200 text-blue-700"
          }`}
        >
          {flash.text}
        </div>
      )}

      {/* ======================= */}
      {/* Centre Entry Form */}
      {/* ======================= */}

      {selectedAction === ACTIONS[0] && (
        <>
          <div className="border p-4 rounded">
            <h2 className="font-semibold mb-4">Exam Table</h2>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-collapse table-fixed">
                <thead className="bg-gray-200 text-xs uppercase">
                  <tr>
                    <th className="w-12 px-2 py-1 text-left">Sem</th>
                    <th className="w-24 px-2 py-1 text-left">Subject Code</th>
                    <th className="w-64 px-2 py-1 text-left">Subject Name</th>
                    <th className="w-16 px-2 py-1 text-center">No of Students</th>
                    <th className="w-48 px-2 py-1 text-left">Institute Remarks</th>
                    <th className="w-16 px-1 py-1 text-center">Session</th>
                    {placeColumns.map((place) => (
                      <th key={place} className="w-10 px-0 py-1 text-center">
                        {place}
                      </th>
                    ))}
                    <th className="w-20 px-2 py-1 text-center">Start</th>
                    <th className="w-20 px-2 py-1 text-center">End</th>
                    <th className="w-20 px-2 py-1 text-center">Irregularity</th>
                    <th className="w-20 px-2 py-1 text-center">Total DVD</th>
                    <th className="w-20 px-2 py-1 text-center">CC Start</th>
                    <th className="w-20 px-2 py-1 text-center">CC End</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedExams.map((group, index) => {
                    const groupPlaceHasValue = {};
                    placeColumns.forEach((place) => {
                      const hasValue = centres.some((row) => {
                        const exam = examsById[String(row.exam)];
                        if (!exam) return false;
                        return (
                          String(row.place).trim() === String(place).trim() &&
                          exam.exam_date === group.exam_date &&
                          exam.course === group.course
                        );
                      });
                      groupPlaceHasValue[String(place).trim()] = hasValue;
                    });

                    return (
                      <React.Fragment key={index}>
                        <tr className="bg-blue-50 text-sm font-semibold border-t">
                        <td colSpan={placeColumns.length + 12} className="px-3 py-2">
                          <div className="flex flex-wrap gap-4">
                            <span>{group.exam_date}</span>
                            <span>{group.course}</span>
                            {group.times.map((time) => (
                              <span key={time} className="text-sm text-gray-700">
                                {time}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>

                      {group.rows.map((exam) => (
                        <tr key={exam.id} className="border-b">
                          {(() => {
                            const session = sessionByExam[exam.id] || "A";
                            const key = `${exam.id}:${session}`;
                            const centreRows = centres.filter(
                              (row) => String(row.exam) === String(exam.id) && row.session === session
                            );
                            const ccSummaryCentre = centreRows[0] || null;
                            const startValues = centreRows
                              .map((row) => row.start_number)
                              .filter((value) => Number.isFinite(value));
                            const endValues = centreRows
                              .map((row) => row.end_number)
                              .filter((value) => Number.isFinite(value));
                            const startLabel = startValues.length
                              ? `${session}-${Math.min(...startValues)}`
                              : "";
                            const endLabel = endValues.length
                              ? `${session}-${Math.max(...endValues)}`
                              : "";
                            const centreIds = new Set(centreRows.map((row) => String(row.id)));
                            const objectionDvds = [];
                            centreIds.forEach((id) => {
                              (dvdsByCentreId[id] || []).forEach((dvd) => {
                                if (dvd.objection_found) objectionDvds.push(dvd);
                              });
                            });
                            const sortedObjections = objectionDvds
                              .slice()
                              .sort((a, b) => (a.cc_number || 0) - (b.cc_number || 0));
                            const ccStart = sortedObjections[0]?.cc_label || "";
                            const ccEnd =
                              sortedObjections[sortedObjections.length - 1]?.cc_label || "";
                            const ccTotal = sortedObjections.length;
                            const irregularityValue = irregularityByKey[key] || "No";
                            const ccPreview = ccRequestByKey[key] || {};
                            const ccTotalValue =
                              ccPreview.total || ccSummaryCentre?.cc_total || "";
                            const ccStartValue =
                              ccSummaryCentre?.cc_start_label || (ccTotal > 0 ? ccStart : "");
                            const ccEndValue =
                              ccSummaryCentre?.cc_end_label || (ccTotal > 0 ? ccEnd : "");

                            return (
                              <>
                                <td className="w-12 px-2 py-1">{exam.sem}</td>
                                <td className="w-24 px-2 py-1">{exam.subject_code}</td>
                                <td className="w-64 px-2 py-1 text-[11px]">{exam.subject_name}</td>
                                <td className="w-16 px-2 py-1 text-center">{exam.no_of_students}</td>
                                <td className="w-48 px-2 py-1 text-[11px]">{exam.institute_remarks}</td>

                                <td className="w-16 px-1 py-1 text-center">
                                  <select
                                    value={sessionByExam[exam.id] || "A"}
                                    onChange={(e) =>
                                      setSessionByExam((prev) => ({
                                        ...prev,
                                        [exam.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full text-xs text-center border p-0 box-border"
                                  >
                                    <option value="A">A</option>
                                    <option value="B">B</option>
                                    <option value="C">C</option>
                                    <option value="D">D</option>
                                  </select>
                                </td>

                                {placeColumns.map((place) => {
                                  const placeKey = `${exam.id}:${session}:${place}`;
                                  const centreRow = centres.find(
                                    (row) =>
                                      String(row.exam) === String(exam.id) &&
                                      row.session === session &&
                                      String(row.place).trim() === String(place).trim()
                                  );
                                  const displayValue =
                                    placeInputByKey[placeKey] ?? (centreRow?.no_of_cd ? String(centreRow.no_of_cd) : "");
                                  const groupHasPlaceValue = groupPlaceHasValue[String(place).trim()];

                                  return (
                                    <td
                                      key={place}
                                      className={`w-10 p-0 text-center ${
                                        groupHasPlaceValue ? "bg-green-100" : ""
                                      }`}
                                    >
                                      <input
                                        type="number"
                                        placeholder="0"
                                        value={displayValue}
                                        className={`w-full h-6 text-xs text-center border box-border p-0 m-0 ${
                                          groupHasPlaceValue ? "bg-green-100" : ""
                                        }`}
                                        onChange={(e) => {
                                          const nextValue = e.target.value;
                                          setPlaceInputByKey((prev) => ({
                                            ...prev,
                                            [placeKey]: nextValue,
                                          }));
                                        }}
                                        onBlur={async (e) => {
                                          const value = Number(e.target.value);
                                          if (!value || value <= 0) return;
                                          if (!rights.can_create) return;
                                          await createCentre({
                                            exam: exam.id,
                                            session: sessionByExam[exam.id] || "A",
                                            place,
                                            no_of_cd: value,
                                          });
                                          setPlaceInputByKey((prev) => {
                                            const next = { ...prev };
                                            delete next[placeKey];
                                            return next;
                                          });
                                          fetchCentres();
                                          fetchDvds();
                                        }}
                                      />
                                    </td>
                                  );
                                })}

                                <td className="w-20 px-2 py-1 text-center">
                                  {startLabel || "—"}
                                </td>
                                <td className="w-20 px-2 py-1 text-center">
                                  {endLabel || "—"}
                                </td>
                                <td className="w-20 px-2 py-1 text-center">
                                  <select
                                    value={irregularityValue}
                                    onChange={(e) => {
                                      const nextValue = e.target.value;
                                      setIrregularityByKey((prev) => ({
                                        ...prev,
                                        [key]: nextValue,
                                      }));
                                      if (nextValue !== "Yes") {
                                        setCcRequestByKey((prev) => {
                                          const next = { ...prev };
                                          delete next[key];
                                          return next;
                                        });
                                      }
                                    }}
                                    className="w-full text-xs border p-0"
                                  >
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                  </select>
                                </td>
                                <td className="w-20 px-2 py-1 text-center">
                                  <input
                                    type="number"
                                    placeholder="0"
                                    value={ccTotalValue}
                                    disabled={irregularityValue !== "Yes"}
                                    className="w-full h-6 text-xs text-center border box-border p-0 m-0 disabled:bg-slate-100"
                                    onChange={(e) => {
                                      const nextValue = e.target.value;
                                      setCcRequestByKey((prev) => ({
                                        ...prev,
                                        [key]: {
                                          ...prev[key],
                                          total: nextValue,
                                        },
                                      }));
                                    }}
                                    onBlur={async (e) => {
                                      const total = Number(e.target.value);
                                      if (!total || total <= 0) return;
                                      if (!rights.can_edit) return;
                                      const centreRow = centres.find(
                                        (row) =>
                                          String(row.exam) === String(exam.id) &&
                                          row.session === session
                                      );
                                      if (!centreRow) {
                                        setFlashMessage("error", "Create a centre entry first.");
                                        return;
                                      }
                                      try {
                                        await assignCcNumbers({
                                          centre_id: centreRow.id,
                                          total,
                                        });
                                        await fetchCentres();
                                        await fetchDvds();
                                      } catch (err) {
                                        const msg =
                                          err?.response?.data?.detail ||
                                          err.message ||
                                          "Failed to assign CC numbers.";
                                        setFlashMessage("error", msg);
                                      }
                                    }}
                                  />
                                </td>
                                <td className="w-20 px-2 py-1 text-center">
                                  {ccStartValue || "—"}
                                </td>
                                <td className="w-20 px-2 py-1 text-center">
                                  {ccEndValue || "—"}
                                </td>
                              </>
                            );
                          })()}
                        </tr>
                      ))}
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border p-4 rounded">
            <h3 className="font-semibold mb-4">Generated Labels</h3>
            <div className="space-y-2 text-sm">
              {centres.map((row) => (
                <div key={row.id}>
                  {row.place} → {row.start_label === row.end_label
                    ? row.start_label
                    : `${row.start_label} - ${row.end_label}`}
                </div>
              ))}
            </div>
          </div>

      {/* ======================= */}
      {/* Outward Form */}
      {/* ======================= */}

        </>
      )}

      {selectedAction === ACTIONS[1] && (
        <div className="border p-4 rounded space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">CCTV Outward</h2>
            <button
              type="button"
              onClick={() => {
                if (!outwards.length) {
                  alert("No outward record available.");
                  return;
                }
                const latest = outwards[0];
                window.open(`/api/cctv-outward/${latest.id}/generate-pdf/`, "_blank");
              }}
              className="px-4 py-2 rounded bg-green-600 text-white text-sm hover:bg-green-700"
            >
              Generate Latest Letter
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Record No.</th>
                  <th className="px-3 py-2 text-left">Outward No.</th>
                  <th className="px-3 py-2 text-left">College</th>
                  <th className="px-3 py-2 text-left">Centre</th>
                  <th className="px-3 py-2 text-left">CC Range</th>
                  <th className="px-3 py-2 text-left">Total DVD</th>
                  <th className="px-3 py-2 text-left">Reports</th>
                  <th className="px-3 py-2 text-left">Return</th>
                  <th className="px-3 py-2 text-left">Case</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {outwards.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-6 text-center text-gray-500">
                      No outward entries found.
                    </td>
                  </tr>
                )}
                {outwards.map((row) => {
                  const cdLabel = [row.cc_start_label, row.cc_end_label]
                    .filter(Boolean)
                    .join(" - ");
                  return (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2 align-top">{row.outward_date || "—"}</td>
                      <td className="px-3 py-2 align-top">{row.cctv_record_no || "—"}</td>
                      <td className="px-3 py-2 align-top">{row.outward_no || "—"}</td>
                      <td className="px-3 py-2 align-top">{row.college_name || "—"}</td>
                      <td className="px-3 py-2 align-top">{row.centre_name || "—"}</td>
                      <td className="px-3 py-2 align-top">{cdLabel || "—"}</td>
                      <td className="px-3 py-2 align-top">{row.no_of_dvd || "—"}</td>
                      <td className="px-3 py-2 align-top">{row.no_of_report || "—"}</td>
                      <td className="px-3 py-2 align-top">
                        {row.return_received ? "Yes" : "No"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {row.case_found ? row.case_type || "Yes" : "No"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOutwardEdit(row)}
                            className="px-3 py-1.5 rounded bg-purple-600 text-white text-xs hover:bg-purple-700"
                            disabled={!rights.can_edit}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOutwardDelete(row)}
                            className="px-3 py-1.5 rounded bg-red-600 text-white text-xs hover:bg-red-700"
                            disabled={!rights.can_delete}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => window.open(`/api/cctv-outward/${row.id}/generate-pdf/`, "_blank")}
                            className="px-3 py-1.5 rounded bg-green-600 text-white text-xs hover:bg-green-700"
                          >
                            Generate Letter
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border p-4 rounded">
            <h3 className="font-semibold mb-4">{outwardForm.id ? "Edit Outward" : "Create Outward"}</h3>
            <form onSubmit={handleOutwardSubmit} className="grid md:grid-cols-2 gap-4">
              <input
                type="date"
                value={outwardForm.outward_date}
                onChange={(e) =>
                  setOutwardForm({ ...outwardForm, outward_date: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Record No"
                value={outwardForm.cctv_record_no || ""}
                disabled
              />

              <input
                type="text"
                placeholder="College Name"
                value={outwardForm.college_name || ""}
                onChange={(e) =>
                  setOutwardForm({ ...outwardForm, college_name: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Centre Name"
                value={outwardForm.centre_name || ""}
                onChange={(e) =>
                  setOutwardForm({ ...outwardForm, centre_name: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Exam On (e.g. March 2026)"
                value={outwardForm.exam_on || ""}
                onChange={(e) =>
                  setOutwardForm({ ...outwardForm, exam_on: e.target.value })
                }
              />

              <input
                type="date"
                value={outwardForm.last_date || ""}
                onChange={(e) =>
                  setOutwardForm({ ...outwardForm, last_date: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="CC Start Label"
                value={outwardForm.cc_start_label}
                onChange={(e) =>
                  setOutwardForm({ ...outwardForm, cc_start_label: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="CC End Label"
                value={outwardForm.cc_end_label}
                onChange={(e) =>
                  setOutwardForm({ ...outwardForm, cc_end_label: e.target.value })
                }
              />

              <input
                type="number"
                placeholder="No of DVD"
                value={outwardForm.no_of_dvd}
                onChange={(e) =>
                  setOutwardForm({ ...outwardForm, no_of_dvd: e.target.value })
                }
              />

              <input
                type="number"
                placeholder="No of Report"
                value={outwardForm.no_of_report || ""}
                onChange={(e) =>
                  setOutwardForm({ ...outwardForm, no_of_report: e.target.value })
                }
              />

              <label>
                <input
                  type="checkbox"
                  checked={outwardForm.return_received}
                  onChange={(e) =>
                    setOutwardForm({
                      ...outwardForm,
                      return_received: e.target.checked,
                    })
                  }
                />
                Return Received
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={outwardForm.case_found}
                  onChange={(e) =>
                    setOutwardForm({
                      ...outwardForm,
                      case_found: e.target.checked,
                    })
                  }
                />
                Case Found
              </label>

              {outwardForm.case_found && (
                <>
                  <select
                    value={outwardForm.case_type}
                    onChange={(e) =>
                      setOutwardForm({
                        ...outwardForm,
                        case_type: e.target.value,
                      })
                    }
                  >
                    <option value="">Select Case Type</option>
                    <option value="CCTV">CCTV</option>
                    <option value="Physical">Physical</option>
                  </select>

                  <textarea
                    placeholder="Case Details"
                    value={outwardForm.case_details}
                    onChange={(e) =>
                      setOutwardForm({
                        ...outwardForm,
                        case_details: e.target.value,
                      })
                    }
                  />
                </>
              )}

              <textarea
                placeholder="Remark"
                value={outwardForm.remark || ""}
                onChange={(e) =>
                  setOutwardForm({ ...outwardForm, remark: e.target.value })
                }
                className="md:col-span-2"
              />

              <button
                className="bg-green-600 text-white p-2 rounded md:col-span-2"
                disabled={outwardForm.id ? !rights.can_edit : !rights.can_create}
              >
                {outwardForm.id ? "Update Outward" : "Create Outward"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CCTVMonitoring;
