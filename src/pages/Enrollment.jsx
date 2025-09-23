import React, { useState, useEffect, useCallback } from "react";
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
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Enrollment = ({ selectedTopbarMenu }) => {
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
      if (state.searchTerm.length >= 3 || state.searchTerm.length === 0) {
        loadEnrollments(state.searchTerm);
      }
    }, 500);

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

    setIsUploading(true);
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
        setIsUploading(false);
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
      if (formState.isEditing) {
        await updateEnrollment(formState.data.enrollment_no, formState.data);
        toast.success("Enrollment updated successfully");
      } else {
        await createEnrollment(formState.data);
        toast.success("Enrollment created successfully");
      }
      setState(prev => ({ ...prev, validationErrors: {} }));
      loadEnrollments();
    } catch (error) {
      console.error("Error saving enrollment:", error);
      toast.error(error.message || "Failed to save enrollment");
    }
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
            <table className="w-full border-collapse">
              {/* Table content */}
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
            onClick={() => setSelectedTopbarMenu("🔍")}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            {formState.isEditing ? "Update" : "Save"}
          </button>
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

  return (
    <div className="flex h-full p-3 bg-gray-100">
      <div className="bg-white shadow rounded p-6 w-full">
        {selectedTopbarMenu === "🔍" && renderSearchView()}
        {selectedTopbarMenu === "➕" && renderFormView()}
        {selectedTopbarMenu === "📊 Excel Upload" && renderExcelUpload()}
      </div>
    </div>
  );
};

// Helper component for form fields
const FormField = ({ field, formData, error, onChange, disabled }) => (
  <div>
    <label className="block mb-1">
      {field.label}{field.required && '*'}
    </label>
    <input
      type={field.type || "text"}
      name={field.field}
      value={formData[field.field]}
      onChange={onChange}
      className={`border rounded px-3 py-2 w-full ${
        error ? 'border-red-500' : ''
      }`}
      required={field.required}
      disabled={disabled}
    />
    {error && <p className="text-red-500 text-sm">{error}</p>}
  </div>
);

export default Enrollment;