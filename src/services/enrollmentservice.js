import axios from 'axios';

// Relative URL - works with Vite proxy (dev) and nginx proxy (production)
const api = axios.create({
    baseURL: '/api/enrollments',
    headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
    response => response,
    error => {
        if (error.response) {
            const errorMessage = error.response.data?.error ||
                                 error.response.data?.message ||
                                 `Server error (${error.response.status})`;
            return Promise.reject(new Error(errorMessage));
        } else if (error.request) {
            return Promise.reject(new Error('No response from server'));
        }
        return Promise.reject(error);
    }
);

// Enrollment CRUD Operations
export const getEnrollments = async (searchTerm = '', page = 1, pageSize = 10) => {
    try {
        const response = await api.get('/', { 
            params: { 
                search: searchTerm.trim(), // Trim whitespace
                page,
                limit: pageSize 
            } 
        });
        return response.data;
    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || 'Failed to fetch enrollments');
    }
};

export const createEnrollment = async (enrollmentData) => {
    try {
    const response = await api.post('/', enrollmentData);
        return response.data;
    } catch (error) {
        throw error;
    }
};

export const updateEnrollment = async (enrollmentId, updatedData) => {
    try {
    const response = await api.put(`/${encodeURIComponent(enrollmentId)}/`, updatedData);
        return response.data;
    } catch (error) {
        throw error;
    }
};

export const deleteEnrollment = async (enrollmentId) => {
    try {
    const response = await api.delete(`/${encodeURIComponent(enrollmentId)}/`);
        return response.data;
    } catch (error) {
        throw error;
    }
};

// Excel Import Functions
export const initUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await api.post('/init-upload/', formData, {
            headers: { 
                'Content-Type': 'multipart/form-data',
            },
            onUploadProgress: (progressEvent) => {
                const percentCompleted = Math.round(
                    (progressEvent.loaded * 100) / progressEvent.total
                );
                // Upload progress tracking available if needed
            },
        });
        return response.data;
    } catch (error) {
        console.error('Upload Error Details:', {
            config: error.config,
            response: error.response,
            message: error.message
        });
        throw new Error(error.response?.data?.message || 'Failed to initialize upload');
    }
};

export const getSheetNames = async (sessionId) => {
    try {
        const response = await api.post('/get-sheets/', { session_id: sessionId });
        return response.data;
    } catch (error) {
        throw error;
    }
};

export const getColumnHeaders = async (sessionId, sheetName) => {
    try {
        const response = await api.post('/get-columns/', {
            session_id: sessionId,
            sheet_name: sheetName,
        });
        return response.data;
    } catch (error) {
        throw error;
    }
};

export const processDataChunk = async (sessionId, sheetName, columnMapping) => {
    try {
        const response = await api.post('/process-chunk/', {
            session_id: sessionId,
            sheet_name: sheetName,
            column_mapping: columnMapping,
        });
        return response.data;
    } catch (error) {
        throw error;
    }
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
    { field: 'temp_no', label: 'Temporary Number', required: false }
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