// src/pages/Enrollment.jsx
import React, { useState, useEffect, useCallback } from "react";
import { isoToDMY, dmyToISO } from "../utils/date";
import { FaEdit, FaTrash } from "react-icons/fa";
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
  getEnrollmentByNumber,
  resolveEnrollment,
} from "../services/enrollmentservice";
import { fetchInstituteCodes, fetchCourseCodes, fetchSubcourseNames } from "../services/provisionalservice";
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
  { value: "REVOKED", label: "Revoked" },
];

const CANCEL_ENTRY_MODE_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'multiple', label: 'Multiple' },
];

const CANCEL_ACTION = "Cancel Admission";
const BATCH_OPTIONS = [2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024,2025, 2026, 2027, 2028];
const ENROLLMENT_FORM_PANEL_CLASS = "rounded-2xl border border-slate-200 bg-slate-100 p-4 md:p-5";
const ENROLLMENT_FORM_LABEL_CLASS = "mb-1 block text-sm font-medium text-slate-800";
const ENROLLMENT_FORM_FIELD_CLASS = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100";
const ENROLLMENT_FORM_FIELD_ERROR_CLASS = "border-red-500 focus:border-red-500 focus:ring-red-100";

  const buildCancelFormState = () => {
    return {
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
  enrollmentNoInput: '',
  enrollmentId: null,
  studentName: '',
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
  rows: [buildMultipleCancelRowState()],
  isSubmitting: false,
  error: '',
});

const Enrollment = ({ selectedTopbarMenu, setSelectedTopbarMenu, onToggleSidebar, onToggleChatbox }) => {
  const navigate = useNavigate();
  const { auth } = useAuth();
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
    data: {
      enrollment_no: '',
      student_name: '',
      institute_id: '',
      batch: '',
      admission_date: '',
      subcourse_id: '',
      maincourse_id: '',
      temp_enroll_no: ''
    },
    isEditing: false
  });
  const [instOptions, setInstOptions] = useState([]);
  const [courseOptions, setCourseOptions] = useState([]);
  const [subcourseOptions, setSubcourseOptions] = useState([]);
  const [statusFilter, setStatusFilter] = useState('active');
  const [activeTab, setActiveTab] = useState('list');
  const [cancelRecords, setCancelRecords] = useState([]);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelForm, setCancelForm] = useState(() => buildCancelFormState());
  const [cancelEntryMode, setCancelEntryMode] = useState('single');
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

  useEffect(() => {
    (async () => {
      try {
        const [inst, courses, subs] = await Promise.all([
          fetchInstituteCodes(),
          fetchCourseCodes(),
          fetchSubcourseNames(),
        ]);
        setInstOptions(inst || []);
        setCourseOptions(courses || []);
        setSubcourseOptions(subs || []);
      } catch (error) {
        console.error("Failed to load enrollment dropdown options:", error);
      }
    })();
  }, []);

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
        setCancelRecords(rows);
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
    
    const errors = validateEnrollmentData(formState.data);
    if (Object.keys(errors).length > 0) {
      setState(prev => ({ ...prev, validationErrors: errors }));
      return;
    }

    try {
      // Convert date fields to ISO before sending
      const payload = { ...formState.data };
      if (payload.admission_date) {
        const iso = dmyToISO(payload.admission_date);
        if (iso) {
          payload.admission_date = iso;
        } else {
          delete payload.admission_date;
        }
      } else {
        delete payload.admission_date;
      }
      if (payload.enrollment_date) {
        const iso2 = dmyToISO(payload.enrollment_date);
        if (iso2) {
          payload.enrollment_date = iso2;
        } else {
          delete payload.enrollment_date;
        }
      } else {
        delete payload.enrollment_date;
      }
      if (formState.isEditing) {
        await updateEnrollment(formState.data.id, payload);
        toast.success("Enrollment updated successfully");
      } else {
        await createEnrollment(payload);
        toast.success("Enrollment created successfully");
      }
      setState(prev => ({ ...prev, validationErrors: {} }));
      loadEnrollments();
    } catch (error) {
      const apiData = error?.response?.data;
      let message = error.message || "Failed to save enrollment";
      if (apiData) {
        if (typeof apiData === 'string') {
          message = apiData;
        } else if (apiData.detail) {
          message = apiData.detail;
        } else if (apiData.non_field_errors?.length) {
          message = apiData.non_field_errors.join(' ');
        } else {
          const firstKey = Object.keys(apiData)[0];
          if (firstKey) {
            const firstVal = apiData[firstKey];
            message = Array.isArray(firstVal) ? firstVal.join(' ') : String(firstVal);
          }
        }
      }
      console.error("Error saving enrollment:", {
        message,
        status: error?.response?.status,
        responseData: apiData,
        payload: { ...formState.data }
      });
      toast.error(message);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormState((prev) => ({
      ...prev,
      data: {
        ...prev.data,
        [name]: value,
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

  const handleMultipleRowChange = (rowId, field, value) => {
    setMultipleCancelForm(prev => ({
      ...prev,
      error: '',
      rows: prev.rows.map((row) => {
        if (row.rowId !== rowId) return row;

        if (field === 'enrollmentNoInput') {
          return {
            ...row,
            enrollmentNoInput: value,
            enrollmentId: null,
            studentName: '',
            error: '',
          };
        }

        return {
          ...row,
          [field]: value,
          error: field === 'status' ? '' : row.error,
        };
      }),
    }));
  };

  const addMultipleCancelRow = () => {
    setMultipleCancelForm(prev => ({
      ...prev,
      rows: [...prev.rows, buildMultipleCancelRowState()],
      error: '',
    }));
  };

  const removeMultipleCancelRow = (rowId) => {
    setMultipleCancelForm(prev => {
      if (prev.rows.length <= 1) return prev;
      return {
        ...prev,
        rows: prev.rows.filter((row) => row.rowId !== rowId),
        error: '',
      };
    });
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
        enrollmentId: record.id,
        studentName: record.student_name || '',
        enrollmentNoInput: String(record.enrollment_no ?? ''),
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

  const fetchEnrollmentForMultipleRow = async (rowId, overrideEnrollmentNo) => {
    const currentRow = multipleCancelForm.rows.find((row) => row.rowId === rowId);
    const enrollmentNo = String(overrideEnrollmentNo ?? currentRow?.enrollmentNoInput ?? '').trim();

    if (!enrollmentNo) {
      setMultipleCancelForm(prev => ({
        ...prev,
        rows: prev.rows.map((row) => (
          row.rowId === rowId
            ? { ...row, enrollmentId: null, studentName: '', error: 'Enter enrollment number to fetch details.' }
            : row
        )),
      }));
      return;
    }

    setMultipleCancelForm(prev => ({
      ...prev,
      error: '',
      rows: prev.rows.map((row) => (
        row.rowId === rowId
          ? { ...row, loadingEnrollment: true, error: '' }
          : row
      )),
    }));

    try {
      const record = await resolveEnrollment(enrollmentNo);
      if (!record) {
        throw new Error('Enrollment not found (exact match)');
      }

      setMultipleCancelForm(prev => ({
        ...prev,
        rows: prev.rows.map((row) => (
          row.rowId === rowId
            ? {
              ...row,
              enrollmentId: record.id,
              studentName: record.student_name || '',
              enrollmentNoInput: String(record.enrollment_no ?? ''),
              loadingEnrollment: false,
              error: '',
            }
            : row
        )),
      }));
    } catch (error) {
      setMultipleCancelForm(prev => ({
        ...prev,
        rows: prev.rows.map((row) => (
          row.rowId === rowId
            ? {
              ...row,
              loadingEnrollment: false,
              enrollmentId: null,
              studentName: '',
              error: error.message || 'Enrollment not found',
            }
            : row
        )),
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
        status: cancelForm.status,
      };
      await createAdmissionCancellation(payload);
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
        error: 'Enter at least one enrollment number.',
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
        status: row.status,
      };

      try {
        await createAdmissionCancellation(payload);
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
    institute_id: enr.institute?.id || enr.institute?.institute_id || enr.institute_id || '',
    maincourse_id: enr.maincourse?.id || enr.maincourse_id || '',
    subcourse_id: enr.subcourse?.id || enr.subcourse_id || '',
    temp_enroll_no: enr.temp_enroll_no || '',
  });

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
                  {rights.can_edit || rights.can_delete ? (<th className="border p-2 text-left">Actions</th>) : null}
                </tr>
              </thead>
              <tbody>
                {state.filteredEnrollments.map((enr, idx) => (
                  <tr
                    key={enr.id || enr.enrollment_no || `enr-${idx}`}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => {
                      const hydrated = getHydratedEnrollment(enr);
                      setFormState({ data: hydrated, isEditing: true });
                      setSelectedAction("➕");
                      if (!panelOpen) setPanelOpen(true);
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
                                const hydrated = getHydratedEnrollment(enr);
                                setFormState({ data: hydrated, isEditing: true });
                                setSelectedAction("➕");
                                if (!panelOpen) setPanelOpen(true);
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
        <h2 className="text-lg font-semibold">Cancel Admission</h2>
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
      {cancelLoading ? (
        <div className="text-center py-4">Loading cancellations...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Enrollment No</th>
                <th className="border p-2 text-left">Student Name</th>
                <th className="border p-2 text-left">Inward No</th>
                <th className="border p-2 text-left">Inward Date</th>
                <th className="border p-2 text-left">Outward No</th>
                <th className="border p-2 text-left">Outward Date</th>
                <th className="border p-2 text-left">Remark</th>
                <th className="border p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {cancelRecords.length === 0 ? (
                <tr>
                  <td className="border p-4 text-center" colSpan={8}>No cancellation records</td>
                </tr>
              ) : (
                cancelRecords.map(record => (
                  <tr key={record.id}>
                    <td className="border p-2">{record.enrollment_no}</td>
                    <td className="border p-2">{record.student_name}</td>
                    <td className="border p-2">{record.inward_no || '-'}</td>
                    <td className="border p-2">{isoToDMY(record.inward_date) || '-'}</td>
                    <td className="border p-2">{record.outward_no || '-'}</td>
                    <td className="border p-2">{isoToDMY(record.outward_date) || '-'}</td>
                    <td className="border p-2">{record.can_remark || '-'}</td>
                    <td className="border p-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${record.status === 'CANCELLED' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>
                        {record.status}
                      </span>
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
    <div className={ENROLLMENT_FORM_PANEL_CLASS}>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">
        {formState.isEditing ? "Edit Enrollment" : "Add New Enrollment"}
      </h2>
      {!rights.can_create && !formState.isEditing && (
        <p className="text-sm text-red-600 mb-2">You do not have rights to create enrollments.</p>
      )}
      {!rights.can_edit && formState.isEditing && (
        <p className="text-sm text-red-600 mb-2">You do not have rights to edit enrollments.</p>
      )}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                const value = course.id ?? course.maincourse_id ?? '';
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
                const value = subcourse.id ?? subcourse.subcourse_id ?? '';
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
        <div className="flex justify-end space-x-2">
          <button
            type="button"
            className="reset-button"
            onClick={() => setSelectedTopbarMenu && setSelectedTopbarMenu("🔍")}
          >
            Cancel
          </button>
          {(formState.isEditing ? rights.can_edit : rights.can_create) && (
            <button
              type="submit"
              className="save-button"
            >
              {formState.isEditing ? "Update" : "Save"}
            </button>
          )}
        </div>
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
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cancelForm.enrollmentNoInput}
                    onChange={(e) =>
                      handleCancelFormChange('enrollmentNoInput', e.target.value)
                    }
                    className="border rounded px-3 py-2 w-[220px]"
                    placeholder="Type enrollment number"
                  />
                  <button
                    type="button"
                    className="px-4 py-2 bg-indigo-600 text-white rounded"
                    onClick={() => fetchEnrollmentForCancellation()}
                    disabled={cancelForm.loadingEnrollment}
                  >
                    {cancelForm.loadingEnrollment ? 'Fetching...' : 'Fetch'}
                  </button>
                </div>
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

            <div className="space-y-3">
              {multipleCancelForm.rows.map((row, index) => (
                <div key={row.rowId} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                  <div className="text-sm font-semibold text-slate-700 mb-2">Record {index + 1}</div>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-4">
                      <label className="block mb-1">Enrollment Number *</label>
                      <input
                        type="text"
                        value={row.enrollmentNoInput}
                        onChange={(e) => handleMultipleRowChange(row.rowId, 'enrollmentNoInput', e.target.value)}
                        onBlur={() => fetchEnrollmentForMultipleRow(row.rowId)}
                        className="border rounded px-3 py-2 w-full"
                        placeholder="Auto fetch on blur"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <button
                        type="button"
                        className="w-full px-3 py-2 bg-indigo-600 text-white rounded"
                        onClick={() => fetchEnrollmentForMultipleRow(row.rowId)}
                        disabled={row.loadingEnrollment}
                      >
                        {row.loadingEnrollment ? 'Fetching...' : 'Fetch'}
                      </button>
                    </div>

                    <div className="md:col-span-4">
                      <label className="block mb-1">Student Name</label>
                      <input
                        type="text"
                        value={row.studentName}
                        readOnly
                        className="border rounded px-3 py-2 w-full bg-gray-100"
                        placeholder="Auto after fetch"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block mb-1">Status</label>
                      <select
                        value={row.status}
                        onChange={(e) => handleMultipleRowChange(row.rowId, 'status', e.target.value)}
                        className="border rounded px-3 py-2 w-full"
                      >
                        {CANCEL_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-12 flex justify-end">
                      <button
                        type="button"
                        className="px-3 py-2 border rounded text-sm disabled:opacity-50"
                        onClick={() => removeMultipleCancelRow(row.rowId)}
                        disabled={multipleCancelForm.rows.length <= 1 || multipleCancelForm.isSubmitting}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {row.error && <p className="text-sm text-red-600 mt-2">{row.error}</p>}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="px-4 py-2 bg-slate-700 text-white rounded"
                onClick={addMultipleCancelRow}
                disabled={multipleCancelForm.isSubmitting}
              >
                Add New Record
              </button>

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
