/**
 * Inward/Outward Register Management
 * 2-Tab Layout: Inward Register | Outward Register
 */
import React, { useState, useEffect } from 'react';
import {
  getInwardRegister,
  addInwardRegister,
  updateInwardRegister,
  deleteInwardRegister,
  getOutwardRegister,
  addOutwardRegister,
  updateOutwardRegister,
  deleteOutwardRegister,
  getNextInwardNumber,
  getNextOutwardNumber,
} from '../services/inoutService';

const InOutRegister = () => {
  const [activeTab, setActiveTab] = useState('inward');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ show: false, type: '', message: '' });

  // State for data
  const [inwardData, setInwardData] = useState([]);
  const [outwardData, setOutwardData] = useState([]);

  // Type choices
  const TYPE_CHOICES = [
    { value: 'Gen', label: 'General' },
    { value: 'Exam', label: 'Examination' },
    { value: 'Enr', label: 'Enrollment' },
    { value: 'Can', label: 'Cancellation' },
    { value: 'Doc', label: 'Document' },
  ];

  // Forms
  const [inwardForm, setInwardForm] = useState({
    inward_date: '',
    inward_type: 'Gen',
    inward_from: '',
    rec_type: 'Internal',
    details: '',
    remark: '',
  });

  const [outwardForm, setOutwardForm] = useState({
    outward_date: '',
    outward_type: 'Gen',
    outward_to: '',
    send_type: 'Internal',
    details: '',
    remark: '',
  });

  // Edit mode
  const [editingInward, setEditingInward] = useState(null);
  const [editingOutward, setEditingOutward] = useState(null);

  // Filters
  const [inwardFilters, setInwardFilters] = useState({ search: '', type: '', date_from: '', date_to: '' });
  const [outwardFilters, setOutwardFilters] = useState({ search: '', type: '', date_from: '', date_to: '' });

  // Next number preview
  const [inwardNextNumber, setInwardNextNumber] = useState({ last_no: null, next_no: null });
  const [outwardNextNumber, setOutwardNextNumber] = useState({ last_no: null, next_no: null });

  // Show alert helper
  const showAlert = (type, message) => {
    setAlert({ show: true, type, message });
    setTimeout(() => setAlert({ show: false, type: '', message: '' }), 4000);
  };

  // Fetch next inward number
  const fetchInwardNextNumber = async (type = 'Gen') => {
    try {
      const data = await getNextInwardNumber(type);
      setInwardNextNumber(data);
    } catch (error) {
      console.error('Error fetching next inward number:', error);
    }
  };

  // Fetch next outward number
  const fetchOutwardNextNumber = async (type = 'Gen') => {
    try {
      const data = await getNextOutwardNumber(type);
      setOutwardNextNumber(data);
    } catch (error) {
      console.error('Error fetching next outward number:', error);
    }
  };

  // Load data based on active tab
  useEffect(() => {
    loadTabData();
  }, [activeTab]);

  // Load next numbers on mount
  useEffect(() => {
    fetchInwardNextNumber('Gen');
    fetchOutwardNextNumber('Gen');
  }, []);

  const loadTabData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'inward') {
        const data = await getInwardRegister(inwardFilters);
        setInwardData(Array.isArray(data) ? data : (data?.results || []));
      } else if (activeTab === 'outward') {
        const data = await getOutwardRegister(outwardFilters);
        setOutwardData(Array.isArray(data) ? data : (data?.results || []));
      }
    } catch (error) {
      showAlert('error', 'Failed to load data: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Apply filters
  const applyInwardFilters = async () => {
    setLoading(true);
    try {
      const data = await getInwardRegister(inwardFilters);
      setInwardData(Array.isArray(data) ? data : (data?.results || []));
    } catch (error) {
      showAlert('error', 'Failed to filter data: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const applyOutwardFilters = async () => {
    setLoading(true);
    try {
      const data = await getOutwardRegister(outwardFilters);
      setOutwardData(Array.isArray(data) ? data : (data?.results || []));
    } catch (error) {
      showAlert('error', 'Failed to filter data: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  // ==================== INWARD HANDLERS ====================

  const handleInwardSubmit = async (e) => {
    e.preventDefault();
    if (!inwardForm.inward_date || !inwardForm.inward_type || !inwardForm.inward_from) {
      showAlert('error', 'Please fill all required fields');
      return;
    }
    setLoading(true);
    try {
      if (editingInward) {
        await updateInwardRegister(editingInward.id, inwardForm);
        showAlert('success', 'Inward register updated successfully');
        setEditingInward(null);
      } else {
        await addInwardRegister(inwardForm);
        showAlert('success', 'Inward register added successfully');
      }
      setInwardForm({
        inward_date: '',
        inward_type: 'Gen',
        inward_from: '',
        rec_type: 'Internal',
        details: '',
        remark: '',
      });
      fetchInwardNextNumber('Gen');
      loadTabData();
    } catch (error) {
      showAlert('error', error.response?.data?.detail || error.response?.data?.inward_type?.[0] || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleInwardEdit = (record) => {
    setEditingInward(record);
    setInwardForm({
      inward_date: record.inward_date,
      inward_type: record.inward_type,
      inward_from: record.inward_from,
      rec_type: record.rec_type,
      details: record.details || '',
      remark: record.remark || '',
    });
  };

  const handleInwardDelete = async (id) => {
    if (!window.confirm('Delete this inward register entry?')) return;
    setLoading(true);
    try {
      await deleteInwardRegister(id);
      showAlert('success', 'Inward register deleted successfully');
      loadTabData();
    } catch (error) {
      showAlert('error', error.response?.data?.detail || 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const handleInwardCancel = () => {
    setEditingInward(null);
    setInwardForm({
      inward_date: '',
      inward_type: 'Gen',
      inward_from: '',
      rec_type: 'Internal',
      details: '',
      remark: '',
    });
  };

  // ==================== OUTWARD HANDLERS ====================

  const handleOutwardSubmit = async (e) => {
    e.preventDefault();
    if (!outwardForm.outward_date || !outwardForm.outward_type || !outwardForm.outward_to) {
      showAlert('error', 'Please fill all required fields');
      return;
    }
    setLoading(true);
    try {
      if (editingOutward) {
        await updateOutwardRegister(editingOutward.id, outwardForm);
        showAlert('success', 'Outward register updated successfully');
        setEditingOutward(null);
      } else {
        await addOutwardRegister(outwardForm);
        showAlert('success', 'Outward register added successfully');
      }
      setOutwardForm({
        outward_date: '',
        outward_type: 'Gen',
        outward_to: '',
        send_type: 'Internal',
        details: '',
        remark: '',
      });
      fetchOutwardNextNumber('Gen');
      loadTabData();
    } catch (error) {
      showAlert('error', error.response?.data?.detail || error.response?.data?.outward_type?.[0] || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOutwardEdit = (record) => {
    setEditingOutward(record);
    setOutwardForm({
      outward_date: record.outward_date,
      outward_type: record.outward_type,
      outward_to: record.outward_to,
      send_type: record.send_type,
      details: record.details || '',
      remark: record.remark || '',
    });
  };

  const handleOutwardDelete = async (id) => {
    if (!window.confirm('Delete this outward register entry?')) return;
    setLoading(true);
    try {
      await deleteOutwardRegister(id);
      showAlert('success', 'Outward register deleted successfully');
      loadTabData();
    } catch (error) {
      showAlert('error', error.response?.data?.detail || 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOutwardCancel = () => {
    setEditingOutward(null);
    setOutwardForm({
      outward_date: '',
      outward_type: 'Gen',
      outward_to: '',
      send_type: 'Internal',
      details: '',
      remark: '',
    });
  };

  // ==================== RENDER FUNCTIONS ====================

  const renderTabs = () => (
    <div className="flex border-b border-gray-300 mb-4">
      {[
        { key: 'inward', label: 'Inward Register' },
        { key: 'outward', label: 'Outward Register' },
      ].map((tab) => (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          className={`px-6 py-2 font-semibold transition-colors ${
            activeTab === tab.key
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-blue-500'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const renderInwardTab = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded shadow p-4">
        <h3 className="text-lg font-bold mb-3">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Search by sender"
            value={inwardFilters.search}
            onChange={(e) => setInwardFilters({ ...inwardFilters, search: e.target.value })}
            className="border px-3 py-2 rounded"
          />
          <select
            value={inwardFilters.type}
            onChange={(e) => setInwardFilters({ ...inwardFilters, type: e.target.value })}
            className="border px-3 py-2 rounded"
          >
            <option value="">All Types</option>
            {TYPE_CHOICES.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
          <input
            type="date"
            placeholder="From Date"
            value={inwardFilters.date_from}
            onChange={(e) => setInwardFilters({ ...inwardFilters, date_from: e.target.value })}
            className="border px-3 py-2 rounded"
          />
          <input
            type="date"
            placeholder="To Date"
            value={inwardFilters.date_to}
            onChange={(e) => setInwardFilters({ ...inwardFilters, date_to: e.target.value })}
            className="border px-3 py-2 rounded"
          />
        </div>
        <button
          onClick={applyInwardFilters}
          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Apply Filters
        </button>
      </div>

      {/* Add/Edit Form */}
      <div className="bg-white rounded shadow p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{editingInward ? 'Edit' : 'Add'} Inward Register</h2>
          {!editingInward && inwardNextNumber.next_no && (
            <div className="text-sm">
              {inwardNextNumber.last_no && (
                <span className="text-orange-500 font-medium">Last inward no: {inwardNextNumber.last_no}</span>
              )}
              <span className="ml-3 text-blue-600 font-medium">Next Inward: {inwardNextNumber.next_no}</span>
            </div>
          )}
        </div>
        <form onSubmit={handleInwardSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={inwardForm.inward_date}
              onChange={(e) => setInwardForm({ ...inwardForm, inward_date: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type <span className="text-red-500">*</span></label>
            <select
              value={inwardForm.inward_type}
              onChange={(e) => {
                setInwardForm({ ...inwardForm, inward_type: e.target.value });
                if (!editingInward) fetchInwardNextNumber(e.target.value);
              }}
              className="w-full border px-3 py-2 rounded"
              required
            >
              {TYPE_CHOICES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">From (Sender) <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={inwardForm.inward_from}
              onChange={(e) => setInwardForm({ ...inwardForm, inward_from: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Rec Type <span className="text-red-500">*</span></label>
            <select
              value={inwardForm.rec_type}
              onChange={(e) => setInwardForm({ ...inwardForm, rec_type: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              required
            >
              <option value="Internal">Internal</option>
              <option value="External">External</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Details</label>
            <textarea
              value={inwardForm.details}
              onChange={(e) => setInwardForm({ ...inwardForm, details: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              rows="2"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Remark</label>
            <textarea
              value={inwardForm.remark}
              onChange={(e) => setInwardForm({ ...inwardForm, remark: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              rows="2"
            />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {editingInward ? 'Update' : 'Add'} Entry
            </button>
            {editingInward && (
              <button
                type="button"
                onClick={handleInwardCancel}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded shadow p-4">
        <h2 className="text-xl font-bold mb-4">Inward Register List</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-4 py-2 text-left">Inward No</th>
                <th className="border px-4 py-2 text-left">Date</th>
                <th className="border px-4 py-2 text-left">Type</th>
                <th className="border px-4 py-2 text-left">From</th>
                <th className="border px-4 py-2 text-left">Rec Type</th>
                <th className="border px-4 py-2 text-left">Details</th>
                <th className="border px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inwardData.length === 0 ? (
                <tr>
                  <td colSpan="7" className="border px-4 py-4 text-center text-gray-500">
                    No records found
                  </td>
                </tr>
              ) : (
                inwardData.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="border px-4 py-2 font-semibold">{record.inward_no}</td>
                    <td className="border px-4 py-2">{record.inward_date}</td>
                    <td className="border px-4 py-2">{record.inward_type}</td>
                    <td className="border px-4 py-2">{record.inward_from}</td>
                    <td className="border px-4 py-2">{record.rec_type}</td>
                    <td className="border px-4 py-2">{record.details || '—'}</td>
                    <td className="border px-4 py-2 text-center">
                      <button
                        onClick={() => handleInwardEdit(record)}
                        className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 mr-2"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleInwardDelete(record.id)}
                        className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderOutwardTab = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded shadow p-4">
        <h3 className="text-lg font-bold mb-3">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Search by receiver"
            value={outwardFilters.search}
            onChange={(e) => setOutwardFilters({ ...outwardFilters, search: e.target.value })}
            className="border px-3 py-2 rounded"
          />
          <select
            value={outwardFilters.type}
            onChange={(e) => setOutwardFilters({ ...outwardFilters, type: e.target.value })}
            className="border px-3 py-2 rounded"
          >
            <option value="">All Types</option>
            {TYPE_CHOICES.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
          <input
            type="date"
            placeholder="From Date"
            value={outwardFilters.date_from}
            onChange={(e) => setOutwardFilters({ ...outwardFilters, date_from: e.target.value })}
            className="border px-3 py-2 rounded"
          />
          <input
            type="date"
            placeholder="To Date"
            value={outwardFilters.date_to}
            onChange={(e) => setOutwardFilters({ ...outwardFilters, date_to: e.target.value })}
            className="border px-3 py-2 rounded"
          />
        </div>
        <button
          onClick={applyOutwardFilters}
          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Apply Filters
        </button>
      </div>

      {/* Add/Edit Form */}
      <div className="bg-white rounded shadow p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{editingOutward ? 'Edit' : 'Add'} Outward Register</h2>
          {!editingOutward && outwardNextNumber.next_no && (
            <div className="text-sm">
              {outwardNextNumber.last_no && (
                <span className="text-orange-500 font-medium">Last outward no: {outwardNextNumber.last_no}</span>
              )}
              <span className="ml-3 text-blue-600 font-medium">Next Outward: {outwardNextNumber.next_no}</span>
            </div>
          )}
        </div>
        <form onSubmit={handleOutwardSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={outwardForm.outward_date}
              onChange={(e) => setOutwardForm({ ...outwardForm, outward_date: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type <span className="text-red-500">*</span></label>
            <select
              value={outwardForm.outward_type}
              onChange={(e) => {
                setOutwardForm({ ...outwardForm, outward_type: e.target.value });
                if (!editingOutward) fetchOutwardNextNumber(e.target.value);
              }}
              className="w-full border px-3 py-2 rounded"
              required
            >
              {TYPE_CHOICES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">To (Receiver) <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={outwardForm.outward_to}
              onChange={(e) => setOutwardForm({ ...outwardForm, outward_to: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Send Type <span className="text-red-500">*</span></label>
            <select
              value={outwardForm.send_type}
              onChange={(e) => setOutwardForm({ ...outwardForm, send_type: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              required
            >
              <option value="Internal">Internal</option>
              <option value="External">External</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Details</label>
            <textarea
              value={outwardForm.details}
              onChange={(e) => setOutwardForm({ ...outwardForm, details: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              rows="2"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Remark</label>
            <textarea
              value={outwardForm.remark}
              onChange={(e) => setOutwardForm({ ...outwardForm, remark: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              rows="2"
            />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {editingOutward ? 'Update' : 'Add'} Entry
            </button>
            {editingOutward && (
              <button
                type="button"
                onClick={handleOutwardCancel}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded shadow p-4">
        <h2 className="text-xl font-bold mb-4">Outward Register List</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-4 py-2 text-left">Outward No</th>
                <th className="border px-4 py-2 text-left">Date</th>
                <th className="border px-4 py-2 text-left">Type</th>
                <th className="border px-4 py-2 text-left">To</th>
                <th className="border px-4 py-2 text-left">Send Type</th>
                <th className="border px-4 py-2 text-left">Details</th>
                <th className="border px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {outwardData.length === 0 ? (
                <tr>
                  <td colSpan="7" className="border px-4 py-4 text-center text-gray-500">
                    No records found
                  </td>
                </tr>
              ) : (
                outwardData.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="border px-4 py-2 font-semibold">{record.outward_no}</td>
                    <td className="border px-4 py-2">{record.outward_date}</td>
                    <td className="border px-4 py-2">{record.outward_type}</td>
                    <td className="border px-4 py-2">{record.outward_to}</td>
                    <td className="border px-4 py-2">{record.send_type}</td>
                    <td className="border px-4 py-2">{record.details || '—'}</td>
                    <td className="border px-4 py-2 text-center">
                      <button
                        onClick={() => handleOutwardEdit(record)}
                        className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 mr-2"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleOutwardDelete(record.id)}
                        className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Document Register (Inward/Outward)</h1>

      {/* Alert */}
      {alert.show && (
        <div
          className={`mb-4 p-4 rounded ${
            alert.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {alert.message}
        </div>
      )}

      {/* Tabs */}
      {renderTabs()}

      {/* Loading */}
      {loading && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Tab Content */}
      {!loading && (
        <>
          {activeTab === 'inward' && renderInwardTab()}
          {activeTab === 'outward' && renderOutwardTab()}
        </>
      )}
    </div>
  );
};

export default InOutRegister;
