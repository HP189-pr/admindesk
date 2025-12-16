import React, { useCallback, useEffect, useState } from 'react';
import { fetchFeeTypes, createFeeType, updateFeeType } from '../services/feeTypeService';

const DEFAULT_RIGHTS = { can_view: true, can_create: true, can_edit: true, can_delete: true };

const FeeTypeMaster = ({ rights = DEFAULT_RIGHTS }) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formState, setFormState] = useState({ code: '', name: '', is_active: true });
  const [status, setStatus] = useState(null);
  const [pageError, setPageError] = useState('');

  const readonly = !rights.can_create && !rights.can_edit;

  const setFlash = useCallback((type, message) => {
    setStatus({ type, message });
    if (message) {
      setTimeout(() => setStatus(null), 3000);
    }
  }, []);

  const loadRecords = useCallback(async () => {
    if (!rights.can_view) {
      setRecords([]);
      return;
    }
    setLoading(true);
    setPageError('');
    try {
      const data = await fetchFeeTypes();
      setRecords(Array.isArray(data) ? data : data?.results || []);
    } catch (err) {
      setPageError('Unable to load fee types');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [rights.can_view]);

  useEffect(() => {
    if (rights.can_view) {
      loadRecords();
    }
  }, [rights.can_view, loadRecords]);

  const resetForm = () => {
    setEditing(null);
    setFormState({ code: '', name: '', is_active: true });
  };

  const submitForm = async (event) => {
    event.preventDefault();
    if (!formState.code.trim() || !formState.name.trim()) {
      setFlash('error', 'Code and Name are required');
      return;
    }
    const payload = {
      code: formState.code.trim().toUpperCase(),
      name: formState.name.trim(),
      is_active: Boolean(formState.is_active),
    };
    setSaving(true);
    try {
      if (editing) {
        if (!rights.can_edit) {
          setFlash('error', 'You do not have permission to edit');
          return;
        }
        await updateFeeType(editing.id, payload);
        setFlash('success', 'Fee type updated');
      } else {
        if (!rights.can_create) {
          setFlash('error', 'You do not have permission to add');
          return;
        }
        await createFeeType(payload);
        setFlash('success', 'Fee type added');
      }
      resetForm();
      loadRecords();
    } catch (err) {
      const detail = err?.response?.data;
      let message = 'Unable to save record';
      if (typeof detail === 'string') {
        message = detail;
      } else if (detail?.detail) {
        message = detail.detail;
      } else if (detail && typeof detail === 'object') {
        const key = Object.keys(detail)[0];
        if (key && Array.isArray(detail[key]) && detail[key].length) {
          message = detail[key][0];
        }
      }
      setFlash('error', message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (record) => {
    setEditing(record);
    setFormState({
      code: record.code,
      name: record.name,
      is_active: record.is_active,
    });
  };

  if (!rights.can_view) {
    return (
      <div className="rounded border border-dashed border-gray-300 p-6 text-center text-gray-600">
        <h2 className="text-xl font-semibold text-gray-800">Fee Type Master</h2>
        <p className="mt-2 text-sm text-gray-500">You do not have permission to access this screen.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-sm uppercase tracking-wide text-blue-700">Accounts &amp; Finance</p>
          <h1 className="text-3xl font-semibold text-gray-900">Fee Type Master</h1>
          <p className="text-sm text-gray-600">Control the ledger heads referenced by the cash register.</p>
        </header>

        {status && (
          <div
            className={`rounded border px-4 py-3 text-sm ${
              status.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {status.message}
          </div>
        )}

        <section className="rounded-lg bg-white p-4 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">{editing ? 'Edit fee type' : 'Add fee type'}</h2>
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm text-blue-600 hover:underline"
              >
                Cancel edit
              </button>
            )}
          </div>
          <form onSubmit={submitForm} className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-gray-700">
              Code
              <input
                type="text"
                value={formState.code}
                onChange={(e) => setFormState((prev) => ({ ...prev, code: e.target.value }))}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 uppercase"
                maxLength={10}
                disabled={saving || readonly}
                placeholder="e.g. MIG"
              />
            </label>
            <label className="text-sm font-medium text-gray-700 md:col-span-2">
              Name
              <input
                type="text"
                value={formState.name}
                onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                disabled={saving || readonly}
                placeholder="Migration"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Status
              <select
                value={formState.is_active ? 'active' : 'inactive'}
                onChange={(e) => setFormState((prev) => ({ ...prev, is_active: e.target.value === 'active' }))}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                disabled={saving || readonly}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <div className="md:col-span-3 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving || readonly}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {saving ? 'Saving...' : editing ? 'Update' : 'Save'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                disabled={saving}
              >
                Clear
              </button>
            </div>
          </form>
          {readonly && (
            <p className="mt-3 text-sm text-gray-500">You have view-only access.</p>
          )}
        </section>

        <section className="rounded-lg bg-white p-4 shadow">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Fee types</h2>
              {pageError && <p className="text-sm text-red-600">{pageError}</p>}
            </div>
            <span className="text-sm text-gray-500">{records.length} record(s)</span>
          </div>
          {loading ? (
            <div className="py-8 text-center text-gray-500">Loading...</div>
          ) : records.length === 0 ? (
            <div className="rounded border border-dashed border-gray-200 p-6 text-center text-gray-500">
              No fee types available yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Code</th>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-semibold text-gray-900">{record.code}</td>
                      <td className="px-4 py-2 text-gray-700">{record.name}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            record.is_active
                              ? 'bg-green-50 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {record.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {rights.can_edit && (
                          <button
                            type="button"
                            onClick={() => startEdit(record)}
                            className="rounded border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default FeeTypeMaster;
