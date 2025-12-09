/**
 * Degree Service
 * Handles all API calls related to degree management
 */
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const API_URL = `${API_BASE_URL}/api/degrees/`;
const CONVOCATION_URL = `${API_BASE_URL}/api/convocations/`;

// Configure axios interceptors
axios.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

axios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

/**
 * Get all degrees with pagination and filtering
 */
export const getDegrees = async (params = {}) => {
    try {
        const response = await axios.get(API_URL, { params });
        return response.data;
    } catch (error) {
        console.error('Error fetching degrees:', error);
        throw error;
    }
};

/**
 * Get degree by ID
 */
export const getDegreeById = async (id) => {
    try {
        const response = await axios.get(`${API_URL}${id}/`);
        return response.data;
    } catch (error) {
        console.error('Error fetching degree:', error);
        throw error;
    }
};

/**
 * Create new degree
 */
export const createDegree = async (degreeData) => {
    try {
        const response = await axios.post(API_URL, degreeData);
        return response.data;
    } catch (error) {
        console.error('Error creating degree:', error);
        throw error;
    }
};

/**
 * Update degree
 */
export const updateDegree = async (id, degreeData) => {
    try {
        const response = await axios.put(`${API_URL}${id}/`, degreeData);
        return response.data;
    } catch (error) {
        console.error('Error updating degree:', error);
        throw error;
    }
};

/**
 * Partial update degree
 */
export const patchDegree = async (id, degreeData) => {
    try {
        const response = await axios.patch(`${API_URL}${id}/`, degreeData);
        return response.data;
    } catch (error) {
        console.error('Error patching degree:', error);
        throw error;
    }
};

/**
 * Delete degree
 */
export const deleteDegree = async (id) => {
    try {
        const response = await axios.delete(`${API_URL}${id}/`);
        return response.data;
    } catch (error) {
        console.error('Error deleting degree:', error);
        throw error;
    }
};

/**
 * Bulk upload degrees from CSV
 */
export const bulkUploadDegrees = async (file) => {
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await axios.post(`${API_URL}bulk_upload/`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error uploading degrees:', error);
        throw error;
    }
};

/**
 * Poll bulk upload progress by upload_id
 */
export const getBulkUploadProgress = async (uploadId) => {
    try {
        const response = await axios.get(`${API_URL}bulk_upload_progress/`, { params: { upload_id: uploadId } });
        return response.data;
    } catch (error) {
        console.error('Error getting bulk upload progress:', error);
        throw error;
    }
};

/**
 * Download bulk upload log content for an upload_id
 */
export const downloadBulkUploadLog = async (uploadId) => {
    try {
        const response = await axios.get(`${API_URL}bulk_upload_log/`, { params: { upload_id: uploadId } });
        return response.data;
    } catch (error) {
        console.error('Error downloading bulk upload log:', error);
        throw error;
    }
};

/**
 * Get degree statistics
 */
export const getDegreeStatistics = async () => {
    try {
        const response = await axios.get(`${API_URL}statistics/`);
        return response.data;
    } catch (error) {
        console.error('Error fetching statistics:', error);
        throw error;
    }
};

/**
 * Search degrees by enrollment number
 */
export const searchDegreesByEnrollment = async (enrollmentNo) => {
    try {
        const response = await axios.get(`${API_URL}search_by_enrollment/`, {
            params: { enrollment_no: enrollmentNo }
        });
        return response.data;
    } catch (error) {
        console.error('Error searching degrees:', error);
        throw error;
    }
};

// ==================== Convocation Services ====================

/**
 * Get all convocations
 */
export const getConvocations = async (params = {}) => {
    try {
        const response = await axios.get(CONVOCATION_URL, { params });
        return response.data;
    } catch (error) {
        console.error('Error fetching convocations:', error);
        throw error;
    }
};

/**
 * Get all convocations for dropdown (no pagination)
 */
export const getAllConvocations = async () => {
    try {
        const response = await axios.get(`${CONVOCATION_URL}list_all/`);
        return response.data;
    } catch (error) {
        console.error('Error fetching all convocations:', error);
        throw error;
    }
};

/**
 * Get convocation by ID
 */
export const getConvocationById = async (id) => {
    try {
        const response = await axios.get(`${CONVOCATION_URL}${id}/`);
        return response.data;
    } catch (error) {
        console.error('Error fetching convocation:', error);
        throw error;
    }
};

/**
 * Create new convocation
 */
export const createConvocation = async (convocationData) => {
    try {
        const response = await axios.post(CONVOCATION_URL, convocationData);
        return response.data;
    } catch (error) {
        console.error('Error creating convocation:', error);
        throw error;
    }
};

/**
 * Update convocation
 */
export const updateConvocation = async (id, convocationData) => {
    try {
        const response = await axios.put(`${CONVOCATION_URL}${id}/`, convocationData);
        return response.data;
    } catch (error) {
        console.error('Error updating convocation:', error);
        throw error;
    }
};

/**
 * Delete convocation
 */
export const deleteConvocation = async (id) => {
    try {
        const response = await axios.delete(`${CONVOCATION_URL}${id}/`);
        return response.data;
    } catch (error) {
        console.error('Error deleting convocation:', error);
        throw error;
    }
};

// ==================== Utility Functions ====================

/**
 * Format date from ISO to DD/MM/YYYY
 */
export const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

/**
 * Get status badge color
 */
export const getStatusColor = (status) => {
    const colors = {
        'PENDING': 'bg-yellow-100 text-yellow-800',
        'APPROVED': 'bg-green-100 text-green-800',
        'REJECTED': 'bg-red-100 text-red-800',
        'IN_PROGRESS': 'bg-blue-100 text-blue-800',
        'COMPLETED': 'bg-purple-100 text-purple-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
};

export default {
    getDegrees,
    getDegreeById,
    createDegree,
    updateDegree,
    patchDegree,
    deleteDegree,
    bulkUploadDegrees,
    getDegreeStatistics,
    searchDegreesByEnrollment,
    getConvocations,
    getAllConvocations,
    getConvocationById,
    createConvocation,
    updateConvocation,
    deleteConvocation,
    formatDate,
    getStatusColor,
};
