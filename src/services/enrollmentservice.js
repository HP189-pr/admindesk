import API from '../api/axiosInstance';

// Base path for enrollments API (keep trailing slash to match backend router)
const ENROLLMENT_API = '/api/enrollments/';

// Enrollment CRUD Operations
export const getEnrollments = async (searchTerm = '', page = 1, pageSize = 10, cancelFilter) => {
    const params = { search: searchTerm.trim(), page, limit: pageSize };
    if (typeof cancelFilter !== 'undefined' && cancelFilter !== null) {
        params.cancel = cancelFilter;
    }

    const res = await API.get(ENROLLMENT_API, { params });
    return res.data;
};

export const createEnrollment = async (enrollmentData) => {
    const res = await API.post(ENROLLMENT_API, enrollmentData);
    return res.data;
};

export const updateEnrollment = async (enrollmentId, updatedData) => {
    const res = await API.put(`${ENROLLMENT_API}${enrollmentId}/`, updatedData);
    return res.data;
};

export const deleteEnrollment = async (enrollmentId) => {
    const res = await API.delete(`${ENROLLMENT_API}${enrollmentId}/`);
    return res.data;
};

// Excel Import Functions
export const initUpload = async (file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await API.post(
        `${ENROLLMENT_API}init-upload/`,
        formData,
        {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60000,
            onUploadProgress,
        }
    );

    return res.data;
};

export const getSheetNames = async (sessionId) => {
    const res = await API.post(`${ENROLLMENT_API}get-sheets/`, { session_id: sessionId });
    return res.data;
};

export const getColumnHeaders = async (sessionId, sheetName) => {
    const res = await API.post(`${ENROLLMENT_API}get-columns/`, {
        session_id: sessionId,
        sheet_name: sheetName,
    });
    return res.data;
};

export const processDataChunk = async (sessionId, sheetName, columnMapping) => {
    const res = await API.post(`${ENROLLMENT_API}process-chunk/`, {
        session_id: sessionId,
        sheet_name: sheetName,
        column_mapping: columnMapping,
    });
    return res.data;
};

// Admission cancellation helpers
export const getAdmissionCancellationList = async (params = {}) => {
    const res = await API.get('/api/admission-cancel/', { params });
    return res.data;
};

export const createAdmissionCancellation = async (payload) => {
    const res = await API.post('/api/admission-cancel/', payload);
    return res.data;
};

export const getEnrollmentByNumber = async (enrollmentNo) => {
    const res = await API.get(`${ENROLLMENT_API}by-number/`, {
        params: { enrollment_no: enrollmentNo }
    });
    return res.data;
};

// Database field options for mapping
export const getDatabaseFields = () => [
    { field: 'enrollment_no', label: 'Enrollment Number', required: true },
    { field: 'student_name', label: 'Student Name', required: true },
    { field: 'institute_id', label: 'Institute ID', required: true },
    { field: 'batch', label: 'Batch', required: true },
    { field: 'admission_date', label: 'Admission Date', required: false },
    { field: 'subcourse_id', label: 'Subcourse ID', required: true },
    { field: 'maincourse_id', label: 'Main Course ID', required: true },
    { field: 'temp_enroll_no', label: 'Temporary Number', required: false }
];
export const validateEnrollmentData = (data) => {
    const errors = {};

    if (!data.enrollment_no?.trim()) {
        errors.enrollment_no = "Enrollment number is required";
    }
    if (!data.student_name?.trim()) {
        errors.student_name = "Student name is required";
    }
    if (!data.institute_id?.trim()) {
        errors.institute_id = "Institute ID is required";
    }
    if (!data.batch?.trim()) {
        errors.batch = "Batch is required";
    }
    if (!data.subcourse_id?.trim()) {
        errors.subcourse_id = "Subcourse ID is required";
    }
    if (!data.maincourse_id?.trim()) {
        errors.maincourse_id = "Main course ID is required";
    }

    return errors;
};

export default {
    getEnrollments,
    createEnrollment,
    updateEnrollment,
    patchEnrollment: updateEnrollment,
    deleteEnrollment,
    initUpload,
    getSheetNames,
    getColumnHeaders,
    processDataChunk,
    getAdmissionCancellationList,
    createAdmissionCancellation,
    getEnrollmentByNumber,
    getDatabaseFields,
    validateEnrollmentData,
};