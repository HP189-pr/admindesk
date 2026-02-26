/**
 * AuthInventory.jsx
 * Permission checking component for Inventory module
 * Works in DEV (3000) + PROD (8081)
 */
import React, { useEffect, useState } from 'react';
import API from '../api/axiosInstance';
import Inventory from '../pages/Inventory';

const AuthInventory = () => {
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkInventoryAccess();
  }, []);

  const checkInventoryAccess = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setError('No authentication token found. Please login.');
        return;
      }

      // 🔹 Fetch navigation rights for the current user
      const response = await API.get('/api/my-navigation/');
      const data = response.data;

      // 🔹 Admin shortcut
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const isAdmin = user.is_admin || user.is_superuser || false;

      if (isAdmin) {
        setHasAccess(true);
        return;
      }

      const modules = Array.isArray(data?.modules) ? data.modules : [];
      const hasInventoryAccess = modules.some((mod) => {
        const menus = Array.isArray(mod?.menus) ? mod.menus : [];
        return menus.some((menu) => {
          const name = (menu?.name || '').toLowerCase();
          return name.includes('inventory') && !!menu?.rights?.can_view;
        });
      });

      if (hasInventoryAccess) {
        setHasAccess(true);
      } else {
        setError('You do not have permission to access the Inventory module.');
      }
    } catch (err) {
      console.error('Error checking Inventory access:', err);
      setError('Failed to verify permissions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ==================== UI STATES ==================== */

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
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h2 className="mt-4 text-2xl font-bold text-center text-gray-800">
            Access Denied
          </h2>
          <p className="mt-2 text-center text-gray-600">{error}</p>
          <div className="mt-6">
            <button
              onClick={() => (window.location.href = '/')}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return hasAccess ? <Inventory /> : null;
};

export default AuthInventory;
