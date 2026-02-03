import React, { useState, useEffect, useCallback } from "react";
import { isoToDMY, dmyToISO } from "../utils/date";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import { useNavigate } from 'react-router-dom';
import PageTopbar from "../components/PageTopbar";
import { 
  getEnrollments, 
  createEnrollment, 
  updateEnrollment, 
  deleteEnrollment,
  initUpload, 
  getSheetNames,
  getColumnHeaders,
  processDataChunk,
  getDatabaseFields,
  validateEnrollmentData
} from "../services/enrollmentservice";
import { useAuth } from "../hooks/AuthContext";
import axios from "axios";
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    axios.get("/api/my-navigation/", {
      headers: { Authorization: `Bearer ${token}` },
    }).then(({ data }) => {
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
    }).catch(() => {
      // Graceful fallback
      setRights({ can_view: true, can_create: true, can_edit: true, can_delete: true });
    });
  }, []);

  // Memoized database fields
  const databaseFields = React.useMemo(() => getDatabaseFields(), []);

  // Load enrollments with debounce and pagination
  const loadEnrollments = useCallback(async (search = '', page = 1) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
        const data = await getEnrollments(search, page, state.pagination.pageSize);
        setState(prev => ({
            ...prev,
            enrollments: data.items || data, // Handle both paginated and non-paginated responses
            filteredEnrollments: data.items || data,
            pagination: {
                ...prev.pagination,
                currentPage: page,
                totalItems: data.total || (data.items ? data.items.length : data.length)
            },
            isLoading: false
        }));
    } catch (error) {
        console.error("Error details:", error);
        toast.error(error.message);
        setState(prev => ({ ...prev, isLoading: false }));
    }
}, [state.pagination.pageSize]);



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
        await updateEnrollment(formState.data.enrollment_no, payload);
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

  // Optimized render methods
  const renderSearchView = () => (
    <div>
      <h2 className="text-lg font-semibold mb-4">Enrollment Search</h2>
      <input
        type="text"
        placeholder="🔍 Search by enrollment no or name..."
        className="border rounded px-4 py-2 w-full md:w-1/3 mb-4"
        value={state.searchTerm}
        onChange={(e) => setState(prev => ({ ...prev, searchTerm: e.target.value }))}
      />
      
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
                  <th className="border p-2 text-left">Main Course</th>
                  <th className="border p-2 text-left">Sub Course</th>
                  <th className="border p-2 text-left">Batch</th>
                  <th className="border p-2 text-left">Admission</th>
                  {rights.can_edit || rights.can_delete ? (<th className="border p-2 text-left">Actions</th>) : null}
                </tr>
              </thead>
              <tbody>
                {state.filteredEnrollments.map((enr) => (
                  <tr key={enr.enrollment_no}>
                    <td className="border p-2">{enr.enrollment_no}</td>
                    <td className="border p-2">{enr.student_name}</td>
                    <td className="border p-2">{enr.institute?.name || enr.institute_id}</td>
                    <td className="border p-2">{enr.maincourse?.name || enr.maincourse_id}</td>
                    <td className="border p-2">{enr.subcourse?.name || enr.subcourse_id}</td>
                    <td className="border p-2">{enr.batch}</td>
                    <td className="border p-2">{isoToDMY(enr.admission_date) || '-'}</td>
                    {(rights.can_edit || rights.can_delete) && (
                      <td className="border p-2">
                        {rights.can_edit && (
                          <button
                            className="px-2 py-1 bg-yellow-500 text-white rounded mr-2"
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
                            Edit
                          </button>
                        )}
                        {rights.can_delete && (
                          <button
                            className="px-2 py-1 bg-red-600 text-white rounded"
                            onClick={async () => {
                              try {
                                await deleteEnrollment(enr.enrollment_no);
                                toast.success("Deleted");
                                loadEnrollments(state.searchTerm, state.pagination.currentPage);
                              } catch (err) {
                                toast.error(err.message);
                              }
                            }}
                          >
                            Delete
                          </button>
                        )}
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

  // Collapsible action panel controls and unified top section
  const [panelOpen, setPanelOpen] = useState(false);
  const [localSelected, setLocalSelected] = useState(null);
  const actions = ["➕", "🔍", "📄 Report", "📊 Excel Upload"];

  // Helpers to support controlled vs uncontrolled selection
  const getSelected = () => (typeof selectedTopbarMenu !== 'undefined' ? selectedTopbarMenu : localSelected);
  const setSelected = (val) => {
    if (typeof setSelectedTopbarMenu === 'function') setSelectedTopbarMenu(val);
    else setLocalSelected(val);
  };

  const handleTopbarSelect = (action) => {
    const current = getSelected();
    if (current === action) {
      const nextOpen = !panelOpen;
      setPanelOpen(nextOpen);
      if (!nextOpen) {
        // Deselect when collapsing via same action
        setSelected(null);
      }
    } else {
      setSelected(action);
      if (!panelOpen) setPanelOpen(true);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 h-full bg-slate-100">
      <PageTopbar
        title="Enrollment"
        actions={actions}
        selected={getSelected()}
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
            {getSelected() ? `${getSelected() === "➕" ? "ADD" : getSelected() === "🔍" ? "SEARCH" : getSelected() === "📄 Report" ? "REPORT" : "EXCEL"} Panel` : "Action Panel"}
          </div>
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
          >
            {panelOpen ? <FaChevronUp /> : <FaChevronDown />} {panelOpen ? "Collapse" : "Expand"}
          </button>
        </div>
        {panelOpen && getSelected() && (
          <div className="p-4">
            {getSelected() === "➕" && renderFormView()}
            {getSelected() === "🔍" && (
              <div className="space-y-4">
                {renderSearchView()}
              </div>
            )}
            {getSelected() === "📊 Excel Upload" && renderExcelUpload()}
            {getSelected() === "📄 Report" && (
              <div className="text-sm text-gray-600">Report view coming soon…</div>
            )}
          </div>
        )}
      </div>

      {/* Records section */}
      {getSelected() !== "➕" && (
        <div className="bg-white shadow rounded-2xl p-4 h-[calc(100vh-220px)] overflow-auto">
          {renderSearchView()}
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