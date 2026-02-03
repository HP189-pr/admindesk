/**
 * Degree Service
 * Handles all API calls related to degree management
 */
import API from '../api/axiosInstance';

/* ==================== API PATHS ==================== */
/* IMPORTANT:
   axiosInstance baseURL MUST be '/'
   so these resolve to:
   - http://localhost:3000/api/... (Vite dev)
   - http://localhost:8081/api/... (Nginx prod)
*/
const DEGREE_API = '/api/degrees/';
const CONVOCATION_API = '/api/convocations/';

/* ==================== Degree APIs ==================== */

/**
 * Get all degrees with pagination and filtering
 */
export const getDegrees = async (params = {}) => {
    const res = await API.get(DEGREE_API, { params });
    return res.data;
};

/**
 * Get degree by ID
 */
export const getDegreeById = async (id) => {
    const res = await API.get(`${DEGREE_API}${id}/`);
    return res.data;
};

/**
 * Create new degree
 */
export const createDegree = async (data) => {
    const res = await API.post(DEGREE_API, data);
    return res.data;
};

/**
 * Update degree (full update)
 */
export const updateDegree = async (id, data) => {
    const res = await API.put(`${DEGREE_API}${id}/`, data);
    return res.data;
};

/**
 * Partial update degree
 */
export const patchDegree = async (id, data) => {
    const res = await API.patch(`${DEGREE_API}${id}/`, data);
    return res.data;
};

/**
 * Delete degree
 */
export const deleteDegree = async (id) => {
    await API.delete(`${DEGREE_API}${id}/`);
};

/* ==================== Bulk Upload ==================== */

/**
 * Bulk upload degrees from CSV/Excel
 */
export const bulkUploadDegrees = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await API.post(
        `${DEGREE_API}bulk_upload/`,
        formData,
        {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60000,
        }
    );
    return res.data;
};

/**
 * Poll bulk upload progress
 */
export const getBulkUploadProgress = async (uploadId) => {
    const res = await API.get(
        `${DEGREE_API}bulk_upload_progress/`,
        { params: { upload_id: uploadId } }
    );
    return res.data;
};

/**
 * Download bulk upload log
 */
export const downloadBulkUploadLog = async (uploadId) => {
    const res = await API.get(
        `${DEGREE_API}bulk_upload_log/`,
        { params: { upload_id: uploadId } }
    );
    return res.data;
};

/* ==================== Reports & Statistics ==================== */

/**
 * Get degree statistics
 */
export const getDegreeStatistics = async () => {
    const res = await API.get(`${DEGREE_API}statistics/`);
    return res.data;
};

/**
 * Get aggregated degree report
 */
export const getDegreeReport = async (params = {}, config = {}) => {
    const res = await API.get(
        `${DEGREE_API}report/`,
        { params, ...config }
    );
    return res.data;
};

/**
 * Get filter dropdown options
 */
export const getDegreeFilterOptions = async () => {
    const res = await API.get(`${DEGREE_API}filter-options/`);
    return res.data;
};

/**
 * Search degrees by enrollment number
 */
export const searchDegreesByEnrollment = async (enrollmentNo) => {
    const res = await API.get(
        `${DEGREE_API}search_by_enrollment/`,
        { params: { enrollment_no: enrollmentNo } }
    );
    return res.data;
};

/* ==================== Convocation APIs ==================== */

/**
 * Get all convocations (paginated)
 */
export const getConvocations = async (params = {}) => {
    const res = await API.get(CONVOCATION_API, { params });
    return res.data;
};

/**
 * Get all convocations (dropdown)
 */
export const getAllConvocations = async () => {
    const res = await API.get(`${CONVOCATION_API}list_all/`);
    return res.data;
};

/**
 * Get convocation by ID
 */
export const getConvocationById = async (id) => {
    const res = await API.get(`${CONVOCATION_API}${id}/`);
    return res.data;
};

/**
 * Create new convocation
 */
export const createConvocation = async (data) => {
    const res = await API.post(CONVOCATION_API, data);
    return res.data;
};

/**
 * Update convocation
 */
export const updateConvocation = async (id, data) => {
    const res = await API.put(`${CONVOCATION_API}${id}/`, data);
    return res.data;
};

/**
 * Delete convocation
 */
export const deleteConvocation = async (id) => {
    await API.delete(`${CONVOCATION_API}${id}/`);
};

/* ==================== Utility Functions ==================== */

/**
 * Format ISO date → DD/MM/YYYY
 */
export const formatDate = (dateString) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return `${String(d.getDate()).padStart(2, '0')}/${
        String(d.getMonth() + 1).padStart(2, '0')
    }/${d.getFullYear()}`;
};

/**
 * Status badge color helper
 */
export const getStatusColor = (status) => ({
    PENDING: 'bg-yellow-100 text-yellow-800',
    APPROVED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800',
    IN_PROGRESS: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-purple-100 text-purple-800',
}[status] || 'bg-gray-100 text-gray-800');

/* ==================== Default Export ==================== */

export default {
    getDegrees,
    getDegreeById,
    createDegree,
    updateDegree,
    patchDegree,
    deleteDegree,
    bulkUploadDegrees,
    getBulkUploadProgress,
    downloadBulkUploadLog,
    getDegreeStatistics,
    getDegreeReport,
    getDegreeFilterOptions,
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
