/**
 * AuthFees.jsx
 * Permission gate for Fees module (Cash Register / Fee Type / Student Fees)
 * Works in DEV (3000) + PROD (8081)
 */
import React, { useEffect, useMemo, useState } from 'react';
import API from '../api/axiosInstance';

import CashRegister from '../pages/CashRegister';
import FeeTypeMaster from '../pages/FeeTypeMaster';
import StudentFees from '../pages/StudentFees';

/* ==================== CONSTANTS ==================== */

const DEFAULT_RIGHTS = {
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
};

const FULL_RIGHTS = {
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
};

const MENU_KEYWORDS = {
  'cash-register': ['cash register', 'daily register'],
  'fee-type-master': ['fee type master', 'fee type', 'fee master'],
  'student-fees': ['student fees', 'fees ledger', 'fee ledger'],
};

/* ==================== UI STATES ==================== */

const AccessDenied = ({ message }) => (
  <div className="flex min-h-screen items-center justify-center bg-gray-50">
    <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
      <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
        <span className="text-3xl">⚠️</span>
      </div>
      <h2 className="text-2xl font-semibold text-gray-800 mb-2">Access Denied</h2>
      <p className="text-gray-600 mb-6">{message}</p>
      <button
        type="button"
        onClick={() => (window.location.href = '/dashboard')}
        className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Back to Dashboard
      </button>
    </div>
  </div>
);

const LoadingState = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="text-center">
      <div className="mx-auto mb-4 h-14 w-14 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      <p className="text-gray-600">Checking permissions...</p>
    </div>
  </div>
);

/* ==================== MAIN COMPONENT ==================== */

const AuthFees = ({ view = 'cash-register' }) => {
  const [rights, setRights] = useState(DEFAULT_RIGHTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const menuKeys = useMemo(() => MENU_KEYWORDS[view] || [], [view]);

  useEffect(() => {
    const checkPermissions = async () => {
      setLoading(true);
      setError('');

      try {
        const token = localStorage.getItem('access_token');
        if (!token) {
          setError('Please login to continue.');
          setRights(DEFAULT_RIGHTS);
          return;
        }

        // 🔹 Admin shortcut
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        if (storedUser?.is_admin || storedUser?.is_superuser) {
          setRights(FULL_RIGHTS);
          return;
        }

        // 🔹 Fetch navigation using RELATIVE PATH
        const response = await API.get('/api/my-navigation/');
        const modules = response.data?.modules || [];

        const financeModule = modules.find((mod) =>
          (mod.name || '').toLowerCase().includes('accounts')
        );

        if (!financeModule) {
          setError('Accounts & Finance module permissions are not configured.');
          setRights(DEFAULT_RIGHTS);
          return;
        }

        let resolvedRights = DEFAULT_RIGHTS;

        for (const menu of financeModule.menus || []) {
          const menuName = (menu.name || '').toLowerCase();
          if (menuKeys.some((keyword) => menuName.includes(keyword))) {
            resolvedRights = {
              can_view: !!(menu.rights?.can_view ?? menu.rights?.view),
              can_create: !!(menu.rights?.can_create ?? menu.rights?.add),
              can_edit: !!(menu.rights?.can_edit ?? menu.rights?.edit),
              can_delete: !!(menu.rights?.can_delete ?? menu.rights?.delete),
            };
            break;
          }
        }

        setRights(resolvedRights);

        if (!resolvedRights.can_view) {
          setError('You do not have permission to access this screen.');
        }
      } catch (err) {
        console.error('AuthFees permission error:', err);
        setRights(DEFAULT_RIGHTS);
        setError('Failed to verify permissions. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    checkPermissions();
  }, [menuKeys]);

  /* ==================== RENDER ==================== */

  if (loading) return <LoadingState />;

  if (!rights.can_view) {
    return <AccessDenied message={error || 'You do not have permission to view this page.'} />;
  }

  const PageComponent =
    view === 'fee-type-master'
      ? FeeTypeMaster
      : view === 'student-fees'
      ? StudentFees
      : CashRegister;

  return <PageComponent rights={rights} />;
};

export default AuthFees;
