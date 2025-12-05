import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';
import * as XLSX from 'xlsx';

export default function HolidayManager() {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [uploadedData, setUploadedData] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/holidays/');
      setHolidays(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHolidays(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    if (!date || !name) {
      setError('Date and name required');
      return;
    }
    try {
      await axios.post('/api/holidays/', { 
        holiday_date: date, 
        holiday_name: name, 
        holiday_day: new Date(date).toLocaleDateString('en-US', { weekday: 'long' }) 
      });
      setDate(''); 
      setName('');
      fetchHolidays();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to add holiday');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this holiday?')) return;
    try {
      await axios.delete(`/api/holidays/${id}/`);
      fetchHolidays();
    } catch (e) {
      console.error(e);
      setError('Failed to delete holiday');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });
        
        // Transform data to match expected format
        const transformed = jsonData.map((row, idx) => {
          // Support common column names
          const dateVal = row.date || row.Date || row.holiday_date || row['Holiday Date'] || '';
          const nameVal = row.name || row.Name || row.holiday_name || row['Holiday Name'] || '';
          
          // Parse date if needed
          let parsedDate = dateVal;
          if (dateVal && !dateVal.match(/^\d{4}-\d{2}-\d{2}$/)) {
            try {
              const d = new Date(dateVal);
              if (!isNaN(d.getTime())) {
                parsedDate = d.toISOString().split('T')[0];
              }
            } catch (err) {
              console.error('Date parse error:', err);
            }
          }
          
          return {
            tempId: `temp-${idx}`,
            holiday_date: parsedDate,
            holiday_name: nameVal,
            holiday_day: parsedDate ? new Date(parsedDate).toLocaleDateString('en-US', { weekday: 'long' }) : '',
            isNew: true
          };
        }).filter(row => row.holiday_date && row.holiday_name);
        
        setUploadedData(transformed);
        setError('');
      } catch (err) {
        console.error('Excel parse error:', err);
        setError('Failed to parse Excel file. Ensure it has "date" and "name" columns.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleBulkSave = async () => {
    setLoading(true);
    setError('');
    let successCount = 0;
    let errorCount = 0;
    
    for (const record of uploadedData) {
      try {
        await axios.post('/api/holidays/', {
          holiday_date: record.holiday_date,
          holiday_name: record.holiday_name,
          holiday_day: record.holiday_day
        });
        successCount++;
      } catch (err) {
        console.error('Failed to save:', record, err);
        errorCount++;
      }
    }
    
    setLoading(false);
    setUploadedData([]);
    fetchHolidays();
    
    if (errorCount > 0) {
      setError(`Saved ${successCount} records, ${errorCount} failed (may be duplicates)`);
    } else {
      setError('');
    }
  };

  const handleRemoveUploaded = (tempId) => {
    setUploadedData(prev => prev.filter(r => r.tempId !== tempId));
  };

  const handleEditStart = (holiday) => {
    setEditingId(holiday.hdid);
    setEditValues({
      holiday_date: holiday.holiday_date,
      holiday_name: holiday.holiday_name
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditValues({});
  };

  const handleEditSave = async (id) => {
    try {
      const updatedDate = editValues.holiday_date;
      const updatedName = editValues.holiday_name;
      
      await axios.put(`/api/holidays/${id}/`, {
        holiday_date: updatedDate,
        holiday_name: updatedName,
        holiday_day: new Date(updatedDate).toLocaleDateString('en-US', { weekday: 'long' })
      });
      
      setEditingId(null);
      setEditValues({});
      fetchHolidays();
    } catch (err) {
      console.error('Failed to update:', err);
      setError(err.response?.data?.detail || 'Failed to update holiday');
    }
  };

  const handleEditChange = (field, value) => {
    setEditValues(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-gray-800">Holiday Management</h3>
      
      {/* Manual Add Form */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h4 className="text-lg font-semibold mb-3">Add Single Holiday</h4>
        <form onSubmit={handleAdd} className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input 
              type="date" 
              value={date} 
              onChange={(e)=>setDate(e.target.value)} 
              className="p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Holiday Name</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e)=>setName(e.target.value)} 
              className="p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
              placeholder="e.g., Independence Day"
            />
          </div>
          <div>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition">
              Add Holiday
            </button>
          </div>
        </form>
      </div>

      {/* Excel Upload */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h4 className="text-lg font-semibold mb-3">Upload from Excel</h4>
        <div className="flex items-center gap-3">
          <label className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 cursor-pointer transition">
            Choose Excel File
            <input 
              type="file" 
              accept=".xlsx,.xls" 
              onChange={handleFileUpload} 
              className="hidden"
            />
          </label>
          <span className="text-sm text-gray-600">
            Excel should have columns: <strong>date</strong> and <strong>name</strong>
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Uploaded Data Preview */}
      {uploadedData.length > 0 && (
        <div className="bg-blue-50 p-4 rounded-lg shadow">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-lg font-semibold text-blue-900">
              Uploaded Records ({uploadedData.length})
            </h4>
            <div className="flex gap-2">
              <button 
                onClick={handleBulkSave}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 transition"
              >
                {loading ? 'Saving...' : 'Save All'}
              </button>
              <button 
                onClick={() => setUploadedData([])}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border rounded">
              <thead className="bg-blue-100">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-semibold">Date</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold">Holiday Name</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold">Day</th>
                  <th className="px-4 py-2 text-center text-sm font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {uploadedData.map(record => (
                  <tr key={record.tempId} className="border-t hover:bg-blue-50">
                    <td className="px-4 py-2 text-sm">{record.holiday_date}</td>
                    <td className="px-4 py-2 text-sm">{record.holiday_name}</td>
                    <td className="px-4 py-2 text-sm">{record.holiday_day}</td>
                    <td className="px-4 py-2 text-center">
                      <button 
                        onClick={() => handleRemoveUploaded(record.tempId)}
                        className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Existing Holidays Table */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h4 className="text-lg font-semibold mb-3">Existing Holidays</h4>
        {loading && uploadedData.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-semibold">Date</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold">Holiday Name</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold">Day</th>
                  <th className="px-4 py-2 text-center text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {holidays.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                      No holidays found. Add one above or upload from Excel.
                    </td>
                  </tr>
                ) : (
                  holidays.map(h => (
                    <tr key={h.hdid} className="border-t hover:bg-gray-50">
                      {editingId === h.hdid ? (
                        <>
                          <td className="px-4 py-2">
                            <input 
                              type="date" 
                              value={editValues.holiday_date} 
                              onChange={(e) => handleEditChange('holiday_date', e.target.value)}
                              className="p-1 border rounded w-full text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input 
                              type="text" 
                              value={editValues.holiday_name} 
                              onChange={(e) => handleEditChange('holiday_name', e.target.value)}
                              className="p-1 border rounded w-full text-sm"
                            />
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {editValues.holiday_date ? new Date(editValues.holiday_date).toLocaleDateString('en-US', { weekday: 'long' }) : '-'}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <div className="flex gap-1 justify-center">
                              <button 
                                onClick={() => handleEditSave(h.hdid)}
                                className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                              >
                                Save
                              </button>
                              <button 
                                onClick={handleEditCancel}
                                className="px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2 text-sm">{h.holiday_date}</td>
                          <td className="px-4 py-2 text-sm">{h.holiday_name}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{h.holiday_day}</td>
                          <td className="px-4 py-2 text-center">
                            <div className="flex gap-1 justify-center">
                              <button 
                                onClick={() => handleEditStart(h)}
                                className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => handleDelete(h.hdid)}
                                className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
