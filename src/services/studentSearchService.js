// src/services/studentSearchService.js
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
    // Try multiple common keys in case the app stored the token differently
    const token = localStorage.getItem('access_token')
        || localStorage.getItem('accessToken')
        || localStorage.getItem('token');
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
 * Format a date for display as DD/MM/YYYY.
 * Accepts API ISO dates as well as already formatted DMY values.
 * @param {string} dateString - ISO or DMY date string
 * @returns {string} Formatted date
 */
export const formatDate = (dateString) => {
    if (!dateString) return '-';
    const value = String(dateString).trim();
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return `${day}/${month}/${year}`;
    }

    const dmyMatch = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
        const [, day, month, year] = dmyMatch;
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }

    return value;
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
