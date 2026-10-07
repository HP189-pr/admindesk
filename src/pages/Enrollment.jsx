// src/pages/Enrollment.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { isoToDMY, dmyToISO } from "../utils/date";
import { FaEdit, FaTrash, FaGraduationCap, FaUser, FaAddressCard, FaSave, FaTimes } from "react-icons/fa";
import { FaFileExcel, FaFilePdf } from "react-icons/fa6";
import { useNavigate } from 'react-router-dom';
import PanelToggleButton from "../components/PanelToggleButton";
import PageTopbar from "../components/PageTopbar";
import SearchField from '../components/SearchField';
import { 
  createEnrollment, 
  updateEnrollment, 
  deleteEnrollment,
  initUpload, 
  getSheetNames,
  getColumnHeaders,
  processDataChunk,
  getDatabaseFields,
  validateEnrollmentData,
  getAdmissionCancellationList,
  createAdmissionCancellation,
  updateAdmissionCancellation,
  deleteAdmissionCancellation,
  getEnrollmentByNumber,
  resolveEnrollment,
} from "../services/enrollmentservice";
import { fetchInstituteCodes, fetchCourseCodes, fetchSubcourseNames } from "../services/courseService";
import { useAuth } from "../hooks/AuthContext";
import API from "../api/axiosInstance";
import EnrollmentReport from "../report/enrollmentreport";
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const TAB_OPTIONS = [
  { key: "list", label: "Enrollment List" },
  { key: "cancel", label: "Cancel Admission" },
];

const CANCEL_STATUS_OPTIONS = [
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ACTIVE", label: "Active" },
];

const CANCEL_ENTRY_MODE_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'multiple', label: 'Multiple' },
];

const CANCEL_ACTION = "Cancel Admission";
const BATCH_OPTIONS = [2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024,2025, 2026, 2027, 2028];
const ENROLLMENT_FORM_PANEL_CLASS = "rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm md:p-5";
const ENROLLMENT_FORM_LABEL_CLASS = "mb-1 block text-xs font-semibold text-slate-700";
const ENROLLMENT_FORM_FIELD_CLASS = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100";
const ENROLLMENT_FORM_FIELD_ERROR_CLASS = "border-red-500 focus:border-red-500 focus:ring-red-100";
const ENROLLMENT_FORM_SECTION_CLASS = "rounded-xl border p-3 shadow-sm md:p-4";
const ENROLLMENT_FORM_SECTION_HEADER_CLASS = "mb-3 flex items-center gap-2";
const EXPORT_EXCEL_BUTTON_CLASS = "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 shadow transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50";
const EXPORT_PDF_BUTTON_CLASS = "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 shadow transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50";

const getCancelRecordEnrollmentNo = (record = {}) =>
  String(record.enrollment_no || record.enrollment?.enrollment_no || "").trim();

const getCancelRecordDirectBatch = (record = {}) =>
  record.admission_batch
  || record.enrollment_batch
  || record.batch
  || record.enrollment?.admission_batch
  || record.enrollment?.enrollment_batch
  || record.enrollment?.batch
  || "";

const getCancelRecordBatch = (record = {}) => {
  const directBatch = getCancelRecordDirectBatch(record);
  if (directBatch) return String(directBatch);

  const enrollmentNo = getCancelRecordEnrollmentNo(record);
  const yearPrefix = enrollmentNo.match(/^(\d{2})/);
  if (!yearPrefix) return "";

  const year = Number(yearPrefix[1]);
  if (Number.isNaN(year)) return "";
  return String(year >= 50 ? 1900 + year : 2000 + year);
};

const getCancelRecordYear = (record = {}) => {
  const value = record.outward_date || record.inward_date;
  if (!value) return '';
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})[-/]/);
  if (isoMatch) return isoMatch[1];
  const dmyMatch = text.match(/^\d{1,2}[-/]\d{1,2}[-/](\d{2,4})/);
  if (!dmyMatch) return '';
  return dmyMatch[1].length === 2 ? `20${dmyMatch[1]}` : dmyMatch[1];
};

const buildCancelExportRows = (records = []) => records.map((record, index) => ({
  "Sr No": index + 1,
  "Enrollment No": record.enrollment_no || "",
  "Student Name": record.student_name || "",
  "Batch": getCancelRecordBatch(record) || "",
  "Inward No": record.inward_no || "",
  "Inward Date": isoToDMY(record.inward_date) || "",
  "Outward No": record.outward_no || "",
  "Outward Date": isoToDMY(record.outward_date) || "",
  "Remark": record.can_remark || "",
  "Status": record.status || "",
}));

const pickEnrollmentCurrentStatus = (record = {}) => {
  if (record.status) return record.status;
  if (typeof record.cancel === "boolean") return record.cancel ? "Cancelled" : "Active";
  return "";
};

const hydrateCancelRowFromEnrollment = (row, record) => ({
  ...row,
  enrollmentId: record.id,
  studentName: record.student_name || "",
  enrollmentNoInput: String(record.enrollment_no ?? ""),
  currentStatus: pickEnrollmentCurrentStatus(record),
  loadingEnrollment: false,
  error: "",
});

const createEmptyEnrollmentFormData = () => ({
  enrollment_no: '',
  student_name: '',
  institute_id: '',
  batch: '',
  admission_date: '',
  enrollment_date: '',
  cancel: false,
  subcourse_id: '',
  maincourse_id: '',
  temp_enroll_no: ''
});

const createEmptyStudentProfileFormData = () => ({
  gender: '',
  birth_date: '',
  address1: '',
  address2: '',
  city1: '',
  city2: '',
  contact_no: '',
  email: '',
  fees: '',
  hostel_required: false,
  aadhar_no: '',
  abc_id: '',
  mobile_adhar: '',
  name_adhar: '',
  mother_name: '',
  father_name: '',
  category: '',
  is_d2d: false,
  program_medium: '',
  specialisation: '',
});

const STUDENT_PROFILE_SELECT_OPTIONS = {
  gender: ['', 'Male', 'Female', 'Other'],
  category: ['', 'NDNT', 'OBC', 'OPEN', 'SC', 'SEBC', 'ST', 'General', 'EWS'],
  program_medium: ['', 'English', 'Gujarati', 'Hindi'],
};

const normalizeTextField = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const normalizeOptionalDate = (value) => {
  const cleaned = normalizeTextField(value);
  if (!cleaned) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.slice(0, 10);
  return dmyToISO(cleaned);
};

const buildEnrollmentPayload = (data = {}) => {
  const payload = {
    enrollment_no: normalizeTextField(data.enrollment_no) || null,
    temp_enroll_no: normalizeTextField(data.temp_enroll_no) || null,
    student_name: normalizeTextField(data.student_name),
    institute_id: normalizeTextField(data.institute_id),
    batch: normalizeTextField(data.batch),
    subcourse_id: normalizeTextField(data.subcourse_id),
    maincourse_id: normalizeTextField(data.maincourse_id),
  };

  const admissionDate = normalizeOptionalDate(data.admission_date);
  payload.admission_date = admissionDate || null;

  const enrollmentDate = normalizeOptionalDate(data.enrollment_date);
  payload.enrollment_date = enrollmentDate || null;

  payload.cancel = Boolean(data.cancel);

  return payload;
};

const getApiFieldErrors = (apiData) => {
  if (!apiData || typeof apiData !== 'object' || Array.isArray(apiData)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(apiData)
      .filter(([, value]) => Array.isArray(value) || typeof value === 'string')
      .map(([key, value]) => [key, Array.isArray(value) ? value.join(' ') : value])
  );
};

const getApiErrorMessage = (error, fallback = "Failed to save enrollment") => {
  const apiData = error?.response?.data;
  if (!apiData) return error?.message || fallback;
  if (typeof apiData === 'string') return apiData;
  if (apiData.detail) return apiData.detail;
  if (apiData.non_field_errors?.length) return apiData.non_field_errors.join(' ');

  const firstKey = Object.keys(apiData)[0];
  if (!firstKey) return error?.message || fallback;
  const firstVal = apiData[firstKey];
  const fieldLabel = firstKey.replace(/_/g, ' ');
  const fieldMessage = Array.isArray(firstVal) ? firstVal.join(' ') : String(firstVal);
  return `${fieldLabel}: ${fieldMessage}`;
};

  const buildCancelFormState = () => {
    return {
    id: null,
    enrollmentNoInput: '',
    enrollmentId: null,
    studentName: '',
    inward_no: '',
    inward_date: '',
    outward_no: '',
    outward_date: '',
    can_remark: '',
    status: CANCEL_STATUS_OPTIONS[0].value,
    loadingEnrollment: false,
    isSubmitting: false,
    error: ''
  };
};

const buildMultipleCancelRowState = () => ({
  rowId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  recordId: null,
  enrollmentNoInput: '',
  enrollmentId: null,
  studentName: '',
  currentStatus: '',
  status: CANCEL_STATUS_OPTIONS[0].value,
  loadingEnrollment: false,
  error: '',
});

const buildMultipleCancelFormState = () => ({
  inward_no: '',
  inward_date: '',
  outward_no: '',
  outward_date: '',
  can_remark: '',
  draftRow: buildMultipleCancelRowState(),
  rows: [],
  isSubmitting: false,
  error: '',
});

const Enrollment = ({ selectedTopbarMenu, setSelectedTopbarMenu, onToggleSidebar, onToggleChatbox }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [state, setState] = useState({
    enrollments: [],
    filteredEnrollments: [],
    searchTerm: "",
    isLoading: false,
    pagination: {
      currentPage: 1,
      pageSize: 100,
      totalItems: 0
    },
    validationErrors: {}
  });

  // Excel Upload State
  const [uploadState, setUploadState] = useState({
    file: null,
    sheets: [],
    selectedSheet: "",
    columns: [],
    sessionId: null,
    columnMapping: {},
    uploadProgress: 0,
    isUploading: false
  });

  // Rights
  const [rights, setRights] = useState({ can_view: true, can_create: true, can_edit: true, can_delete: true });

  // Form State
  const [formState, setFormState] = useState({
    data: createEmptyEnrollmentFormData(),
    isEditing: false
  });
  const [studentProfileState, setStudentProfileState] = useState({
    data: createEmptyStudentProfileFormData(),
    id: null,
    isLoading: false,
  });
  const [saveMessage, setSaveMessage] = useState({ type: '', text: '' });
  const [instOptions, setInstOptions] = useState([]);
  const [courseOptions, setCourseOptions] = useState([]);
  const [subcourseOptions, setSubcourseOptions] = useState([]);
  const [statusFilter, setStatusFilter] = useState('active');
  const [activeTab, setActiveTab] = useState('list');
  const [cancelRecords, setCancelRecords] = useState([]);
  const [cancelSearch, setCancelSearch] = useState('');
  const [cancelBatchFilter, setCancelBatchFilter] = useState('');
  const [cancelYearFilter, setCancelYearFilter] = useState(() => String(new Date().getFullYear()));
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelForm, setCancelForm] = useState(() => buildCancelFormState());
  const [cancelEntryMode, setCancelEntryMode] = useState('multiple');
  const [multipleCancelForm, setMultipleCancelForm] = useState(() => buildMultipleCancelFormState());
  useEffect(() => {
    API.get("/api/my-navigation/")
      .then(({ data }) => {
        const mods = data.modules || [];
        // Try to find Enrollment menu rights by name match
        let r = { can_view: false, can_create: false, can_edit: false, can_delete: false };
        for (const mod of mods) {
          for (const mn of (mod.menus || [])) {
            if ((mn.name || "").toLowerCase().includes("enrollment")) {
              r = mn.rights || r;
            }
          }
        }
        // Default: if nothing found, assume view-only
        setRights({ can_view: !!r.can_view, can_create: !!r.can_create, can_edit: !!r.can_edit, can_delete: !!r.can_delete });
      })
      .catch(() => {
        // Graceful fallback
        setRights({ can_view: true, can_create: true, can_edit: true, can_delete: true });
      });
  }, []);

  const filteredCancelRecords = useMemo(() => {
    let records = cancelRecords;
    if (cancelSearch.trim()) {
      const q = cancelSearch.toLowerCase();
      records = records.filter(r => 
        (r.enrollment_no && r.enrollment_no.toLowerCase().includes(q)) || 
        (r.student_name && r.student_name.toLowerCase().includes(q)) ||
        (r.outward_no && String(r.outward_no).toLowerCase().includes(q)) ||
        (r.inward_no && String(r.inward_no).toLowerCase().includes(q))
      );
    }
    if (cancelBatchFilter) {
      records = records.filter(r => 
        getCancelRecordBatch(r) === String(cancelBatchFilter)
      );
    }
    if (cancelYearFilter) {
      records = records.filter(r => getCancelRecordYear(r) === String(cancelYearFilter));
    }
    return records;
  }, [cancelRecords, cancelSearch, cancelBatchFilter, cancelYearFilter]);

  const cancelYearOptions = useMemo(() => {
    const years = new Set([String(new Date().getFullYear())]);
    cancelRecords.forEach((record) => {
      const year = getCancelRecordYear(record);
      if (year) years.add(year);
    });
    return [...years].sort((left, right) => Number(right) - Number(left));
  }, [cancelRecords]);

  const exportCancelAdmissionExcel = () => {
    if (!filteredCancelRecords.length) {
      toast.info("No cancellation records to export");
      return;
    }

    const exportRows = buildCancelExportRows(filteredCancelRecords);
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet["!cols"] = [
      { wch: 8 },
      { wch: 18 },
      { wch: 34 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 28 },
      { wch: 14 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cancel Admission");
    const batchPart = cancelBatchFilter ? `batch_${cancelBatchFilter}` : "all_batches";
    XLSX.writeFile(workbook, `cancel_admission_${batchPart}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportCancelAdmissionPDF = () => {
    if (!filteredCancelRecords.length) {
      toast.info("No cancellation records to export");
      return;
    }

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const title = "Cancel Admission Report";
    const batchLabel = cancelBatchFilter || "All";
    doc.setFontSize(14);
    doc.text(title, 14, 12);
    doc.setFontSize(10);
    doc.text(`Batch: ${batchLabel}`, 14, 18);
    doc.text(`Total Records: ${filteredCancelRecords.length}`, 14, 23);

    autoTable(doc, {
      startY: 28,
      head: [["Enrollment No", "Student Name", "Batch", "Inward No", "Inward Date", "Outward No", "Outward Date", "Remark", "Status"]],
      body: filteredCancelRecords.map((record) => [
        record.enrollment_no || "-",
        record.student_name || "-",
        getCancelRecordBatch(record) || "-",
        record.inward_no || "-",
        isoToDMY(record.inward_date) || "-",
        record.outward_no || "-",
        isoToDMY(record.outward_date) || "-",
        record.can_remark || "-",
        record.status || "-",
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: {
        1: { cellWidth: 52 },
        7: { cellWidth: 38 },
      },
    });

    const batchPart = cancelBatchFilter ? `batch_${cancelBatchFilter}` : "all_batches";
    doc.save(`cancel_admission_${batchPart}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  useEffect(() => {
    (async () => {
      try {
        const [inst, courses] = await Promise.all([
          fetchInstituteCodes(),
          fetchCourseCodes(),
        ]);

        setInstOptions(inst || []);
        setCourseOptions(courses || []);
      } catch (error) {
        console.error(error);
      }
    })();
  }, []);
  useEffect(() => {
  async function loadSubCourses() {

    if (!formState.data.maincourse_id) {
      setSubcourseOptions([]);
      return;
    }

    try {
      const subs = await fetchSubcourseNames(
        formState.data.maincourse_id
      );

      console.log("Subcourses:", subs);

      setSubcourseOptions(subs || []);

    } catch (err) {
      console.error(err);
      setSubcourseOptions([]);
    }
  }

  loadSubCourses();

}, [formState.data.maincourse_id]);

  // Memoized database fields
  const databaseFields = React.useMemo(() => getDatabaseFields(), []);

  // Load enrollments with debounce and pagination
    const loadEnrollments = useCallback(async (search = '', page = 1, overrideFilter) => {
    setState(prev => ({ ...prev, isLoading: true }));
    const filterToUse = overrideFilter ?? statusFilter;
    const cancelParam = filterToUse === 'active' ? 'no' : filterToUse === 'cancelled' ? 'yes' : undefined;
    try {
      const params = { page, limit: state.pagination.pageSize };
      if (search && search.trim()) params.search = search.trim();
      if (cancelParam) params.cancel = cancelParam;

      const { data } = await API.get('/api/enrollments/', { params });

      const items = data.results || data.items || (Array.isArray(data) ? data : []);
      const total = data.count || data.total || items.length;

      setState(prev => ({
        ...prev,
        enrollments: items,
        filteredEnrollments: items,
        pagination: {
          ...prev.pagination,
          currentPage: page,
          totalItems: total
        },
        isLoading: false
      }));
    } catch (error) {
      console.error("Error details:", error);
      toast.error(error.response?.data?.detail || error.message);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.pagination.pageSize, statusFilter]);


    const loadCancellationRecords = useCallback(async () => {
      setCancelLoading(true);
      try {
        const data = await getAdmissionCancellationList();
        const rows = Array.isArray(data)
          ? data
          : data?.results || data?.items || [];
        
        const parseDate = (value) => {
          if (!value) return 0;
          const text = String(value).trim();
          if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text)) {
            return new Date(text).getTime() || 0;
          }
          const match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
          if (match) {
            const year = match[3].length === 2 ? `20${match[3]}` : match[3];
            return new Date(`${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`).getTime() || 0;
          }
          return new Date(text).getTime() || 0;
        };

        const compareDescending = (left, right) => String(right || '').localeCompare(
          String(left || ''),
          undefined,
          { numeric: true, sensitivity: 'base' },
        );

        const sortedRows = [...rows].sort((a, b) => {
          const dateDifference = parseDate(b.outward_date) - parseDate(a.outward_date);
          if (dateDifference !== 0) return dateDifference;

          const outwardDifference = compareDescending(a.outward_no, b.outward_no);
          if (outwardDifference !== 0) return outwardDifference;

          return compareDescending(
            a.enrollment_no || a.enrollment?.enrollment_no,
            b.enrollment_no || b.enrollment?.enrollment_no,
          );
        });

        const missingBatchEnrollmentNos = [
          ...new Set(
            sortedRows
              .filter((row) => !getCancelRecordDirectBatch(row))
              .map(getCancelRecordEnrollmentNo)
              .filter(Boolean)
              .map((enrollmentNo) => enrollmentNo.toLowerCase())
          ),
        ];

        const batchByEnrollmentNo = {};
        await Promise.all(
          missingBatchEnrollmentNos.map(async (normalizedEnrollmentNo) => {
            try {
              const enrollment = await resolveEnrollment(normalizedEnrollmentNo);
              if (enrollment?.batch) {
                batchByEnrollmentNo[normalizedEnrollmentNo] = String(enrollment.batch);
              }
            } catch (error) {
              console.warn("Failed to resolve cancellation enrollment batch:", normalizedEnrollmentNo, error);
            }
          })
        );

        const hydratedRows = sortedRows.map((row) => {
          const directBatch = getCancelRecordDirectBatch(row);
          const normalizedEnrollmentNo = getCancelRecordEnrollmentNo(row).toLowerCase();
          const admissionBatch = directBatch || batchByEnrollmentNo[normalizedEnrollmentNo];
          if (!admissionBatch) return row;

          return {
            ...row,
            admission_batch: String(admissionBatch),
            enrollment: row.enrollment && typeof row.enrollment === 'object'
              ? { ...row.enrollment, batch: String(admissionBatch) }
              : row.enrollment,
          };
        });

        setCancelRecords(hydratedRows);
      } catch (error) {
        console.error("Cancellation fetch error:", error);
        toast.error(error.message || "Failed to load cancellation records");
      } finally {
        setCancelLoading(false);
      }
    }, []);



  // Search effect with cleanup
  useEffect(() => {
    const timer = setTimeout(() => {
      // Trigger search for 1+ chars, or load all on empty
      if (state.searchTerm.length >= 1 || state.searchTerm.length === 0) {
        loadEnrollments(state.searchTerm);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [state.searchTerm, loadEnrollments]);

  useEffect(() => {
    if (activeTab === 'cancel') {
      loadCancellationRecords();
    }
  }, [activeTab, loadCancellationRecords]);

  // Excel Upload Handlers
  const handleFileUpload = (event) => {
    const uploadedFile = event.target.files[0];
    if (uploadedFile) {
      setUploadState(prev => ({
        ...prev,
        file: uploadedFile,
        sheets: [],
        columns: [],
        selectedSheet: "",
        sessionId: null
      }));
    }
  };

  const handleFetchSheets = async () => {
    if (!uploadState.file) {
        toast.warning("Please select a valid Excel file (XLSX or XLS)");
        return;
    }

    // Validate file type
    const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
        'application/vnd.ms-excel'
    ];
    
    if (!validTypes.includes(uploadState.file.type)) {
        toast.error("Invalid file type. Please upload an Excel file (.xlsx or .xls)");
        return;
    }

  setUploadState(prev => ({ ...prev, isUploading: true }));
    try {
        const result = await initUpload(uploadState.file);
        if (!result?.session_id) {
            throw new Error("Server didn't return session ID");
        }
        
        const sheetsData = await getSheetNames(result.session_id);
        if (!sheetsData?.sheets) {
            throw new Error("Invalid sheets data received");
        }

        setUploadState(prev => ({
            ...prev,
            sessionId: result.session_id,
            sheets: sheetsData.sheets,
            uploadProgress: 100
        }));
    } catch (error) {
        console.error("Upload Failed:", error);
        toast.error(`Upload failed: ${error.message}`);
        setUploadState(prev => ({
            ...prev,
            file: null,
            sheets: [],
            uploadProgress: 0
        }));
  } finally {
    setUploadState(prev => ({ ...prev, isUploading: false }));
    }
};

  const handleSheetSelect = async (sheetName) => {
    setUploadState(prev => ({ ...prev, selectedSheet: sheetName }));
    try {
      const response = await getColumnHeaders(uploadState.sessionId, sheetName);
      if (response?.columns) {
        const initialMapping = {};
        databaseFields.forEach(field => {
          initialMapping[field.field] = "";
        });
        
        setUploadState(prev => ({
          ...prev,
          columns: response.columns,
          columnMapping: initialMapping
        }));
      }
    } catch (error) {
      console.error("Error fetching columns:", error);
      toast.error(error.message || "Failed to fetch columns");
    }
  };

  // Form Handlers
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaveMessage({ type: '', text: '' });
    
    const errors = validateEnrollmentData(formState.data);
    if (Object.keys(errors).length > 0) {
      setState(prev => ({ ...prev, validationErrors: errors }));
      return;
    }

    try {
      const payload = buildEnrollmentPayload(formState.data);
      if (formState.isEditing) {
        const updatedEnrollment = await updateEnrollment(formState.data.id, payload);
        const { photo_uploaded: photoUploaded, ...editableStudentProfileData } = studentProfileState.data;
        const profilePayload = {
          ...editableStudentProfileData,
          enrollment_no: formState.data.enrollment_no,
          birth_date: normalizeOptionalDate(studentProfileState.data.birth_date) || null,
          fees: studentProfileState.data.fees || null,
        };
        if (photoUploaded !== null && photoUploaded !== undefined) {
          profilePayload.photo_uploaded = Boolean(photoUploaded);
        }
        if (studentProfileState.id) {
          await API.patch(`/api/student-profiles/${studentProfileState.id}/`, profilePayload);
        } else {
          await API.post('/api/student-profiles/', profilePayload);
        }
        const refreshedEnrollment = getHydratedEnrollment({
          ...formState.data,
          ...(updatedEnrollment || {}),
          ...payload,
        });
        setFormState(prev => ({ ...prev, data: refreshedEnrollment }));
        setSaveMessage({ type: 'success', text: 'Enrollment and student profile updated successfully.' });
        toast.success("Enrollment updated successfully");
      } else {
        await createEnrollment(payload);
        toast.success("Enrollment created successfully");
        setFormState({ data: createEmptyEnrollmentFormData(), isEditing: false });
      }
      setState(prev => ({ ...prev, validationErrors: {} }));
      loadEnrollments();
    } catch (error) {
      const apiData = error?.response?.data;
      const fieldErrors = getApiFieldErrors(apiData);
      const message = getApiErrorMessage(error);
      if (Object.keys(fieldErrors).length > 0) {
        setState(prev => ({ ...prev, validationErrors: fieldErrors }));
      }
      setSaveMessage({ type: 'error', text: message });
      console.error("Error saving enrollment:", {
        message,
        status: error?.response?.status,
        responseData: apiData,
        payload: buildEnrollmentPayload(formState.data)
      });
      toast.error(message);
    }
  };

  const handleInputChange = (e) => {

  const { name, value } = e.target;

  setFormState(prev => ({
    ...prev,
    data: {
      ...prev.data,
      [name]: value,

      ...(name === "maincourse_id"
        ? {
            subcourse_id: ""
          }
        : {})
    }
  }));
};

  const handleEnrollmentStatusChange = (e) => {
    const { value } = e.target;
    setFormState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        cancel: value === 'CANCELLED',
      },
    }));
  };

  const resetCancelForm = () => {
    setCancelForm(buildCancelFormState());
  };

  const resetMultipleCancelForm = () => {
    setMultipleCancelForm(buildMultipleCancelFormState());
  };

  const handleCancelFormChange = (field, value) => {
    setCancelForm(prev => ({ ...prev, [field]: value, error: '' }));
  };

  const handleMultipleCancelFormChange = (field, value) => {
    setMultipleCancelForm(prev => ({ ...prev, [field]: value, error: '' }));
  };

  const handleMultipleRowChange = (field, value) => {
    setMultipleCancelForm(prev => ({
      ...prev,
      error: '',
      draftRow: field === 'enrollmentNoInput'
        ? {
          ...prev.draftRow,
          enrollmentNoInput: value,
          enrollmentId: null,
          studentName: '',
          currentStatus: '',
          error: '',
        }
        : {
          ...prev.draftRow,
          [field]: value,
          error: field === 'status' ? '' : prev.draftRow.error,
        },
    }));
  };

  const saveAdmissionCancellation = async (payload, enrollmentId, recordId = null) => {
    if (recordId) {
      return updateAdmissionCancellation(recordId, payload);
    }

    const existing = cancelRecords.find((record) => (
      Number(record.enrollment?.id || record.enrollment_id) === Number(enrollmentId)
    ));

    if (existing?.id) {
      return updateAdmissionCancellation(existing.id, payload);
    }

    return createAdmissionCancellation(payload);
  };

  const addMultipleCancelRow = async () => {
    const draft = multipleCancelForm.draftRow;
    const enrollmentNo = String(draft.enrollmentNoInput || '').trim();
    if (!enrollmentNo) {
      setMultipleCancelForm(prev => ({
        ...prev,
        draftRow: { ...prev.draftRow, error: 'Enter enrollment number.' },
      }));
      return;
    }

    let rowToAdd = draft;
    if (!rowToAdd.enrollmentId) {
      try {
        setMultipleCancelForm(prev => ({
          ...prev,
          draftRow: { ...prev.draftRow, loadingEnrollment: true, error: '' },
        }));
        const record = await resolveEnrollment(enrollmentNo);
        if (!record) throw new Error('Enrollment not found (exact match)');
        rowToAdd = hydrateCancelRowFromEnrollment(rowToAdd, record);
      } catch (error) {
        setMultipleCancelForm(prev => ({
          ...prev,
          draftRow: {
            ...prev.draftRow,
            loadingEnrollment: false,
            enrollmentId: null,
            studentName: '',
            error: error.message || 'Enrollment not found',
          },
        }));
        return;
      }
    }

    const normalizedEnrollment = String(rowToAdd.enrollmentNoInput || '').trim().toLowerCase();
    const duplicate = multipleCancelForm.rows.some((row) =>
      String(row.enrollmentNoInput || '').trim().toLowerCase() === normalizedEnrollment
    );

    if (duplicate) {
      setMultipleCancelForm(prev => ({
        ...prev,
        draftRow: { ...prev.draftRow, loadingEnrollment: false, error: 'This enrollment is already added.' },
      }));
      return;
    }

    setMultipleCancelForm(prev => ({
      ...prev,
      rows: [
        ...prev.rows,
        {
          ...rowToAdd,
          rowId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          loadingEnrollment: false,
          error: '',
        },
      ],
      draftRow: {
        ...buildMultipleCancelRowState(),
        status: rowToAdd.status,
      },
      error: '',
    }));
  };

  const removeMultipleCancelRow = (rowId) => {
    setMultipleCancelForm(prev => ({
      ...prev,
      rows: prev.rows.filter((row) => row.rowId !== rowId),
      error: '',
    }));
  };

  const extractApiErrorMessage = (error, fallbackMessage) => {
    const apiData = error?.response?.data;
    if (!apiData) return error?.message || fallbackMessage;
    if (typeof apiData === 'string') return apiData;
    if (apiData.detail) return String(apiData.detail);
    if (Array.isArray(apiData.non_field_errors) && apiData.non_field_errors.length > 0) {
      return apiData.non_field_errors.join(' ');
    }

    const firstKey = Object.keys(apiData)[0];
    if (!firstKey) return fallbackMessage;

    const firstVal = apiData[firstKey];
    if (Array.isArray(firstVal)) {
      return firstVal.join(' ');
    }
    return String(firstVal);
  };

  const fetchEnrollmentForCancellation = async (overrideEnrollmentNo) => {
    const looksLikeEvent =
      overrideEnrollmentNo &&
      typeof overrideEnrollmentNo === 'object' &&
      typeof overrideEnrollmentNo.preventDefault === 'function';

    const normalizedOverride = looksLikeEvent ? undefined : overrideEnrollmentNo;
    const enrollmentNo = String(normalizedOverride ?? cancelForm.enrollmentNoInput ?? '').trim();
    if (!enrollmentNo) {
      setCancelForm(prev => ({ ...prev, error: 'Enter enrollment number to fetch details.' }));
      return;
    }
    setCancelForm(prev => ({ ...prev, loadingEnrollment: true, error: '' }));
    try {
      const record = await resolveEnrollment(enrollmentNo);

      if (!record) {
         throw new Error('Enrollment not found (exact match)');
      }

      setCancelForm(prev => ({
        ...prev,
        ...hydrateCancelRowFromEnrollment(prev, record),
        loadingEnrollment: false,
      }));
    } catch (error) {
      setCancelForm(prev => ({
        ...prev,
        loadingEnrollment: false,
        enrollmentId: null,
        studentName: '',
        error: error.message || 'Enrollment not found',
      }));
    }
  };

  const fetchEnrollmentForMultipleRow = async (overrideEnrollmentNo) => {
    const enrollmentNo = String(overrideEnrollmentNo ?? multipleCancelForm.draftRow?.enrollmentNoInput ?? '').trim();

    if (!enrollmentNo) {
      setMultipleCancelForm(prev => ({
        ...prev,
        draftRow: { ...prev.draftRow, enrollmentId: null, studentName: '', error: 'Enter enrollment number to fetch details.' },
      }));
      return;
    }

    setMultipleCancelForm(prev => ({
      ...prev,
      error: '',
      draftRow: { ...prev.draftRow, loadingEnrollment: true, error: '' },
    }));

    try {
      const record = await resolveEnrollment(enrollmentNo);
      if (!record) {
        throw new Error('Enrollment not found (exact match)');
      }

      setMultipleCancelForm(prev => ({
        ...prev,
        draftRow: hydrateCancelRowFromEnrollment(prev.draftRow, record),
      }));
    } catch (error) {
      setMultipleCancelForm(prev => ({
        ...prev,
        draftRow: {
          ...prev.draftRow,
            loadingEnrollment: false,
            enrollmentId: null,
            studentName: '',
            currentStatus: '',
            error: error.message || 'Enrollment not found',
        },
      }));
    }
  };

  const startCancellationFromRow = (enrollment) => {
    forceShowCancelPanel();
    setCancelEntryMode('single');
    setCancelForm({
      ...buildCancelFormState(),
      enrollmentNoInput: String(enrollment.enrollment_no ?? ''),
      enrollmentId: enrollment.id,
      studentName: enrollment.student_name || '',
    });
  };

  const editCancellationRecord = (record) => {
    forceShowCancelPanel();
    setActiveTab('cancel');
    const enrollmentKey = record.enrollment?.id || record.enrollment_id || getCancelRecordEnrollmentNo(record);
    const matchingRecords = cancelRecords.filter((item) => (
      (item.enrollment?.id || item.enrollment_id || getCancelRecordEnrollmentNo(item)) === enrollmentKey
    ));

    if (matchingRecords.length > 1) {
      setCancelEntryMode('multiple');
      setMultipleCancelForm({
        ...buildMultipleCancelFormState(),
        inward_no: record.inward_no || '',
        inward_date: normalizeOptionalDate(record.inward_date),
        outward_no: record.outward_no || '',
        outward_date: normalizeOptionalDate(record.outward_date),
        can_remark: record.can_remark || '',
        rows: matchingRecords.map((item) => ({
          ...buildMultipleCancelRowState(),
          rowId: `edit-${item.id}`,
          recordId: item.id,
          enrollmentNoInput: getCancelRecordEnrollmentNo(item),
          enrollmentId: item.enrollment?.id || item.enrollment_id || null,
          studentName: item.student_name || item.enrollment?.student_name || '',
          status: item.status === 'REVOKED' ? 'ACTIVE' : 'CANCELLED',
        })),
      });
      return;
    }

    setCancelEntryMode('single');
    setCancelForm({
      ...buildCancelFormState(),
      id: record.id,
      enrollmentNoInput: getCancelRecordEnrollmentNo(record),
      enrollmentId: record.enrollment?.id || record.enrollment_id || null,
      studentName: record.student_name || record.enrollment?.student_name || '',
      inward_no: record.inward_no || '',
      inward_date: normalizeOptionalDate(record.inward_date),
      outward_no: record.outward_no || '',
      outward_date: normalizeOptionalDate(record.outward_date),
      can_remark: record.can_remark || '',
      status: record.status === 'REVOKED' ? 'ACTIVE' : 'CANCELLED',
    });
  };

  const removeCancellationRecord = async (record) => {
    if (!record?.id || !window.confirm(`Delete cancellation for ${getCancelRecordEnrollmentNo(record)}?`)) {
      return;
    }

    try {
      await deleteAdmissionCancellation(record.id);
      toast.success('Cancellation record deleted');
      if (cancelForm.id === record.id) resetCancelForm();
      await loadCancellationRecords();
      loadEnrollments(state.searchTerm, state.pagination.currentPage);
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Failed to delete cancellation'));
    }
  };

  const submitCancelForm = async () => {
    if (!cancelForm.enrollmentId) {
      setCancelForm(prev => ({ ...prev, error: 'Fetch an enrollment before saving.' }));
      return;
    }
    setCancelForm(prev => ({ ...prev, isSubmitting: true, error: '' }));
    try {
      const payload = {
        enrollment: cancelForm.enrollmentId,
        student_name: cancelForm.studentName,
        inward_no: cancelForm.inward_no || null,
        inward_date: cancelForm.inward_date || null,
        outward_no: cancelForm.outward_no || null,
        outward_date: cancelForm.outward_date || null,
        can_remark: cancelForm.can_remark || null,
        status: cancelForm.status === 'ACTIVE' ? 'REVOKED' : 'CANCELLED',
      };
      await saveAdmissionCancellation(payload, cancelForm.enrollmentId);
      toast.success("Admission cancellation saved");
      setCancelForm(buildCancelFormState());
      loadCancellationRecords();
      loadEnrollments(state.searchTerm, state.pagination.currentPage);
    } catch (error) {
      console.error("Cancel admission failed:", error);
      setCancelForm(prev => ({ ...prev, error: error.message || "Failed to save cancellation" }));
    } finally {
      setCancelForm(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  const submitMultipleCancelForm = async () => {
    const filledRows = multipleCancelForm.rows.filter(
      (row) => String(row.enrollmentNoInput || '').trim().length > 0
    );

    if (filledRows.length === 0) {
      setMultipleCancelForm(prev => ({
        ...prev,
        error: 'Add at least one record before saving.',
      }));
      return;
    }

    const unresolvedRows = filledRows.filter((row) => !row.enrollmentId);
    if (unresolvedRows.length > 0) {
      setMultipleCancelForm(prev => ({
        ...prev,
        error: `Fetch valid student details before saving: ${unresolvedRows.map((row) => row.enrollmentNoInput || 'Row').join(', ')}`,
      }));
      return;
    }

    setMultipleCancelForm(prev => ({ ...prev, isSubmitting: true, error: '' }));

    let successCount = 0;
    const failures = [];

    for (const row of filledRows) {
      const payload = {
        enrollment: row.enrollmentId,
        student_name: row.studentName,
        inward_no: multipleCancelForm.inward_no || null,
        inward_date: multipleCancelForm.inward_date || null,
        outward_no: multipleCancelForm.outward_no || null,
        outward_date: multipleCancelForm.outward_date || null,
        can_remark: multipleCancelForm.can_remark || null,
        status: row.status === 'ACTIVE' ? 'REVOKED' : 'CANCELLED',
      };

      try {
        await saveAdmissionCancellation(payload, row.enrollmentId, row.recordId);
        successCount += 1;
      } catch (error) {
        failures.push(`${row.enrollmentNoInput}: ${extractApiErrorMessage(error, 'Failed to save cancellation')}`);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} cancellation record${successCount > 1 ? 's' : ''} saved`);
      loadCancellationRecords();
      loadEnrollments(state.searchTerm, state.pagination.currentPage);
    }

    if (failures.length > 0) {
      setMultipleCancelForm(prev => ({
        ...prev,
        isSubmitting: false,
        error: failures.join(' | '),
      }));
      return;
    }

    setMultipleCancelForm(buildMultipleCancelFormState());
  };

  const getHydratedEnrollment = (enr) => ({
    ...enr,
    admission_date: isoToDMY(enr.admission_date) || '',
    enrollment_date: isoToDMY(enr.enrollment_date) || '',
    cancel: Boolean(enr.cancel),
    institute_id: enr.institute?.institute_id || enr.institute_id || enr.institute?.id || '',
    maincourse_id: enr.maincourse?.maincourse_id || enr.maincourse_id || '',
    subcourse_id: enr.subcourse?.subcourse_id || enr.subcourse_id || '',
    temp_enroll_no: enr.temp_enroll_no || '',
  });

  const getHydratedStudentProfile = (profile) => ({
    ...createEmptyStudentProfileFormData(),
    ...profile,
    birth_date: normalizeOptionalDate(profile?.birth_date),
    fees: profile?.fees ?? '',
    hostel_required: !!profile?.hostel_required,
    is_d2d: !!profile?.is_d2d,
  });

  const openEnrollmentEditor = async (enr) => {
    const hydrated = getHydratedEnrollment(enr);
    setFormState({ data: hydrated, isEditing: true });
    setSaveMessage({ type: '', text: '' });
    setStudentProfileState({
      data: createEmptyStudentProfileFormData(),
      id: null,
      isLoading: true,
    });
    setSelectedAction("➕");
    if (!panelOpen) setPanelOpen(true);

    try {
      const response = await API.get('/api/student-profiles/', {
        params: { search: hydrated.enrollment_no, limit: 20 },
      });
      const profiles = response.data?.results || (Array.isArray(response.data) ? response.data : []);
      const profile = profiles.find((item) => (
        String(item.enrollment || item.enrollment_no || '').trim().toLowerCase() ===
        String(hydrated.enrollment_no || '').trim().toLowerCase()
      ));
      setStudentProfileState({
        data: getHydratedStudentProfile(profile),
        id: profile?.id || null,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error loading student profile:', error);
      setStudentProfileState({
        data: createEmptyStudentProfileFormData(),
        id: null,
        isLoading: false,
      });
      toast.error('Student profile could not be loaded');
    }
  };

  const handleStudentProfileChange = (event) => {
    const { name, value, type, checked } = event.target;
    const limitedValue = ['contact_no', 'aadhar_no', 'abc_id'].includes(name)
      ? value.slice(0, 16)
      : value;
    setStudentProfileState((prev) => ({
      ...prev,
      data: { ...prev.data, [name]: type === 'checkbox' ? checked : limitedValue },
    }));
  };

  // Optimized render methods
  const renderSearchView = () => (
    <div>
      {state.isLoading ? (
        <div className="text-center py-4">Loading...</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">Enroll No</th>
                  <th className="border p-2 text-left">Student</th>
                  <th className="border p-2 text-left">Institute</th>
                  <th className="border p-2 text-left">Sub Course</th>
                  <th className="border p-2 text-left">Batch</th>
                  
                  <th className="border p-2 text-left">Status</th>
                  <th className="border p-2 text-left">Actions</th>
                  {rights.can_edit || rights.can_delete ? (<th className="border p-2 text-left">Actions</th>) : null}
                </tr>
              </thead>
              <tbody>
                {state.filteredEnrollments.map((enr, idx) => (
                  <tr
                    key={enr.id || enr.enrollment_no || `enr-${idx}`}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => {
                      openEnrollmentEditor(enr);
                    }}
                  >
                    <td className="border px-2 py-0.5">{enr.enrollment_no}</td>
                    <td className="border px-2 py-0.5">{enr.student_name}</td>
                    <td className="border px-2 py-0.5 text-sm">{enr.institute?.institute_code || enr.institute_id}</td>
                    <td className="border px-2 py-0.5 text-sm">{enr.subcourse?.name || enr.subcourse_id}</td>
                    <td className="border px-2 py-0.5">{enr.batch}</td>
                    
                    <td className="border px-2 py-0.5">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${enr.cancel ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
                        {enr.cancel ? 'Cancelled' : 'Active'}
                      </span>
                    </td>
                    {(rights.can_edit || rights.can_delete) && (
                      <td className="border px-2 py-0.5">
                        <div className="flex items-center gap-2">
                          {rights.can_edit && (
                            <button
                              title="Edit"
                              className="w-5 h-5 flex items-center justify-center icon-edit-button shadow-md rounded"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEnrollmentEditor(enr);
                              }}
                            >
                              <FaEdit size={12} />
                            </button>
                          )}
                          
                          {rights.can_delete && (
                            <button
                              title="Delete"
                              className="w-5 h-5 flex items-center justify-center icon-delete-button shadow-md rounded"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await deleteEnrollment(enr.id);
                                  toast.success("Deleted");
                                  loadEnrollments(state.searchTerm, state.pagination.currentPage);
                                } catch (err) {
                                  toast.error(err.message);
                                }
                              }}
                            >
                              <FaTrash size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>) )}
              </tbody>
            </table>
          </div>
          {/* Pagination controls */}
        </>
      )}
    </div>
  );

  const renderCancellationView = () => (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Cancel Admission</h2>
          <p className="text-sm text-slate-500">
            Showing {filteredCancelRecords.length} record{filteredCancelRecords.length === 1 ? "" : "s"}
            {cancelYearFilter ? ` for cancellation year ${cancelYearFilter}` : ""}
            {cancelBatchFilter ? ` and batch ${cancelBatchFilter}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={EXPORT_EXCEL_BUTTON_CLASS}
            onClick={exportCancelAdmissionExcel}
            disabled={cancelLoading || filteredCancelRecords.length === 0}
            title="Export Excel"
            aria-label="Export Excel"
          >
            <FaFileExcel size={19} color="#1D6F42" />
          </button>
          <button
            type="button"
            className={EXPORT_PDF_BUTTON_CLASS}
            onClick={exportCancelAdmissionPDF}
            disabled={cancelLoading || filteredCancelRecords.length === 0}
            title="Export PDF"
            aria-label="Export PDF"
          >
            <FaFilePdf size={19} color="#B91C1C" />
          </button>
          <button
            className="refresh-icon-button"
            onClick={loadCancellationRecords}
            disabled={cancelLoading}
            title={cancelLoading ? 'Refreshing' : 'Refresh'}
            aria-label={cancelLoading ? 'Refreshing' : 'Refresh'}
          >
            <span className={`refresh-symbol ${cancelLoading ? 'animate-spin' : ''}`} aria-hidden="true">↻</span>
          </button>
        </div>
      </div>
      {cancelLoading ? (
        <div className="text-center py-4">Loading cancellations...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] table-fixed border-collapse border">
            <colgroup>
              <col className="w-[140px]" />
              <col className="w-[220px]" />
              <col className="w-[70px]" />
              <col className="w-[110px]" />
              <col className="w-[110px]" />
              <col className="w-[110px]" />
              <col className="w-[110px]" />
              <col className="w-[140px]" />
              <col className="w-[110px]" />
              <col className="w-[100px]" />
            </colgroup>
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Enrollment No</th>
                <th className="border p-2 text-left">Student Name</th>
                <th className="border p-2 text-left">Batch</th>
                <th className="border p-2 text-left">Inward No</th>
                <th className="border p-2 text-left">Inward Date</th>
                <th className="border p-2 text-left">Outward No</th>
                <th className="border p-2 text-left">Outward Date</th>
                <th className="border p-2 text-left">Remark</th>
                <th className="border p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredCancelRecords.length === 0 ? (
                <tr>
                  <td className="border p-4 text-center" colSpan={10}>No cancellation records</td>
                </tr>
              ) : (
                filteredCancelRecords.map(record => (
                  <tr
                    key={record.id}
                    className="cursor-pointer hover:bg-indigo-50"
                    onClick={() => editCancellationRecord(record)}
                  >
                    <td className="border px-2 py-1 text-sm align-top whitespace-nowrap">{getCancelRecordEnrollmentNo(record)}</td>
                    <td className="border px-2 py-1 text-sm align-top break-words">{record.student_name}</td>
                    <td className="border px-2 py-1 text-sm align-top">{getCancelRecordBatch(record) || '-'}</td>
                    <td className="border px-2 py-1 text-sm align-top break-words">{record.inward_no || '-'}</td>
                    <td className="border px-2 py-1 text-sm align-top whitespace-nowrap">{isoToDMY(record.inward_date) || '-'}</td>
                    <td className="border px-2 py-1 text-sm align-top break-words">{record.outward_no || '-'}</td>
                    <td className="border px-2 py-1 text-sm align-top whitespace-nowrap">{isoToDMY(record.outward_date) || '-'}</td>
                    <td className="border px-2 py-1 text-sm align-top break-words">{record.can_remark || '-'}</td>
                    <td className="border px-2 py-1 text-sm align-top">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${record.status === 'CANCELLED' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="border px-2 py-1 text-sm align-top">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded bg-blue-600 text-white hover:bg-blue-700"
                          title="Edit cancellation"
                          aria-label="Edit cancellation"
                          onClick={(event) => {
                            event.stopPropagation();
                            editCancellationRecord(record);
                          }}
                        >
                          <FaEdit size={12} />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded bg-red-600 text-white hover:bg-red-700"
                          title="Delete cancellation"
                          aria-label="Delete cancellation"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeCancellationRecord(record);
                          }}
                        >
                          <FaTrash size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderFormView = () => (
    <div className={`${ENROLLMENT_FORM_PANEL_CLASS} bg-gradient-to-br from-slate-50 via-white to-sky-50/60`}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 shadow-sm">
            <FaGraduationCap size={22} />
          </span>
          <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Enrollment workspace</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {formState.isEditing ? "Edit Enrollment" : "Add New Enrollment"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {formState.isEditing
              ? "Update enrollment, status, dates, and student profile information."
              : "Create an enrollment and complete its academic information."}
          </p>
          </div>
        </div>
        {formState.isEditing && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${formState.data.cancel ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {formState.data.cancel ? 'Cancelled enrollment' : 'Active enrollment'}
          </span>
        )}
      </div>
      {saveMessage.text && (
        <p className={`mb-4 rounded-lg px-3 py-2 text-sm font-medium ${saveMessage.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
          {saveMessage.text}
        </p>
      )}
      {!rights.can_create && !formState.isEditing && (
        <p className="text-sm text-red-600 mb-2">You do not have rights to create enrollments.</p>
      )}
      {!rights.can_edit && formState.isEditing && (
        <p className="text-sm text-red-600 mb-2">You do not have rights to edit enrollments.</p>
      )}
      <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
        <section className={`${ENROLLMENT_FORM_SECTION_CLASS} border-sky-100 bg-sky-50/40`}>
          <div className={ENROLLMENT_FORM_SECTION_HEADER_CLASS}>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
              <FaGraduationCap size={14} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-sky-900">Enrollment Details</h3>
              <p className="text-[11px] text-slate-500">Basic enrollment and academic information</p>
            </div>
          </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className={ENROLLMENT_FORM_LABEL_CLASS}>Enrollment Number</label>
            <input
              type="text"
              name="enrollment_no"
              value={formState.data.enrollment_no}
              onChange={handleInputChange}
              className={`${ENROLLMENT_FORM_FIELD_CLASS} ${state.validationErrors.enrollment_no ? ENROLLMENT_FORM_FIELD_ERROR_CLASS : ''}`}
              disabled={formState.isEditing}
            />
            {state.validationErrors.enrollment_no && (
              <p className="text-red-500 text-sm">{state.validationErrors.enrollment_no}</p>
            )}
          </div>

          <div>
            <label className={ENROLLMENT_FORM_LABEL_CLASS}>Temporary Number</label>
            <input
              type="text"
              name="temp_enroll_no"
              value={formState.data.temp_enroll_no}
              onChange={handleInputChange}
              className={`${ENROLLMENT_FORM_FIELD_CLASS} ${state.validationErrors.temp_enroll_no ? ENROLLMENT_FORM_FIELD_ERROR_CLASS : ''}`}
            />
            {state.validationErrors.temp_enroll_no && (
              <p className="text-red-500 text-sm">{state.validationErrors.temp_enroll_no}</p>
            )}
          </div>

          <div>
            <label className={ENROLLMENT_FORM_LABEL_CLASS}>Student Name *</label>
            <input
              type="text"
              name="student_name"
              value={formState.data.student_name}
              onChange={handleInputChange}
              className={`${ENROLLMENT_FORM_FIELD_CLASS} ${state.validationErrors.student_name ? ENROLLMENT_FORM_FIELD_ERROR_CLASS : ''}`}
              required
            />
            {state.validationErrors.student_name && (
              <p className="text-red-500 text-sm">{state.validationErrors.student_name}</p>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className={ENROLLMENT_FORM_LABEL_CLASS}>Institute Code *</label>
            <select
              name="institute_id"
              value={formState.data.institute_id}
              onChange={handleInputChange}
              className={`${ENROLLMENT_FORM_FIELD_CLASS} ${state.validationErrors.institute_id ? ENROLLMENT_FORM_FIELD_ERROR_CLASS : ''}`}
              required
            >
              <option value="">Select institute</option>
              {instOptions.map((inst) => {
                const value = inst.institute_id ?? inst.id ?? '';
                const label = inst.institute_code ? `${inst.institute_code}${inst.institute_name ? ` - ${inst.institute_name}` : ''}` : (inst.institute_name || value);
                return (
                  <option key={value || inst.institute_code} value={value}>{label}</option>
                );
              })}
            </select>
            {state.validationErrors.institute_id && (
              <p className="text-red-500 text-sm">{state.validationErrors.institute_id}</p>
            )}
          </div>

          <div>
            <label className={ENROLLMENT_FORM_LABEL_CLASS}>Course Code *</label>
            <select
              name="maincourse_id"
              value={formState.data.maincourse_id}
              onChange={handleInputChange}
              className={`${ENROLLMENT_FORM_FIELD_CLASS} ${state.validationErrors.maincourse_id ? ENROLLMENT_FORM_FIELD_ERROR_CLASS : ''}`}
              required
            >
              <option value="">Select main course</option>
              {courseOptions.map((course) => {
                const value = course.maincourse_id ?? course.id ?? '';
                const label = course.course_code
                  ? `${course.course_code}${course.course_name ? ` - ${course.course_name}` : ''}`
                  : (course.course_name || course.maincourse_id || value);
                return (
                  <option key={value || course.maincourse_id} value={value}>{label}</option>
                );
              })}
            </select>
            {state.validationErrors.maincourse_id && (
              <p className="text-red-500 text-sm">{state.validationErrors.maincourse_id}</p>
            )}
          </div>

          <div>
            <label className={ENROLLMENT_FORM_LABEL_CLASS}>Subcourse Name *</label>
            <select
              name="subcourse_id"
              value={formState.data.subcourse_id}
              onChange={handleInputChange}
              className={`${ENROLLMENT_FORM_FIELD_CLASS} ${state.validationErrors.subcourse_id ? ENROLLMENT_FORM_FIELD_ERROR_CLASS : ''}`}
              required
            >
              <option value="">Select subcourse</option>
              {subcourseOptions.map((subcourse) => {
                const value = subcourse.subcourse_id ?? subcourse.id ?? '';
                const label = subcourse.subcourse_name
                  ? `${subcourse.subcourse_name}${subcourse.subcourse_id ? ` (${subcourse.subcourse_id})` : ''}`
                  : (subcourse.subcourse_id || value);
                return (
                  <option key={value || subcourse.subcourse_id} value={value}>{label}</option>
                );
              })}
            </select>
            {state.validationErrors.subcourse_id && (
              <p className="text-red-500 text-sm">{state.validationErrors.subcourse_id}</p>
            )}
          </div>

          <div>
            <label className={ENROLLMENT_FORM_LABEL_CLASS}>Batch *</label>
            <select
              name="batch"
              value={formState.data.batch}
              onChange={handleInputChange}
              className={`${ENROLLMENT_FORM_FIELD_CLASS} ${state.validationErrors.batch ? ENROLLMENT_FORM_FIELD_ERROR_CLASS : ''}`}
              required
            >
              <option value="">Select batch</option>
              {BATCH_OPTIONS.map((batch) => (
                <option key={batch} value={batch}>{batch}</option>
              ))}
            </select>
            {state.validationErrors.batch && (
              <p className="text-red-500 text-sm">{state.validationErrors.batch}</p>
            )}
          </div>
        </div>
        </section>

        {formState.isEditing && (
          <section className={`${ENROLLMENT_FORM_SECTION_CLASS} border-emerald-100 bg-emerald-50/30`}>
            <div className={ENROLLMENT_FORM_SECTION_HEADER_CLASS}>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <FaUser size={13} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-emerald-900">Student Profile</h3>
                <p className="text-[11px] text-slate-500">Personal and demographic information</p>
              </div>
            </div>
            {studentProfileState.isLoading ? (
              <p className="text-sm text-slate-500">Loading student profile...</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div>
                  <label className={ENROLLMENT_FORM_LABEL_CLASS}>Status</label>
                  <select
                    name="cancel_status"
                    value={formState.data.cancel ? 'CANCELLED' : 'ACTIVE'}
                    onChange={handleEnrollmentStatusChange}
                    className={`${ENROLLMENT_FORM_FIELD_CLASS} ${formState.data.cancel ? 'border-rose-200 focus:border-rose-400 focus:ring-rose-100' : 'border-emerald-200 focus:border-emerald-400 focus:ring-emerald-100'}`}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className={ENROLLMENT_FORM_LABEL_CLASS}>Admission Date</label>
                  <input
                    type="date"
                    name="admission_date"
                    value={normalizeOptionalDate(formState.data.admission_date)}
                    onChange={handleInputChange}
                    className={ENROLLMENT_FORM_FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={ENROLLMENT_FORM_LABEL_CLASS}>Registration Date</label>
                  <input
                    type="date"
                    name="enrollment_date"
                    value={normalizeOptionalDate(formState.data.enrollment_date)}
                    onChange={handleInputChange}
                    className={ENROLLMENT_FORM_FIELD_CLASS}
                  />
                </div>
                {['gender', 'category'].map((field) => (
                  <div key={field}>
                    <label className={ENROLLMENT_FORM_LABEL_CLASS}>
                      {field === 'program_medium' ? 'Program Medium' : field[0].toUpperCase() + field.slice(1)}
                    </label>
                    <select
                      name={field}
                      value={studentProfileState.data[field]}
                      onChange={handleStudentProfileChange}
                      className={`${ENROLLMENT_FORM_FIELD_CLASS} max-w-[220px]`}
                    >
                      {STUDENT_PROFILE_SELECT_OPTIONS[field].map((option) => (
                        <option key={option || 'empty'} value={option}>{option || 'Select'}</option>
                      ))}
                    </select>
                  </div>
                ))}

                <div>
                  <label className={ENROLLMENT_FORM_LABEL_CLASS}>Birth Date</label>
                  <input
                    type="date"
                    name="birth_date"
                    value={studentProfileState.data.birth_date}
                    onChange={handleStudentProfileChange}
                    className={`${ENROLLMENT_FORM_FIELD_CLASS} max-w-[220px]`}
                  />
                </div>
              </div>
            )}
          </section>
        )}

        {formState.isEditing && !studentProfileState.isLoading && (
          <section className={`${ENROLLMENT_FORM_SECTION_CLASS} border-amber-100 bg-amber-50/30`}>
            <div className={ENROLLMENT_FORM_SECTION_HEADER_CLASS}>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <FaAddressCard size={13} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-amber-900">Additional Student Information</h3>
                <p className="text-[11px] text-slate-500">Contact, identity, academic, address and other details</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ['contact_no', 'Contact Number'],
                  ['email', 'Email'],
                  ['aadhar_no', 'Aadhar Number'],
                  ['abc_id', 'ABC ID'],
                  ['mobile_adhar', 'Aadhar Mobile'],
                  ['name_adhar', 'Aadhar Name'],
                  ['mother_name', 'Mother Name'],
                  ['father_name', 'Father Name'],
                ].map(([field, label]) => (
                  <div key={field}>
                    <label className={ENROLLMENT_FORM_LABEL_CLASS}>{label}</label>
                    <input
                      type={field === 'email' ? 'email' : 'text'}
                      name={field}
                      value={studentProfileState.data[field]}
                      onChange={handleStudentProfileChange}
                      maxLength={['contact_no', 'aadhar_no', 'abc_id'].includes(field) ? 16 : undefined}
                      inputMode={['contact_no', 'aadhar_no', 'abc_id'].includes(field) ? 'numeric' : undefined}
                      className={ENROLLMENT_FORM_FIELD_CLASS}
                    />
                  </div>
                ))}
                {[
                  ['program_medium', 'Program Medium'],
                  ['specialisation', 'Specialisation'],
                  ['city1', 'City'],
                  ['city2', 'Alternate City'],
                  ['address1', 'Address'],
                  ['address2', 'Alternate Address'],
                  ['fees', 'Fees'],
                ].map(([field, label]) => (
                  <div key={field}>
                    <label className={ENROLLMENT_FORM_LABEL_CLASS}>{label}</label>
                    {field === 'program_medium' ? (
                      <select
                        name={field}
                        value={studentProfileState.data[field]}
                        onChange={handleStudentProfileChange}
                        className={ENROLLMENT_FORM_FIELD_CLASS}
                      >
                        {STUDENT_PROFILE_SELECT_OPTIONS.program_medium.map((option) => (
                          <option key={option || 'empty'} value={option}>{option || 'Select'}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field === 'fees' ? 'number' : 'text'}
                        name={field}
                        value={studentProfileState.data[field]}
                        onChange={handleStudentProfileChange}
                        className={ENROLLMENT_FORM_FIELD_CLASS}
                      />
                    )}
                  </div>
                ))}
                <div className="col-span-full flex flex-wrap items-center justify-between gap-3 border-t border-amber-100 pt-3">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                      <input
                        type="checkbox"
                        name="hostel_required"
                        checked={studentProfileState.data.hostel_required}
                        onChange={handleStudentProfileChange}
                      />
                      Hostel Required
                    </label>
                    <label className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                      <input
                        type="checkbox"
                        name="is_d2d"
                        checked={studentProfileState.data.is_d2d}
                        onChange={handleStudentProfileChange}
                      />
                      Direct to Degree
                    </label>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="reset-button inline-flex items-center gap-2"
                      onClick={() => setSelectedTopbarMenu && setSelectedTopbarMenu("🔍")}
                    >
                      <FaTimes size={12} />
                      Cancel
                    </button>
                    {rights.can_edit && (
                      <button
                        type="submit"
                        className="save-button inline-flex items-center gap-2"
                      >
                        <FaSave size={14} />
                        Update
                      </button>
                    )}
                  </div>
                </div>
            </div>
          </section>
        )}
        {(!formState.isEditing || studentProfileState.isLoading) && (
          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-rose-500">*</span> Required fields
            <span className="mx-2 text-slate-300">|</span>
            Character limits are applied where required
          </p>
          <div className="flex justify-end gap-2">
          <button
            type="button"
            className="reset-button inline-flex items-center gap-2"
            onClick={() => setSelectedTopbarMenu && setSelectedTopbarMenu("🔍")}
          >
            <FaTimes size={12} />
            Cancel
          </button>
          {(formState.isEditing ? rights.can_edit : rights.can_create) && (
            <button
              type="submit"
              className="save-button inline-flex items-center gap-2"
            >
              <FaSave size={14} />
              {formState.isEditing ? "Update" : "Save"}
            </button>
          )}
          </div>
        </div>
        )}
      </form>
    </div>
  );

  const renderExcelUpload = () => (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Excel Import</h2>
      {/* Excel upload content */}
    </div>
  );

  const renderCancelAdmissionForm = () => {
    const isSingleMode = cancelEntryMode === 'single';
    const draftRow = multipleCancelForm.draftRow || buildMultipleCancelRowState();

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Cancel Admission Entry</h2>
          <label className="text-sm min-w-[180px]">
            <span className="block mb-1 font-medium">Entry Type</span>
            <select
              value={cancelEntryMode}
              onChange={(e) => setCancelEntryMode(e.target.value)}
              className="border rounded px-3 py-2 w-full"
            >
              {CANCEL_ENTRY_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>

        {isSingleMode ? (
          <>
            <div className="grid grid-cols-12 gap-4 items-end">
              <div className="col-span-12 md:col-span-5">
                <label className="block mb-1">Enrollment Number *</label>
                <input
                  type="text"
                  value={cancelForm.enrollmentNoInput}
                  onChange={(e) =>
                    handleCancelFormChange('enrollmentNoInput', e.target.value)
                  }
                  onBlur={() => fetchEnrollmentForCancellation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      fetchEnrollmentForCancellation();
                    }
                  }}
                  className="border rounded px-3 py-2 w-full"
                  placeholder={cancelForm.loadingEnrollment ? "Fetching..." : "Type enrollment number"}
                />
              </div>

              <div className="col-span-12 md:col-span-7">
                <label className="block mb-1">Student Name</label>
                <input
                  type="text"
                  value={cancelForm.studentName}
                  readOnly
                  className="border rounded px-3 py-2 w-full bg-gray-100"
                  placeholder="Auto after fetch"
                />
              </div>

              <div className="col-span-12 md:col-span-2">
                <label className="block mb-1">Inward No</label>
                <input
                  type="text"
                  value={cancelForm.inward_no}
                  onChange={(e) =>
                    handleCancelFormChange('inward_no', e.target.value)
                  }
                  className="border rounded px-3 py-2 w-full"
                />
              </div>

              <div className="col-span-12 md:col-span-2">
                <label className="block mb-1">Inward Date</label>
                <input
                  type="date"
                  value={cancelForm.inward_date}
                  onChange={(e) =>
                    handleCancelFormChange('inward_date', e.target.value)
                  }
                  className="border rounded px-3 py-2 w-full"
                />
              </div>

              <div className="col-span-12 md:col-span-3">
                <label className="block mb-1">Outward No</label>
                <input
                  type="text"
                  value={cancelForm.outward_no}
                  onChange={(e) =>
                    handleCancelFormChange('outward_no', e.target.value)
                  }
                  className="border rounded px-3 py-2 w-full"
                />
              </div>

              <div className="col-span-12 md:col-span-3">
                <label className="block mb-1">Outward Date</label>
                <input
                  type="date"
                  value={cancelForm.outward_date}
                  onChange={(e) =>
                    handleCancelFormChange('outward_date', e.target.value)
                  }
                  className="border rounded px-3 py-2 w-full"
                />
              </div>

              <div className="col-span-12 md:col-span-2">
                <label className="block mb-1">Status</label>
                <select
                  value={cancelForm.status}
                  onChange={(e) =>
                    handleCancelFormChange('status', e.target.value)
                  }
                  className="border rounded px-3 py-2 w-full"
                >
                  {CANCEL_STATUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-12 md:col-span-7">
                <label className="block mb-1">Cancellation Remark</label>
                <input
                  type="text"
                  value={cancelForm.can_remark}
                  onChange={(e) =>
                    handleCancelFormChange('can_remark', e.target.value)
                  }
                  className="border rounded px-3 py-2 w-full"
                  placeholder="Reason / note for cancellation"
                />
              </div>

              <div className="col-span-12 md:col-span-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="px-4 py-2 border rounded"
                  onClick={resetCancelForm}
                  disabled={cancelForm.isSubmitting}
                >
                  Reset
                </button>

                <button
                  type="button"
                  className="px-5 py-2 bg-red-600 text-white rounded"
                  onClick={submitCancelForm}
                  disabled={cancelForm.isSubmitting}
                >
                  {cancelForm.isSubmitting ? 'Saving...' : 'Save Cancellation'}
                </button>
              </div>
            </div>

            {cancelForm.error && (
              <p className="text-sm text-red-600 mt-2">{cancelForm.error}</p>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block mb-1">Inward No</label>
                <input
                  type="text"
                  value={multipleCancelForm.inward_no}
                  onChange={(e) => handleMultipleCancelFormChange('inward_no', e.target.value)}
                  className="border rounded px-3 py-2 w-full"
                  placeholder="Applied to all rows"
                />
              </div>
              <div>
                <label className="block mb-1">Inward Date</label>
                <input
                  type="date"
                  value={multipleCancelForm.inward_date}
                  onChange={(e) => handleMultipleCancelFormChange('inward_date', e.target.value)}
                  className="border rounded px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block mb-1">Outward No</label>
                <input
                  type="text"
                  value={multipleCancelForm.outward_no}
                  onChange={(e) => handleMultipleCancelFormChange('outward_no', e.target.value)}
                  className="border rounded px-3 py-2 w-full"
                  placeholder="Applied to all rows"
                />
              </div>
              <div>
                <label className="block mb-1">Outward Date</label>
                <input
                  type="date"
                  value={multipleCancelForm.outward_date}
                  onChange={(e) => handleMultipleCancelFormChange('outward_date', e.target.value)}
                  className="border rounded px-3 py-2 w-full"
                />
              </div>
              <div className="xl:col-span-1">
                <label className="block mb-1">Cancellation Remark</label>
                <input
                  type="text"
                  value={multipleCancelForm.can_remark}
                  onChange={(e) => handleMultipleCancelFormChange('can_remark', e.target.value)}
                  className="border rounded px-3 py-2 w-full"
                  placeholder="Optional, applied to all"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-4">
                  <label className="block mb-1">Enrollment Number *</label>
                  <input
                    type="text"
                    value={draftRow.enrollmentNoInput}
                    onChange={(e) => handleMultipleRowChange('enrollmentNoInput', e.target.value)}
                    onBlur={() => fetchEnrollmentForMultipleRow()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        fetchEnrollmentForMultipleRow();
                      }
                    }}
                    className="border rounded px-3 py-2 w-full"
                    placeholder={draftRow.loadingEnrollment ? "Fetching..." : "Auto fetch on blur"}
                    disabled={multipleCancelForm.isSubmitting}
                  />
                </div>

                <div className="md:col-span-5">
                  <label className="block mb-1">Student Name</label>
                  <input
                    type="text"
                    value={draftRow.studentName}
                    readOnly
                    className="border rounded px-3 py-2 w-full bg-white"
                    placeholder="Auto after fetch"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block mb-1">Status</label>
                  <select
                    value={draftRow.status}
                    onChange={(e) => handleMultipleRowChange('status', e.target.value)}
                    className="border rounded px-3 py-2 w-full"
                    disabled={multipleCancelForm.isSubmitting}
                  >
                    {CANCEL_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-1 flex justify-end">
                  <button
                    type="button"
                    className="h-10 w-10 rounded-lg bg-emerald-600 text-xl font-semibold text-white shadow disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={addMultipleCancelRow}
                    disabled={multipleCancelForm.isSubmitting || draftRow.loadingEnrollment}
                    title="Add record"
                    aria-label="Add record"
                  >
                    +
                  </button>
                </div>
              </div>

              {draftRow.error && <p className="text-sm text-red-600 mt-2">{draftRow.error}</p>}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full border-collapse bg-white text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-left w-16">No.</th>
                    <th className="border p-2 text-left">Enrollment No.</th>
                    <th className="border p-2 text-left">Student Name</th>
                    <th className="border p-2 text-left w-44">Status</th>
                    <th className="border p-2 text-left w-24">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {multipleCancelForm.rows.length === 0 ? (
                    <tr>
                      <td className="border p-4 text-center text-slate-500" colSpan={5}>No records added</td>
                    </tr>
                  ) : (
                    multipleCancelForm.rows.map((row, index) => (
                      <tr key={row.rowId}>
                        <td className="border p-2">{index + 1}</td>
                        <td className="border p-2 font-semibold">{row.enrollmentNoInput}</td>
                        <td className="border p-2">{row.studentName}</td>
                        <td className="border p-2">
                          <select
                            value={row.status}
                            onChange={(e) => {
                              const nextStatus = e.target.value;
                              setMultipleCancelForm(prev => ({
                                ...prev,
                                rows: prev.rows.map((item) => (
                                  item.rowId === row.rowId ? { ...item, status: nextStatus } : item
                                )),
                              }));
                            }}
                            className="border rounded px-2 py-1.5 w-full"
                            disabled={multipleCancelForm.isSubmitting}
                          >
                            {CANCEL_STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="border p-2">
                          <button
                            type="button"
                            className="px-3 py-1.5 border rounded text-sm text-red-600 disabled:opacity-50"
                            onClick={() => removeMultipleCancelRow(row.rowId)}
                            disabled={multipleCancelForm.isSubmitting}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-4 py-2 border rounded"
                  onClick={resetMultipleCancelForm}
                  disabled={multipleCancelForm.isSubmitting}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="px-5 py-2 bg-red-600 text-white rounded"
                  onClick={submitMultipleCancelForm}
                  disabled={multipleCancelForm.isSubmitting}
                >
                  {multipleCancelForm.isSubmitting ? 'Saving...' : 'Save All Cancellations'}
                </button>
              </div>
            </div>

            {multipleCancelForm.error && (
              <p className="text-sm text-red-600 mt-2">{multipleCancelForm.error}</p>
            )}
          </>
        )}
      </div>
    );
  };

  // Collapsible action panel controls and unified top section
  const [panelOpen, setPanelOpen] = useState(false);
  const [localSelected, setLocalSelected] = useState(null);
  const selectedAction = typeof selectedTopbarMenu !== 'undefined' ? selectedTopbarMenu : localSelected;
  const setSelectedAction = (val) => {
    if (typeof setSelectedTopbarMenu === 'function') setSelectedTopbarMenu(val);
    else setLocalSelected(val);
  };
  const actions = ["➕", "🔍", "📄 Report", "📊 Excel Upload", CANCEL_ACTION];

  const handleTopbarSelect = (action) => {
    if (action === "➕" && formState.isEditing) {
      setFormState({ data: createEmptyEnrollmentFormData(), isEditing: false });
      setState(prev => ({ ...prev, validationErrors: {} }));
      setSelectedAction(action);
      setPanelOpen(true);
      return;
    }

    if (action === CANCEL_ACTION) {
      setActiveTab('cancel');
    } else if (action === "➕" || action === "🔍") {
      setActiveTab('list');
    }

    if (selectedAction === action) {
      const nextOpen = !panelOpen;
      setPanelOpen(nextOpen);
      if (!nextOpen) {
        setSelectedAction(null);
      }
    } else {
      setSelectedAction(action);
      if (!panelOpen) setPanelOpen(true);
    }
  };

  const forceShowCancelPanel = () => {
    setSelectedAction(CANCEL_ACTION);
    if (!panelOpen) setPanelOpen(true);
  };

  const showRecordsSection = selectedAction !== "📄 Report";

  return (
    <div className="p-2 md:p-3 space-y-4 h-full bg-slate-100">
      <PageTopbar
        title="Enrollment"
        actions={actions}
        selected={selectedAction}
        onSelect={handleTopbarSelect}
        actionsOnLeft
        leftSlot={
          <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-600 text-white text-xl">
            🧾
          </div>
        }
      />

      {/* Collapsible Action Box */}
      <div className="action-panel-shell">
        <div className="action-panel-header">
          <div className="action-panel-title">
            {selectedAction ? `${(
              selectedAction === "➕" ? "ADD" :
              selectedAction === "🔍" ? "SEARCH" :
              selectedAction === "📄 Report" ? "REPORT" :
              selectedAction === "📊 Excel Upload" ? "EXCEL" :
              selectedAction === CANCEL_ACTION ? "CANCEL ADMISSION" : "ACTION"
            )} Panel` : "Action Panel"}
          </div>
          <PanelToggleButton open={panelOpen} onClick={() => setPanelOpen((o) => !o)} />
        </div>
        {panelOpen && selectedAction && (
          <div className="action-panel-body">
            {selectedAction === "➕" && renderFormView()}
            {selectedAction === "🔍" && (
              <div className="text-sm text-gray-600">Use the search table below.</div>
            )}
            {selectedAction === "📊 Excel Upload" && renderExcelUpload()}
            {selectedAction === "📄 Report" && (
              <EnrollmentReport
                onBack={() => {
                  setSelectedAction(null);
                  setPanelOpen(false);
                }}
              />
            )}
            {selectedAction === CANCEL_ACTION && renderCancelAdmissionForm()}
          </div>
        )}
      </div>

      {/* Records section */}
      {showRecordsSection && (
        <div className="bg-white shadow rounded-2xl p-4 h-[calc(100vh-220px)] overflow-auto">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition ${activeTab === tab.key ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                {tab.label}
              </button>
            ))}

            {activeTab === 'list' && (
              <>
                <SearchField
                  className="min-w-[280px] flex-1 max-w-[520px]"
                  placeholder="Search by enrollment no or name..."
                  value={state.searchTerm}
                  onChange={(e) => setState(prev => ({ ...prev, searchTerm: e.target.value }))}
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border rounded px-4 py-2 min-w-[180px]"
                >
                  <option value="active">Active Only</option>
                  <option value="cancelled">Cancelled Only</option>
                  <option value="all">All Records</option>
                </select>
              </>
            )}

            {activeTab === 'cancel' && (
              <>
                <SearchField
                  className="min-w-[280px] flex-1 max-w-[520px]"
                  placeholder="Search by Enrollment No, Name, Inward/Outward..."
                  value={cancelSearch}
                  onChange={(e) => setCancelSearch(e.target.value)}
                />
                <select
                  value={cancelBatchFilter}
                  onChange={(e) => setCancelBatchFilter(e.target.value)}
                  className="border rounded px-4 py-2 min-w-[150px]"
                >
                  <option value="">All Batches</option>
                  {BATCH_OPTIONS.map((batch) => (
                    <option key={batch} value={batch}>{batch}</option>
                  ))}
                </select>
                <select
                  value={cancelYearFilter}
                  onChange={(e) => setCancelYearFilter(e.target.value)}
                  className="border rounded px-4 py-2 min-w-[150px]"
                  aria-label="Cancellation year"
                >
                  <option value="">All Cancellation Years</option>
                  {cancelYearOptions.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </>
            )}
          </div>
          {activeTab === 'list' ? renderSearchView() : renderCancellationView()}
        </div>
      )}
    </div>
  );
};

// Helper component for form fields
const FormField = ({ field, formData, error, onChange, disabled }) => {
  const isDate = /date$/i.test(field.field);
  return (
    <div>
      <label className="block mb-1">
        {field.label}{field.required && '*'}
      </label>
      <input
        type={isDate ? "text" : (field.type || "text")}
        name={field.field}
        value={formData[field.field]}
        onChange={onChange}
        placeholder={isDate ? "dd-mm-yyyy" : undefined}
        className={`border rounded px-3 py-2 w-full ${
          error ? 'border-red-500' : ''
        }`}
        required={field.required}
        disabled={disabled}
      />
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
};
export default Enrollment;
