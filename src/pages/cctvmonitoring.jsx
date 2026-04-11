// src/pages/cctvmonitoring.jsx
import React, { useEffect, useMemo, useState } from "react";
import { FaEdit, FaTrash } from "react-icons/fa";
import PageTopbar from "../components/PageTopbar";
import CCTVREPORT from "../report/CCTVREPORT";
import { toDateInput } from "../utils/date";
import {
  getExams,
  createCentre,
  getCentres,
  updateCentre,
  createOutward,
  getOutward,
  getDVDs,
  getInstitutes,
  assignCcNumbers,
  updateOutward,
  deleteOutward,
  syncCctvExamsFromSheet,
  syncCctvFromSheet,
  downloadOutwardPDF,
} from "../services/cctvservice";

const ACTIONS = ["CCTV Monitoring", "CCTV-Outward", "Copy Case Reporting"];
const EXAM_SESSIONS = ["2026-1", "2026-2", "2027-1", "2027-2", "2028-1", "2028-2"];
const DEFAULT_PLACES = ["Kadi", "15-LDRP", "15VSITR", "23", "12"];
const SESSION_OPTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const EMPTY_OUTWARD_FORM = {
  outward_date: "",
  cctv_record_no: "",
  college_name: "",
  exam_on: "",
  last_date: "",
  cc_start_label: "",
  no_of_dvd: "",
  no_of_report: "",
  rep_nos: "",
  return_received: false,
  receive_date: "",
  case_found: false,
  course: "",
  semester: "",
  case_type: "",
  case_details: "",
  note: "",
  id: null,
};

const toResultsArray = (payload) =>
  Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
    ? payload.results
    : [];

const pickReceiveDate = (row) =>
  row?.receive_date ||
  row?.receiveDate ||
  row?.received_date ||
  row?.return_received_date ||
  "";

const sortRowsByDateDesc = (rows = []) =>
  rows
    .slice()
    .sort((a, b) => {
      const aDate = toDateInput(a?.outward_date || "");
      const bDate = toDateInput(b?.outward_date || "");
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return bDate.localeCompare(aDate);
    });

const findInstituteMatch = (value, institutes) => {
  const needle = String(value || "").trim().toLowerCase();
  if (!needle) return null;

  return (
    institutes.find((item) => {
      const code = String(item?.institute_code || "").trim().toLowerCase();
      const name = String(item?.institute_name || "").trim().toLowerCase();
      return needle === code || needle === name;
    }) || null
  );
};

const normalizeExamSlotSession = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  return SESSION_OPTIONS.includes(normalized) ? normalized : "";
};

const getSheetSessionFromExam = (exam) => {
  const rawRow = exam?.raw_row;
  if (!rawRow || typeof rawRow !== "object") return "";
  const entry = Object.entries(rawRow).find(
    ([key]) => String(key || "").trim().toLowerCase() === "session"
  );
  return normalizeExamSlotSession(entry?.[1]);
};

const CCTVMonitoring = ({
  rights = { can_view: true, can_create: true, can_edit: true, can_delete: true },
  onToggleSidebar,
  onToggleChatbox,
}) => {
  const [exams, setExams] = useState([]);
  const [centres, setCentres] = useState([]);
  const [dvds, setDvds] = useState([]);
  const [institutes, setInstitutes] = useState([]);
  const [outwards, setOutwards] = useState([]);
  const [selectedAction, setSelectedAction] = useState(ACTIONS[0]);
  const [selectedSession, setSelectedSession] = useState("2026-1");
  const [sessionByExam, setSessionByExam] = useState({});
  const [placeInputByKey, setPlaceInputByKey] = useState({});
  const [irregularityByKey, setIrregularityByKey] = useState({});
  const [ccRequestByKey, setCcRequestByKey] = useState({});
  const [syncing, setSyncing] = useState(false);
  const [institutesLoading, setInstitutesLoading] = useState(false);
  const [flash, setFlash] = useState(null);

  const [centreForm] = useState({
    exam: "",
    place: "",
    session: "A",
    no_of_cd: "",
  });

  const [outwardForm, setOutwardForm] = useState(EMPTY_OUTWARD_FORM);
  const [showLetterPicker, setShowLetterPicker] = useState(false);
  const [selectedLetterRecordId, setSelectedLetterRecordId] = useState("");

  // ============================
  // Load Exams
  // ============================

  useEffect(() => {
    if (!rights.can_view) return;
    fetchExams(selectedSession);
    fetchCentres(selectedSession);
    fetchDvds(selectedSession);
  }, [rights.can_view, selectedSession]);

  useEffect(() => {
    if (!rights.can_view || selectedAction !== ACTIONS[1]) return;
    fetchOutwards();
    fetchInstitutes();
  }, [rights.can_view, selectedAction]);

  useEffect(() => {
    setSessionByExam((prev) => {
      let changed = false;
      const next = { ...prev };

      exams.forEach((exam) => {
        if (next[exam.id]) return;

        const sheetSession = getSheetSessionFromExam(exam);
        const centreSession = centres
          .filter((row) => String(row.exam) === String(exam.id))
          .map((row) => normalizeExamSlotSession(row.session))
          .find(Boolean);

        const resolvedSession = sheetSession || centreSession;
        if (resolvedSession) {
          next[exam.id] = resolvedSession;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [exams, centres]);

  const fetchExams = async (session = "") => {
    try {
      const params = session ? { exam_year_session: session } : undefined;
      const res = await getExams(params);
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

  const fetchCentres = async (session = "") => {
    try {
      const params = session ? { exam_year_session: session } : undefined;
      const res = await getCentres(params);
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

  const fetchDvds = async (session = "") => {
    try {
      const params = session ? { exam_year_session: session } : undefined;
      const res = await getDVDs(params);
      const data = toResultsArray(res?.data);
      setDvds(data);
    } catch (err) {
      setDvds([]);
      const msg = err?.response?.data?.detail || err.message || "Failed to load DVDs.";
      setFlashMessage("error", msg);
    }
  };

  const fetchInstitutes = async () => {
    setInstitutesLoading(true);
    try {
      const res = await getInstitutes();
      setInstitutes(toResultsArray(res?.data));
    } catch (err) {
      setInstitutes([]);
      const msg = err?.response?.data?.detail || err.message || "Failed to load institute codes.";
      setFlashMessage("error", msg);
    } finally {
      setInstitutesLoading(false);
    }
  };

  const fetchOutwards = async () => {
    try {
      const res = await getOutward();
      const data = toResultsArray(res?.data);
      setOutwards(
        sortRowsByDateDesc(
          data.map((row) => ({
            ...row,
            receive_date: pickReceiveDate(row),
          }))
        )
      );
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

  const selectedInstitute = useMemo(
    () => findInstituteMatch(outwardForm.college_name, institutes),
    [outwardForm.college_name, institutes]
  );

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

    const toSortableDate = (d) => {
      if (!d) return "";
      const s = String(d).trim();
      const dmY = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
      if (dmY) {
        return `${dmY[3]}-${dmY[2].padStart(2, "0")}-${dmY[1].padStart(2, "0")}`;
      }
      const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return s.slice(0, 10);
      const parsed = Date.parse(s);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed).toISOString().slice(0, 10);
      }
      return s;
    };

    const courseValue = (value) => {
      const n = Number(value);
      return Number.isNaN(n) ? String(value || "").toLowerCase() : n;
    };

    const sessionRank = (value) => {
      const normalized = String(value || "").trim().toUpperCase();
      const idx = SESSION_OPTIONS.indexOf(normalized);
      if (idx >= 0) return idx;
      const num = Number(normalized);
      if (!Number.isNaN(num)) return SESSION_OPTIONS.length + num;
      return SESSION_OPTIONS.length + 100;
    };

    const compareSessions = (x, y) => {
      const a = sessionRank(x.session);
      const b = sessionRank(y.session);
      if (a !== b) return a - b;
      return String(x.session || "").localeCompare(String(y.session || ""));
    };

    return Object.values(groups)
      .map((group) => ({
        ...group,
        times: Array.from(group.times),
        rows: group.rows.slice().sort(compareSessions),
      }))
      .sort((a, b) => {
        const dateA = toSortableDate(a.exam_date);
        const dateB = toSortableDate(b.exam_date);
        const dateCompare = dateB.localeCompare(dateA);
        if (dateCompare !== 0) return dateCompare;

        const courseA = courseValue(a.course);
        const courseB = courseValue(b.course);
        if (typeof courseA === "number" && typeof courseB === "number") {
          if (courseA !== courseB) return courseA - courseB;
        } else {
          const comp = String(a.course || "").localeCompare(String(b.course || ""));
          if (comp !== 0) return comp;
        }

        const sessionA = a.rows[0]?.session || "";
        const sessionB = b.rows[0]?.session || "";
        return sessionRank(sessionA) - sessionRank(sessionB);
      });
  }, [exams]);

  useEffect(() => {
    if (!outwardForm.college_name || institutes.length === 0) return;

    const match = findInstituteMatch(outwardForm.college_name, institutes);
    if (!match?.institute_code || outwardForm.college_name === match.institute_code) return;

    setOutwardForm((prev) => ({
      ...prev,
      college_name: match.institute_code,
    }));
  }, [outwardForm.college_name, institutes]);

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
      const examResult = await syncCctvExamsFromSheet(examSession);
      const centreResult = await syncCctvFromSheet(examSession);
      const examSummary = examResult?.data?.summary;
      const centreSummary = centreResult?.data?.summary;

      if (examSummary || centreSummary) {
        const examMessage = examSummary
          ? `Exams C:${examSummary.created} U:${examSummary.updated} S:${examSummary.skipped}`
          : "Exams synced";
        const centreMessage = centreSummary
          ? `Centres C:${centreSummary.created} U:${centreSummary.updated} S:${centreSummary.skipped}`
          : "Centres synced";
        setFlashMessage(
          "success",
          `Sheet sync complete. ${examMessage}. ${centreMessage}.`
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

    const resolvedReceiveDate = outwardForm.return_received
      ? outwardForm.receive_date || null
      : null;

    const payload = {
      outward_date: outwardForm.outward_date || null,
      college_name: outwardForm.college_name || "",
      exam_on: outwardForm.exam_on,
      last_date: outwardForm.last_date || null,
      cc_start_label: outwardForm.cc_start_label,
      no_of_dvd: outwardForm.no_of_dvd !== "" ? Number(outwardForm.no_of_dvd) : 0,
      no_of_report: outwardForm.no_of_report !== "" ? Number(outwardForm.no_of_report) : 0,
      rep_nos: outwardForm.rep_nos || "",
      return_received: outwardForm.return_received,
      receive_date: resolvedReceiveDate,
      case_found: outwardForm.case_found,
      course: outwardForm.case_found ? outwardForm.course || "" : "",
      semester: outwardForm.case_found ? outwardForm.semester || "" : "",
      case_type: outwardForm.case_found ? outwardForm.case_type : null,
      case_details: outwardForm.case_found ? outwardForm.case_details : "",
      note: outwardForm.note || "",
    };

    try {
      if (isEdit) {
        await updateOutward(outwardForm.id, payload);
        alert("Outward Updated");
      } else {
        await createOutward(payload);
        alert("Outward Created");
      }
    } catch (err) {
      const detail = err?.response?.data;
      alert("Save failed: " + (detail ? JSON.stringify(detail) : err.message));
      return;
    }

    setOutwardForm({ ...EMPTY_OUTWARD_FORM });
    fetchOutwards();
  };

  const handleOutwardEdit = (row) => {
    setSelectedAction(ACTIONS[1]);
    setOutwardForm({
      id: row.id,
      outward_date: row.outward_date || "",
      cctv_record_no: row.cctv_record_no || "",
      college_name: row.college_name || "",
      exam_on: row.exam_on || "",
      last_date: row.last_date || "",
      cc_start_label: row.cc_start_label || "",
      no_of_dvd: row.no_of_dvd || "",
      no_of_report: row.no_of_report || "",
      rep_nos: row.rep_nos || "",
      return_received: !!row.return_received,
      receive_date: pickReceiveDate(row) || "",
      case_found: !!row.case_found,
      course: row.course || "",
      semester: row.semester || "",
      case_type: row.case_type || "",
      case_details: row.case_details || "",
      note: row.note || "",
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

  const handleDownloadOutwardLetter = async (row) => {
    if (!row?.id) {
      alert("Invalid outward record.");
      return;
    }
    try {
      const res = await downloadOutwardPDF(row.id);
      const mime = "application/pdf";
      const url = URL.createObjectURL(new Blob([res.data], { type: mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${row.cctv_record_no || "CCTV_Letter"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to generate letter.");
    }
  };

  return (
    <div className="p-2 md:p-3 space-y-4 h-full">
      <PageTopbar
        title="CCTV Monitoring"
        leftSlot={
          <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-800 text-white text-xl">
            📹
          </div>
        }
        actions={ACTIONS}
        selected={selectedAction}
        onSelect={(action) => {
          setSelectedAction(action);
        }}
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
              className="refresh-icon-button"
              disabled={syncing || !rights.can_view}
              title={syncing ? "Syncing" : "Refresh"}
              aria-label={syncing ? "Syncing" : "Refresh"}
            >
              <span className={`refresh-symbol ${syncing ? "animate-spin" : ""}`} aria-hidden="true">↻</span>
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

            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-sm border border-collapse table-fixed">
                <thead className="bg-gray-200 text-xs uppercase sticky top-0 z-10">
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
                        <tr key={exam.id} className={`border-b ${exam.no_of_students === 0 ? 'bg-orange-100' : ''}`}>
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
                                      {SESSION_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
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
                                          const canAct = centreRow
                                            ? rights.can_edit
                                            : rights.can_create;
                                          if (!canAct) return;
                                          if (centreRow) {
                                            // Update existing centre — backend recalculates DVD range
                                            if (Number(centreRow.no_of_cd) !== value) {
                                              await updateCentre(centreRow.id, { no_of_cd: value });
                                            }
                                          } else {
                                            // Create new centre with auto-assigned DVD sequence
                                            await createCentre({
                                              exam: exam.id,
                                              session: sessionByExam[exam.id] || "A",
                                              place,
                                              no_of_cd: value,
                                            });
                                          }
                                          setPlaceInputByKey((prev) => {
                                            const next = { ...prev };
                                            delete next[placeKey];
                                            return next;
                                          });
                                          await fetchCentres();
                                          await fetchDvds();
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

      {/* ======================= */}
      {/* Outward Form */}
      {/* ======================= */}

        </>
      )}

      {selectedAction === ACTIONS[1] && (
        <div className="border p-4 rounded space-y-4">
          <div className="border p-4 rounded">
            <h3 className="font-semibold mb-4">{outwardForm.id ? "Edit Outward" : "Create Outward"}</h3>
            <form onSubmit={handleOutwardSubmit} className="space-y-4">
              {outwardForm.id && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Editing {outwardForm.cctv_record_no || "existing outward record"}
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-12">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Date
                  </label>
                  <input
                    type="date"
                    value={toDateInput(outwardForm.outward_date)}
                    onChange={(e) =>
                      setOutwardForm({ ...outwardForm, outward_date: e.target.value })
                    }
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="md:col-span-6">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Institute Code
                  </label>
                  <select
                    value={outwardForm.college_name || ""}
                    onChange={(e) =>
                      setOutwardForm({ ...outwardForm, college_name: e.target.value })
                    }
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    disabled={institutesLoading}
                  >
                    <option value="">
                      {institutesLoading ? "Loading institute codes..." : "Select institute code"}
                    </option>
                    {institutes.map((item) => {
                      const code = item?.institute_code || "";
                      const name = item?.institute_name || "";
                      if (!code) return null;

                      return (
                        <option key={item?.institute_id || code} value={code}>
                          {name ? `${code} - ${name}` : code}
                        </option>
                      );
                    })}
                  </select>
                  {selectedInstitute?.institute_name && (
                    <p className="mt-1 text-xs text-slate-500">{selectedInstitute.institute_name}</p>
                  )}
                </div>

                <div className="md:col-span-4">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Exam On
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. March 2026"
                    value={outwardForm.exam_on || ""}
                    onChange={(e) =>
                      setOutwardForm({ ...outwardForm, exam_on: e.target.value })
                    }
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Last Date
                  </label>
                  <input
                    type="date"
                    value={toDateInput(outwardForm.last_date || "")}
                    onChange={(e) =>
                      setOutwardForm({ ...outwardForm, last_date: e.target.value })
                    }
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    DVD No(s)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CC-001, CC-002"
                    value={outwardForm.cc_start_label}
                    onChange={(e) =>
                      setOutwardForm({ ...outwardForm, cc_start_label: e.target.value })
                    }
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Report No(s)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. R-001, R-002"
                    value={outwardForm.rep_nos || ""}
                    onChange={(e) =>
                      setOutwardForm({ ...outwardForm, rep_nos: e.target.value })
                    }
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    No of Report
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={outwardForm.no_of_report || ""}
                    onChange={(e) =>
                      setOutwardForm({ ...outwardForm, no_of_report: e.target.value })
                    }
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    No of DVD
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={outwardForm.no_of_dvd}
                    onChange={(e) =>
                      setOutwardForm({ ...outwardForm, no_of_dvd: e.target.value })
                    }
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-12 md:items-end">
                <div className="md:col-span-4">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Remark / Note
                  </label>
                  <input
                    type="text"
                    placeholder="Remark / Note"
                    value={outwardForm.note || ""}
                    onChange={(e) =>
                      setOutwardForm({ ...outwardForm, note: e.target.value })
                    }
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <label className="inline-flex h-10 items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm text-slate-700 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={outwardForm.return_received}
                    onChange={(e) =>
                      setOutwardForm({
                        ...outwardForm,
                        return_received: e.target.checked,
                        receive_date: e.target.checked
                          ? outwardForm.receive_date
                          : "",
                      })
                    }
                  />
                  Return Received
                </label>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Receive Date
                  </label>
                  <input
                    type="date"
                    value={toDateInput(outwardForm.receive_date || "")}
                    onChange={(e) =>
                      setOutwardForm({ ...outwardForm, receive_date: e.target.value })
                    }
                    disabled={!outwardForm.return_received}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>

                <label className="inline-flex h-10 items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm text-slate-700 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={outwardForm.case_found}
                    onChange={(e) =>
                      setOutwardForm({
                        ...outwardForm,
                        case_found: e.target.checked,
                        course: e.target.checked ? outwardForm.course : "",
                        semester: e.target.checked ? outwardForm.semester : "",
                      })
                    }
                  />
                  Case Found
                </label>

                <button
                  type="submit"
                  className="save-button h-10 w-full md:col-span-2"
                  disabled={outwardForm.id ? !rights.can_edit : !rights.can_create}
                >
                  Save
                </button>
              </div>

              {outwardForm.case_found && (
                <div className="grid gap-3 md:grid-cols-12">
                  <div className="md:col-span-3">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Course
                    </label>
                    <input
                      type="text"
                      placeholder="Course"
                      value={outwardForm.course || ""}
                      onChange={(e) =>
                        setOutwardForm({
                          ...outwardForm,
                          course: e.target.value,
                        })
                      }
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Semester
                    </label>
                    <input
                      type="text"
                      placeholder="Semester"
                      value={outwardForm.semester || ""}
                      onChange={(e) =>
                        setOutwardForm({
                          ...outwardForm,
                          semester: e.target.value,
                        })
                      }
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Case Type
                    </label>
                    <select
                      value={outwardForm.case_type}
                      onChange={(e) =>
                        setOutwardForm({
                          ...outwardForm,
                          case_type: e.target.value,
                        })
                      }
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select Case Type</option>
                      <option value="CCTV">CCTV</option>
                      <option value="Physical">Physical</option>
                    </select>
                  </div>

                  <div className="md:col-span-12">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Case Details
                    </label>
                    <textarea
                      placeholder="Case details"
                      value={outwardForm.case_details}
                      onChange={(e) =>
                        setOutwardForm({
                          ...outwardForm,
                          case_details: e.target.value,
                        })
                      }
                      className="min-h-[96px] w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}

            </form>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">CCTV Outward</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={fetchOutwards}
                  className="refresh-icon-button"
                  title="Reload"
                  aria-label="Reload"
                >
                  <span className="refresh-symbol" aria-hidden="true">↻</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!outwards.length) {
                      alert("No outward record available.");
                      return;
                    }
                    setShowLetterPicker((prev) => !prev);
                  }}
                  className="px-4 py-2 rounded bg-green-600 text-white text-sm hover:bg-green-700"
                >
                  Generate Letter
                </button>
                {showLetterPicker && (
                  <select
                    value={selectedLetterRecordId}
                    onChange={async (e) => {
                      const recordId = e.target.value;
                      setSelectedLetterRecordId(recordId);
                      if (!recordId) return;

                      const target = outwards.find((item) => String(item.id) === String(recordId));
                      if (!target) {
                        alert("Selected record not found.");
                        return;
                      }

                      await handleDownloadOutwardLetter(target);
                      setShowLetterPicker(false);
                      setSelectedLetterRecordId("");
                    }}
                    className="rounded border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Select Record No</option>
                    {outwards.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.cctv_record_no || row.outward_no || `Record ${row.id}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Record No.</th>
                    <th className="px-3 py-2 text-left">Outward No.</th>
                    <th className="px-3 py-2 text-left">College</th>
                    <th className="px-3 py-2 text-left">DVD No</th>
                    <th className="px-3 py-2 text-left">Rep No</th>
                    <th className="px-3 py-2 text-left">Total DVD</th>
                    <th className="px-3 py-2 text-left">Reports</th>
                    <th className="px-3 py-2 text-left">Return</th>
                    <th className="px-3 py-2 text-left">Receive Date</th>
                    <th className="px-3 py-2 text-left">Case</th>
                    <th className="px-3 py-2 text-left">Remark</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {outwards.length === 0 && (
                    <tr>
                      <td colSpan={13} className="px-4 py-6 text-center text-gray-500">
                        No outward entries found.
                      </td>
                    </tr>
                  )}
                  {outwards.map((row) => {
                    const institute = findInstituteMatch(row.college_name, institutes);
                    const cdLabel = [row.cc_start_label, row.cc_end_label]
                      .filter(Boolean)
                      .join(" - ");
                    return (
                      <tr
                        key={row.id}
                        className={`border-b last:border-b-0 ${row.return_received ? "bg-green-50" : ""}`}
                      >
                        <td className="px-3 py-2 align-top">{row.outward_date || "—"}</td>
                        <td className="px-3 py-2 align-top">{row.cctv_record_no || "—"}</td>
                        <td className="px-3 py-2 align-top">{row.outward_no || "—"}</td>
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium text-slate-800">
                            {institute?.institute_code || row.college_name || "—"}
                          </div>
                          {institute?.institute_name && (
                            <div className="text-xs text-slate-500">{institute.institute_name}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">{cdLabel || "—"}</td>
                        <td className="px-3 py-2 align-top">{row.rep_nos || "—"}</td>
                        <td className="px-3 py-2 align-top">{row.no_of_dvd || "—"}</td>
                        <td className="px-3 py-2 align-top">{row.no_of_report || "—"}</td>
                        <td className="px-3 py-2 align-top">
                          {row.return_received ? "Yes" : "No"}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {pickReceiveDate(row) || "—"}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {row.case_found ? (
                            <div>
                              <div>{row.case_type || "Yes"}</div>
                              {(row.course || row.semester) && (
                                <div className="text-xs text-slate-500">
                                  {[row.course, row.semester].filter(Boolean).join(" / ")}
                                </div>
                              )}
                            </div>
                          ) : "No"}
                        </td>
                        <td className="px-3 py-2 align-top">{row.note || "—"}</td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOutwardEdit(row)}
                              className="w-7 h-7 inline-flex items-center justify-center rounded icon-edit-button"
                              disabled={!rights.can_edit}
                              title="Edit"
                              aria-label="Edit outward"
                            >
                              <FaEdit size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOutwardDelete(row)}
                              className="w-7 h-7 inline-flex items-center justify-center rounded icon-delete-button"
                              disabled={!rights.can_delete}
                              title="Delete"
                              aria-label="Delete outward"
                            >
                              <FaTrash size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {selectedAction === ACTIONS[2] && (
        <div className="border p-4 rounded">
          <CCTVREPORT rights={rights} />
        </div>
      )}
    </div>
  );
};

export default CCTVMonitoring;
