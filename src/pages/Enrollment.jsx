import React, { useState, useEffect, useCallback } from "react";
import { isoToDMY, dmyToISO } from "../utils/date";
import { FaChevronDown, FaChevronUp, FaEdit, FaTrash } from "react-icons/fa";
import { useNavigate } from 'react-router-dom';
import PageTopbar from "../components/PageTopbar";
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
} from "../services/enrollmentservice";
import { useAuth } from "../hooks/AuthContext";
import API from "../api/axiosInstance";
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

const CANCEL_ACTION = "Cancel Admission";

const buildCancelFormState = () => {
  const todayIso = new Date().toISOString().slice(0, 10);
  return {
    enrollmentNoInput: '',
    enrollmentId: null,
    studentName: '',
    cancel_date: isoToDMY(todayIso) || '',
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
      pageSize: 10,
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
      temp_no: ''
    },
    isEditing: false
  });
  const [statusFilter, setStatusFilter] = useState('active');
  const [activeTab, setActiveTab] = useState('list');
  const [cancelRecords, setCancelRecords] = useState([]);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelForm, setCancelForm] = useState(() => buildCancelFormState());
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
        if (iso) payload.admission_date = iso;
      }
      if (payload.enrollment_date) {
        const iso2 = dmyToISO(payload.enrollment_date);
        if (iso2) payload.enrollment_date = iso2;
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
      console.error("Error saving enrollment:", error);
      toast.error(error.message || "Failed to save enrollment");
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

  const handleCancelFormChange = (field, value) => {
    setCancelForm(prev => ({ ...prev, [field]: value, error: '' }));
  };

  const fetchEnrollmentForCancellation = async (overrideEnrollmentNo) => {
    const enrollmentNo = (overrideEnrollmentNo || cancelForm.enrollmentNoInput || '').trim();
    if (!enrollmentNo) {
      setCancelForm(prev => ({ ...prev, error: 'Enter enrollment number to fetch details.' }));
      return;
    }
    setCancelForm(prev => ({ ...prev, loadingEnrollment: true, error: '' }));
    try {
      const record = await getEnrollmentByNumber(enrollmentNo);
      setCancelForm(prev => ({
        ...prev,
        enrollmentId: record.id,
        studentName: record.student_name || '',
        enrollmentNoInput: enrollmentNo,
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

  const startCancellationFromRow = (enrollment) => {
    forceShowCancelPanel();
    setCancelForm({
      ...buildCancelFormState(),
      enrollmentNoInput: enrollment.enrollment_no || '',
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
        cancel_date: dmyToISO(cancelForm.cancel_date) || null,
        inward_no: cancelForm.inward_no || null,
        inward_date: cancelForm.inward_date ? dmyToISO(cancelForm.inward_date) : null,
        outward_no: cancelForm.outward_no || null,
        outward_date: cancelForm.outward_date ? dmyToISO(cancelForm.outward_date) : null,
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

  // Optimized render methods
  const renderSearchView = () => (
    <div>
      <h2 className="text-lg font-semibold mb-4">Enrollment Search</h2>
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="🔍 Search by enrollment no or name..."
          className="border rounded px-4 py-2 w-full md:w-1/3"
          value={state.searchTerm}
          onChange={(e) => setState(prev => ({ ...prev, searchTerm: e.target.value }))}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded px-4 py-2 w-full md:w-60"
        >
          <option value="active">Active Only</option>
          <option value="cancelled">Cancelled Only</option>
          <option value="all">All Records</option>
        </select>
      </div>
      
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
                {state.filteredEnrollments.map((enr) => (
                  <tr key={enr.enrollment_no}>
                    <td className="border p-2">{enr.enrollment_no}</td>
                    <td className="border p-2">{enr.student_name}</td>
                    <td className="border p-2">{enr.institute?.institute_code || enr.institute_id}</td>
                    <td className="border p-2">{enr.subcourse?.name || enr.subcourse_id}</td>
                    <td className="border p-2">{enr.batch}</td>
                    
                    <td className="border p-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${enr.cancel ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
                        {enr.cancel ? 'Cancelled' : 'Active'}
                      </span>
                    </td>
                    {(rights.can_edit || rights.can_delete) && (
                      <td className="border p-2">
                        <div className="flex items-center gap-2">
                          {rights.can_edit && (
                            <button
                              title="Edit"
                              className="w-5 h-5 flex items-center justify-center bg-yellow-500 text-white hover:bg-yellow-600 shadow-md rounded"
                              onClick={() => {
                                const hydrated = {
                                  ...enr,
                                  admission_date: isoToDMY(enr.admission_date) || '',
                                  enrollment_date: isoToDMY(enr.enrollment_date) || '',
                                };
                                setFormState({ data: hydrated, isEditing: true });
                                setSelectedTopbarMenu && setSelectedTopbarMenu("➕");
                              }}
                            >
                              <FaEdit size={12} />
                            </button>
                          )}
                          
                          {rights.can_delete && (
                            <button
                              title="Delete"
                              className="w-5 h-5 flex items-center justify-center bg-red-600 text-white hover:bg-red-700 shadow-md rounded"
                              onClick={async () => {
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
          className="px-3 py-2 rounded bg-slate-200 text-sm"
          onClick={loadCancellationRecords}
          disabled={cancelLoading}
        >
          {cancelLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {cancelLoading ? (
        <div className="text-center py-4">Loading cancellations...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Cancel Date</th>
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
                  <td className="border p-4 text-center" colSpan={9}>No cancellation records</td>
                </tr>
              ) : (
                cancelRecords.map(record => (
                  <tr key={record.id}>
                    <td className="border p-2">{isoToDMY(record.cancel_date) || '-'}</td>
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
    <div>
      <h2 className="text-lg font-semibold mb-4">
        {formState.isEditing ? "Edit Enrollment" : "Add New Enrollment"}
      </h2>
      {!rights.can_create && !formState.isEditing && (
        <p className="text-sm text-red-600 mb-2">You do not have rights to create enrollments.</p>
      )}
      {!rights.can_edit && formState.isEditing && (
        <p className="text-sm text-red-600 mb-2">You do not have rights to edit enrollments.</p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {databaseFields.map(field => (
            <FormField 
              key={field.field}
              field={field}
              formData={formState.data}
              error={state.validationErrors[field.field]}
              onChange={handleInputChange}
              disabled={formState.isEditing && field.field === 'enrollment_no'}
            />
          ))}
        </div>
        <div className="flex justify-end space-x-2">
          <button
            type="button"
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            onClick={() => setSelectedTopbarMenu && setSelectedTopbarMenu("🔍")}
          >
            Cancel
          </button>
          {(formState.isEditing ? rights.can_edit : rights.can_create) && (
            <button
              type="submit"
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
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

  const renderCancelAdmissionForm = () => (
  <div className="space-y-4">
    <h2 className="text-lg font-semibold">Cancel Admission Entry</h2>

        {/* GRID */}
    <div className="grid grid-cols-12 gap-4 items-end">

      {/* ================= ROW 1 ================= */}
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
            onClick={fetchEnrollmentForCancellation}
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

      {/* ================= ROW 2 ================= */}
      <div className="col-span-12 md:col-span-2">
        <label className="block mb-1">Cancel Date</label>
        <input
          type="date"
          value={cancelForm.cancel_date}
          onChange={(e) =>
            handleCancelFormChange('cancel_date', e.target.value)
          }
          className="border rounded px-3 py-2 w-full"
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

      {/* ================= ROW 3 ================= */}
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
  </div>
  );

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

  return (
    <div className="p-4 md:p-6 space-y-4 h-full bg-slate-100">
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
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
        <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
          <div className="font-semibold">
            {selectedAction ? `${(
              selectedAction === "➕" ? "ADD" :
              selectedAction === "🔍" ? "SEARCH" :
              selectedAction === "📄 Report" ? "REPORT" :
              selectedAction === "📊 Excel Upload" ? "EXCEL" :
              selectedAction === CANCEL_ACTION ? "CANCEL ADMISSION" : "ACTION"
            )} Panel` : "Action Panel"}
          </div>
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
          >
            {panelOpen ? <FaChevronUp /> : <FaChevronDown />} {panelOpen ? "Collapse" : "Expand"}
          </button>
        </div>
        {panelOpen && selectedAction && (
          <div className="p-4">
            {selectedAction === "➕" && renderFormView()}
            {selectedAction === "🔍" && (
              <div className="space-y-4">
                {renderSearchView()}
              </div>
            )}
            {selectedAction === "📊 Excel Upload" && renderExcelUpload()}
            {selectedAction === "📄 Report" && (
              <div className="text-sm text-gray-600">Report view coming soon...</div>
            )}
            {selectedAction === CANCEL_ACTION && renderCancelAdmissionForm()}
          </div>
        )}
      </div>

      {/* Records section */}
      {selectedAction !== "➕" && (
        <div className="bg-white shadow rounded-2xl p-4 h-[calc(100vh-220px)] overflow-auto">
          <div className="flex flex-wrap gap-2 mb-4">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition ${activeTab === tab.key ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                {tab.label}
              </button>
            ))}
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
