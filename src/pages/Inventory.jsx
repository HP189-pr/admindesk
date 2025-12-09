/**
 * Inventory Management System
 * 4-Tab Layout: Stock Summary | Inward Entry | Outward Entry | Item Master
 */
import React, { useState, useEffect } from 'react';
import {
  getItems,
  addItem,
  updateItem,
  deleteItem,
  getInward,
  addInward,
  updateInward,
  deleteInward,
  getOutward,
  addOutward,
  updateOutward,
  deleteOutward,
  getStockSummary,
} from '../services/inventoryService';

const Inventory = () => {
  const [activeTab, setActiveTab] = useState('stock');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ show: false, type: '', message: '' });

  // State for each tab
  const [stockSummary, setStockSummary] = useState([]);
  const [items, setItems] = useState([]);
  const [inwardEntries, setInwardEntries] = useState([]);
  const [outwardEntries, setOutwardEntries] = useState([]);

  // Forms
  const [itemForm, setItemForm] = useState({ item_name: '', description: '' });
  const [inwardForm, setInwardForm] = useState({ inward_date: '', item: '', qty: '', details: '' });
  const [outwardForm, setOutwardForm] = useState({ outward_date: '', item: '', qty: '', receiver: '', received_qty: '', remark: '' });

  // Edit mode
  const [editingItem, setEditingItem] = useState(null);
  const [editingInward, setEditingInward] = useState(null);
  const [editingOutward, setEditingOutward] = useState(null);

  // Show alert helper
  const showAlert = (type, message) => {
    setAlert({ show: true, type, message });
    setTimeout(() => setAlert({ show: false, type: '', message: '' }), 4000);
  };

  // Load data based on active tab
  useEffect(() => {
    loadTabData();
  }, [activeTab]);

  const loadTabData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'stock') {
        const data = await getStockSummary();
        setStockSummary(Array.isArray(data) ? data : []);
      } else if (activeTab === 'inward') {
        const [itemsData, inwardData] = await Promise.all([getItems(), getInward()]);
        setItems(Array.isArray(itemsData) ? itemsData : (itemsData?.results || []));
        setInwardEntries(Array.isArray(inwardData) ? inwardData : (inwardData?.results || []));
      } else if (activeTab === 'outward') {
        const [itemsData, outwardData] = await Promise.all([getItems(), getOutward()]);
        setItems(Array.isArray(itemsData) ? itemsData : (itemsData?.results || []));
        setOutwardEntries(Array.isArray(outwardData) ? outwardData : (outwardData?.results || []));
      } else if (activeTab === 'item') {
        const data = await getItems();
        setItems(Array.isArray(data) ? data : (data?.results || []));
      }
    } catch (error) {
      showAlert('error', 'Failed to load data: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  // ==================== ITEM MASTER HANDLERS ====================

  const handleItemSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingItem) {
        await updateItem(editingItem.id, itemForm);
        showAlert('success', 'Item updated successfully');
        setEditingItem(null);
      } else {
        await addItem(itemForm);
        showAlert('success', 'Item added successfully');
      }
      setItemForm({ item_name: '', description: '' });
      loadTabData();
    } catch (error) {
      showAlert('error', error.response?.data?.item_name?.[0] || error.response?.data?.detail || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleItemEdit = (item) => {
    setEditingItem(item);
    setItemForm({ item_name: item.item_name, description: item.description || '' });
  };

  const handleItemDelete = async (id) => {
    if (!window.confirm('Delete this item? This will also affect stock entries.')) return;
    setLoading(true);
    try {
      await deleteItem(id);
      showAlert('success', 'Item deleted successfully');
      loadTabData();
    } catch (error) {
      showAlert('error', error.response?.data?.detail || 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const handleItemCancel = () => {
    setEditingItem(null);
    setItemForm({ item_name: '', description: '' });
  };

  // ==================== INWARD ENTRY HANDLERS ====================

  const handleInwardSubmit = async (e) => {
    e.preventDefault();
    if (!inwardForm.inward_date || !inwardForm.item || !inwardForm.qty) {
      showAlert('error', 'Please fill all required fields');
      return;
    }
    if (parseInt(inwardForm.qty) <= 0) {
      showAlert('error', 'Quantity must be positive');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        inward_date: inwardForm.inward_date,
        item: parseInt(inwardForm.item),
        qty: parseInt(inwardForm.qty),
        details: inwardForm.details || '',
      };
      if (editingInward) {
        await updateInward(editingInward.id, payload);
        showAlert('success', 'Inward entry updated successfully');
        setEditingInward(null);
      } else {
        await addInward(payload);
        showAlert('success', 'Inward entry added successfully');
      }
      setInwardForm({ inward_date: '', item: '', qty: '', details: '' });
      loadTabData();
    } catch (error) {
      showAlert('error', error.response?.data?.qty?.[0] || error.response?.data?.detail || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleInwardEdit = (entry) => {
    setEditingInward(entry);
    setInwardForm({
      inward_date: entry.inward_date,
      item: entry.item,
      qty: entry.qty,
      details: entry.details || '',
    });
  };

  const handleInwardDelete = async (id) => {
    if (!window.confirm('Delete this inward entry?')) return;
    setLoading(true);
    try {
      await deleteInward(id);
      showAlert('success', 'Inward entry deleted successfully');
      loadTabData();
    } catch (error) {
      showAlert('error', error.response?.data?.detail || 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const handleInwardCancel = () => {
    setEditingInward(null);
    setInwardForm({ inward_date: '', item: '', qty: '', details: '' });
  };

  // ==================== OUTWARD ENTRY HANDLERS ====================

  const handleOutwardSubmit = async (e) => {
    e.preventDefault();
    if (!outwardForm.outward_date || !outwardForm.item || !outwardForm.qty || !outwardForm.receiver) {
      showAlert('error', 'Please fill all required fields');
      return;
    }
    if (parseInt(outwardForm.qty) <= 0) {
      showAlert('error', 'Quantity must be positive');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        outward_date: outwardForm.outward_date,
        item: parseInt(outwardForm.item),
        qty: parseInt(outwardForm.qty),
        receiver: outwardForm.receiver,
        received_qty: outwardForm.received_qty ? parseInt(outwardForm.received_qty) : null,
        remark: outwardForm.remark || '',
      };
      if (editingOutward) {
        await updateOutward(editingOutward.id, payload);
        showAlert('success', 'Outward entry updated successfully');
        setEditingOutward(null);
      } else {
        await addOutward(payload);
        showAlert('success', 'Outward entry added successfully');
      }
      setOutwardForm({ outward_date: '', item: '', qty: '', receiver: '', received_qty: '', remark: '' });
      loadTabData();
    } catch (error) {
      showAlert('error', error.response?.data?.qty?.[0] || error.response?.data?.detail || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOutwardEdit = (entry) => {
    setEditingOutward(entry);
    setOutwardForm({
      outward_date: entry.outward_date,
      item: entry.item,
      qty: entry.qty,
      receiver: entry.receiver,
      received_qty: entry.received_qty || '',
      remark: entry.remark || '',
    });
  };

  const handleOutwardDelete = async (id) => {
    if (!window.confirm('Delete this outward entry?')) return;
    setLoading(true);
    try {
      await deleteOutward(id);
      showAlert('success', 'Outward entry deleted successfully');
      loadTabData();
    } catch (error) {
      showAlert('error', error.response?.data?.detail || 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOutwardCancel = () => {
    setEditingOutward(null);
    setOutwardForm({ outward_date: '', item: '', qty: '', receiver: '', received_qty: '', remark: '' });
  };

  // ==================== RENDER FUNCTIONS ====================

  const renderTabs = () => (
    <div className="flex border-b border-gray-300 mb-4">
      {[
        { key: 'stock', label: 'Stock Summary' },
        { key: 'inward', label: 'Inward Entry' },
        { key: 'outward', label: 'Outward Entry' },
        { key: 'item', label: 'Item Master' },
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

  const renderStockSummary = () => (
    <div className="bg-white rounded shadow p-4">
      <h2 className="text-xl font-bold mb-4">Total Stock Overview</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-4 py-2 text-left">Item</th>
              <th className="border px-4 py-2 text-left">Description</th>
              <th className="border px-4 py-2 text-right">Total Inward</th>
              <th className="border px-4 py-2 text-right">Total Outward</th>
              <th className="border px-4 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {stockSummary.length === 0 ? (
              <tr>
                <td colSpan="5" className="border px-4 py-4 text-center text-gray-500">
                  No items found
                </td>
              </tr>
            ) : (
              stockSummary.map((item) => (
                <tr key={item.item_id} className="hover:bg-gray-50">
                  <td className="border px-4 py-2">{item.item_name}</td>
                  <td className="border px-4 py-2 text-gray-600">{item.description || '—'}</td>
                  <td className="border px-4 py-2 text-right">{item.inward_total}</td>
                  <td className="border px-4 py-2 text-right">{item.outward_total}</td>
                  <td className={`border px-4 py-2 text-right font-semibold ${item.balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {item.balance}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderInwardEntry = () => (
    <div className="space-y-4">
      <div className="bg-white rounded shadow p-4">
        <h2 className="text-xl font-bold mb-4">{editingInward ? 'Edit' : 'Add'} Inward Entry</h2>
        <form onSubmit={handleInwardSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Inward Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={inwardForm.inward_date}
              onChange={(e) => setInwardForm({ ...inwardForm, inward_date: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Item <span className="text-red-500">*</span></label>
            <select
              value={inwardForm.item}
              onChange={(e) => setInwardForm({ ...inwardForm, item: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              required
            >
              <option value="">Select Item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.item_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Quantity <span className="text-red-500">*</span></label>
            <input
              type="number"
              value={inwardForm.qty}
              onChange={(e) => setInwardForm({ ...inwardForm, qty: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              min="1"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Details</label>
            <input
              type="text"
              value={inwardForm.details}
              onChange={(e) => setInwardForm({ ...inwardForm, details: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              placeholder="Optional details"
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

      <div className="bg-white rounded shadow p-4">
        <h2 className="text-xl font-bold mb-4">Inward Entries</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-4 py-2 text-left">Date</th>
                <th className="border px-4 py-2 text-left">Item</th>
                <th className="border px-4 py-2 text-right">Qty</th>
                <th className="border px-4 py-2 text-left">Details</th>
                <th className="border px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inwardEntries.length === 0 ? (
                <tr>
                  <td colSpan="5" className="border px-4 py-4 text-center text-gray-500">
                    No entries found
                  </td>
                </tr>
              ) : (
                inwardEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="border px-4 py-2">{entry.inward_date}</td>
                    <td className="border px-4 py-2">{entry.item_name}</td>
                    <td className="border px-4 py-2 text-right">{entry.qty}</td>
                    <td className="border px-4 py-2">{entry.details || '—'}</td>
                    <td className="border px-4 py-2 text-center">
                      <button
                        onClick={() => handleInwardEdit(entry)}
                        className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 mr-2"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleInwardDelete(entry.id)}
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

  const renderOutwardEntry = () => (
    <div className="space-y-4">
      <div className="bg-white rounded shadow p-4">
        <h2 className="text-xl font-bold mb-4">{editingOutward ? 'Edit' : 'Add'} Outward Entry</h2>
        <form onSubmit={handleOutwardSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Outward Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={outwardForm.outward_date}
              onChange={(e) => setOutwardForm({ ...outwardForm, outward_date: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Item <span className="text-red-500">*</span></label>
            <select
              value={outwardForm.item}
              onChange={(e) => setOutwardForm({ ...outwardForm, item: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              required
            >
              <option value="">Select Item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.item_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Quantity <span className="text-red-500">*</span></label>
            <input
              type="number"
              value={outwardForm.qty}
              onChange={(e) => setOutwardForm({ ...outwardForm, qty: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              min="1"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Receiver Name / Institute <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={outwardForm.receiver}
              onChange={(e) => setOutwardForm({ ...outwardForm, receiver: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Received Qty</label>
            <input
              type="number"
              value={outwardForm.received_qty}
              onChange={(e) => setOutwardForm({ ...outwardForm, received_qty: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              min="0"
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Remark</label>
            <input
              type="text"
              value={outwardForm.remark}
              onChange={(e) => setOutwardForm({ ...outwardForm, remark: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              placeholder="Optional remark"
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

      <div className="bg-white rounded shadow p-4">
        <h2 className="text-xl font-bold mb-4">Outward Entries</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-4 py-2 text-left">Date</th>
                <th className="border px-4 py-2 text-left">Item</th>
                <th className="border px-4 py-2 text-right">Qty</th>
                <th className="border px-4 py-2 text-left">Receiver</th>
                <th className="border px-4 py-2 text-right">Received Qty</th>
                <th className="border px-4 py-2 text-left">Remark</th>
                <th className="border px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {outwardEntries.length === 0 ? (
                <tr>
                  <td colSpan="7" className="border px-4 py-4 text-center text-gray-500">
                    No entries found
                  </td>
                </tr>
              ) : (
                outwardEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="border px-4 py-2">{entry.outward_date}</td>
                    <td className="border px-4 py-2">{entry.item_name}</td>
                    <td className="border px-4 py-2 text-right">{entry.qty}</td>
                    <td className="border px-4 py-2">{entry.receiver}</td>
                    <td className="border px-4 py-2 text-right">{entry.received_qty || '—'}</td>
                    <td className="border px-4 py-2">{entry.remark || '—'}</td>
                    <td className="border px-4 py-2 text-center">
                      <button
                        onClick={() => handleOutwardEdit(entry)}
                        className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 mr-2"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleOutwardDelete(entry.id)}
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

  const renderItemMaster = () => (
    <div className="space-y-4">
      <div className="bg-white rounded shadow p-4">
        <h2 className="text-xl font-bold mb-4">{editingItem ? 'Edit' : 'Add'} Item</h2>
        <form onSubmit={handleItemSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Item Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={itemForm.item_name}
              onChange={(e) => setItemForm({ ...itemForm, item_name: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={itemForm.description}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
              className="w-full border px-3 py-2 rounded"
              placeholder="Optional description"
            />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {editingItem ? 'Update' : 'Add'} Item
            </button>
            {editingItem && (
              <button
                type="button"
                onClick={handleItemCancel}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-white rounded shadow p-4">
        <h2 className="text-xl font-bold mb-4">Item List</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-4 py-2 text-left">Item Name</th>
                <th className="border px-4 py-2 text-left">Description</th>
                <th className="border px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan="3" className="border px-4 py-4 text-center text-gray-500">
                    No items found
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="border px-4 py-2">{item.item_name}</td>
                    <td className="border px-4 py-2">{item.description || '—'}</td>
                    <td className="border px-4 py-2 text-center">
                      <button
                        onClick={() => handleItemEdit(item)}
                        className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 mr-2"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleItemDelete(item.id)}
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
      <h1 className="text-2xl font-bold mb-4">Inventory Management</h1>

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
          {activeTab === 'stock' && renderStockSummary()}
          {activeTab === 'inward' && renderInwardEntry()}
          {activeTab === 'outward' && renderOutwardEntry()}
          {activeTab === 'item' && renderItemMaster()}
        </>
      )}
    </div>
  );
};

export default Inventory;
