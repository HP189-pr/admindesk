/**
 * AuthDocRegister.jsx
 * Permission checking component for Doc Register (Inward/Outward Register) module
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import InOutRegister from '../pages/inout_register';

const AuthDocRegister = () => {
    const [hasAccess, setHasAccess] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        checkDocRegisterAccess();
    }, []);

    const checkDocRegisterAccess = async () => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                setError('No authentication token found. Please login.');
                setLoading(false);
                return;
            }

            // Check if user has doc register module access
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
            const response = await axios.get(`${API_BASE_URL}/api/userpermissions/`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            // Check if user has access to 'doc_register' or 'office management' module or is admin
            const data = response.data;
            
            // Check if user is admin first (admin has access to everything)
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const isAdmin = user.is_admin || false;
            
            if (isAdmin) {
                setHasAccess(true);
                setLoading(false);
                return;
            }
            
            // Check module permissions
            const permissions = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
            
            const hasDocRegisterAccess = permissions.length > 0 && permissions.some(
                perm => {
                    const moduleName = perm.module?.module_name?.toLowerCase();
                    return (moduleName === 'doc_register' || 
                            moduleName === 'doc register' || 
                            moduleName === 'office management' ||
                            moduleName === 'office_management') && perm.has_access;
                }
            );

            if (hasDocRegisterAccess) {
                setHasAccess(true);
            } else {
                setError('You do not have permission to access the Doc Register module.');
            }
        } catch (err) {
            setError('Failed to verify permissions. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Checking permissions...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
                    <div className="flex items-center justify-center w-16 h-16 mx-auto bg-red-100 rounded-full">
                        <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                    <h2 className="mt-4 text-2xl font-bold text-center text-gray-800">Access Denied</h2>
                    <p className="mt-2 text-center text-gray-600">{error}</p>
                    <div className="mt-6">
                        <button
                            onClick={() => window.location.href = '/'}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Return to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (hasAccess) {
        return <InOutRegister />;
    }

    return null;
};

export default AuthDocRegister;
