/**
 * Student Fees Service
 * Handles all API calls related to student fees management
 */
import API from '../api/axiosInstance';

const FEES_API_URL = '/api/student-fees/';

/**
 * Get student fees ledger with optional filters
 * @param {Object} params - Query parameters
 * @param {string} params.student_no - Enrollment No or Temp Enrollment No
 * @param {string} params.term - Filter by term
 * @param {string} params.start_date - Filter by start date (YYYY-MM-DD)
 * @param {string} params.end_date - Filter by end date (YYYY-MM-DD)
 * @param {string} params.receipt_no - Filter by receipt number
 * @param {number} params.page - Page number (default: 1)
 * @param {number} params.page_size - Items per page (default: 50)
 * @returns {Promise} Response with fees data
 */
export const getStudentFees = async (params = {}) => {
    try {
        const response = await API.get(FEES_API_URL, { params });
        return response.data;
    } catch (error) {
        console.error('Error fetching student fees:', error);
        throw error;
    }
};

/**
 * Get fees for a specific student
 * @param {string} studentNo - Enrollment No or Temp Enrollment No
 * @param {Object} additionalParams - Additional query parameters
 * @returns {Promise} Response with student fees
 */
export const getFeesByStudent = async (studentNo, additionalParams = {}) => {
    try {
        const params = { student_no: studentNo, ...additionalParams };
        const response = await API.get(FEES_API_URL, { params });
        return response.data;
    } catch (error) {
        console.error('Error fetching fees by student:', error);
        throw error;
    }
};

/**
 * Get fee summary for a student
 * @param {string} studentNo - Enrollment No or Temp Enrollment No
 * @returns {Promise} Response with summary data
 */
export const getStudentFeesSummary = async (studentNo) => {
    try {
        const response = await API.get(`${FEES_API_URL}summary/`, {
            params: { student_no: studentNo }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching fees summary:', error);
        throw error;
    }
};

/**
 * Get fees grouped by term for a student
 * @param {string} studentNo - Enrollment No or Temp Enrollment No
 * @returns {Promise} Response with term-wise breakdown
 */
export const getFeesByTerm = async (studentNo) => {
    try {
        const response = await API.get(`${FEES_API_URL}by-term/`, {
            params: { student_no: studentNo }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching fees by term:', error);
        throw error;
    }
};

/**
 * Create a new fee entry
 * @param {Object} feeData - Fee entry data
 * @param {string} feeData.student_no - Enrollment No or Temp Enrollment No
 * @param {string} feeData.receipt_no - Receipt number (unique)
 * @param {string} feeData.receipt_date - Receipt date (YYYY-MM-DD)
 * @param {string} feeData.term - Term (e.g., "1st Term", "2nd Term")
 * @param {number} feeData.amount - Fee amount
 * @param {string} feeData.remark - Optional remark
 * @returns {Promise} Response with created fee entry
 */
export const createFeeEntry = async (feeData) => {
    try {
        const response = await API.post(FEES_API_URL, feeData);
        return response.data;
    } catch (error) {
        console.error('Error creating fee entry:', error);
        throw error;
    }
};

/**
 * Update an existing fee entry
 * @param {number} feeId - Fee entry ID
 * @param {Object} feeData - Updated fee data
 * @returns {Promise} Response with updated fee entry
 */
export const updateFeeEntry = async (feeId, feeData) => {
    try {
        const response = await API.put(`${FEES_API_URL}${feeId}/`, feeData);
        return response.data;
    } catch (error) {
        console.error('Error updating fee entry:', error);
        throw error;
    }
};

/**
 * Partially update a fee entry
 * @param {number} feeId - Fee entry ID
 * @param {Object} feeData - Partial fee data
 * @returns {Promise} Response with updated fee entry
 */
export const patchFeeEntry = async (feeId, feeData) => {
    try {
        const response = await API.patch(`${FEES_API_URL}${feeId}/`, feeData);
        return response.data;
    } catch (error) {
        console.error('Error patching fee entry:', error);
        throw error;
    }
};

/**
 * Delete a fee entry
 * @param {number} feeId - Fee entry ID
 * @returns {Promise} Response confirmation
 */
export const deleteFeeEntry = async (feeId) => {
    try {
        const response = await API.delete(`${FEES_API_URL}${feeId}/`);
        return response.data;
    } catch (error) {
        console.error('Error deleting fee entry:', error);
        throw error;
    }
};

/**
 * Get a specific fee entry by ID
 * @param {number} feeId - Fee entry ID
 * @returns {Promise} Response with fee entry details
 */
export const getFeeEntry = async (feeId) => {
    try {
        const response = await API.get(`${FEES_API_URL}${feeId}/`);
        return response.data;
    } catch (error) {
        console.error('Error fetching fee entry:', error);
        throw error;
    }
};

export default {
    getStudentFees,
    getFeesByStudent,
    getStudentFeesSummary,
    getFeesByTerm,
    createFeeEntry,
    updateFeeEntry,
    patchFeeEntry,
    deleteFeeEntry,
    getFeeEntry
};
