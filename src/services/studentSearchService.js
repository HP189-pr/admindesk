import axios from 'axios';

/**
 * Student Search Service
 * Handles API calls for comprehensive student information search
 */

const api = axios.create({
    baseURL: '/api/student-search',
    headers: { 'Content-Type': 'application/json' }
});

// Request interceptor to add authentication token
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

/**
 * Search student by enrollment number
 * @param {string} enrollmentNo - Enrollment number to search
 * @returns {Promise} Student data object with general, services, and fees information
 */
export const searchStudent = async (enrollmentNo) => {
    try {
        const response = await api.get('/search/', {
            params: { enrollment: enrollmentNo.trim() }
        });
        return response.data;
    } catch (error) {
        console.error('Student search error:', error.message);
        throw error;
    }
};

/**
 * Format date for display (YYYY-MM-DD to DD-MM-YYYY)
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
export const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
        const [year, month, day] = dateString.split('-');
        return `${day}-${month}-${year}`;
    } catch {
        return dateString;
    }
};

/**
 * Get status badge color
 * @param {string} status - Status value
 * @returns {string} Tailwind color class
 */
export const getStatusColor = (status) => {
    const colors = {
        'DONE': 'emerald',
        'IN_PROGRESS': 'blue',
        'PENDING': 'orange',
        'CORRECTION': 'yellow',
        'CANCEL': 'rose',
    };
    return colors[status] || 'slate';
};

export default {
    searchStudent,
    formatDate,
    getStatusColor,
};
