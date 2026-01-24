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
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [selectedYear, setSelectedYear] = useState('all');

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      // Request all holidays (server supports ?all=1)
      const res = await axios.get('/holidays/?all=1');
      // Handle both array and object responses
      const data = res.data;
      if (Array.isArray(data)) {
        setHolidays(data);
      } else if (data && typeof data === 'object') {
        // If it's an object with a results property (paginated)
        setHolidays(data.results || []);
      } else {
        setHolidays([]);
      }
    } catch (e) {
      console.error(e);
      setHolidays([]);
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
      await axios.post('/holidays/', { 
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
      await axios.delete(`/holidays/${id}/`);
      fetchHolidays();
    } catch (e) {
      console.error(e);
      setError('Failed to delete holiday');
    }
  };

  // User picks a file first (no parsing yet)
  const handleFilePick = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadedData([]);
    setError('');
    // Clear input so same file can be picked again if needed
    e.target.value = '';
  };

  // Parse the selected file when user clicks Preview
  const parseSelectedFile = () => {
    if (!selectedFile) {
      setError('No file selected');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const arr = evt.target.result;
        const workbook = XLSX.read(arr, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

        // Transform data to match expected format
        const transformed = jsonData.map((row, idx) => {
          // Support common column names
          const dateVal = row.date || row.Date || row.holiday_date || row['Holiday Date'] || '';
          const nameVal = row.name || row.Name || row.holiday_name || row['Holiday Name'] || '';
          
          // Normalize and clean date strings (remove ordinals like 1st/2nd/3rd/4th, add space before year, remove commas)
          let parsedDate = '';
          if (dateVal) {
            try {
              let cleaned = String(dateVal).trim();
              // remove ordinal suffixes: 1st, 2nd, 3rd, 4th
              cleaned = cleaned.replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1');
              // remove commas
              cleaned = cleaned.replace(/,/g, '');
              // ensure there's a space before a 4-digit year if missing (e.g. 'January2025' -> 'January 2025')
              cleaned = cleaned.replace(/(\D)(\d{4})$/, '$1 $2');
              // If still looks like YYYY-MM-DD, accept it
              if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
                parsedDate = cleaned;
              } else {
                const d = new Date(cleaned);
                if (!isNaN(d.getTime())) {
                  // Format using local date components to avoid UTC shift from toISOString
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  parsedDate = `${y}-${m}-${day}`;
                }
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
        if (!transformed || transformed.length === 0) {
          setError('No valid rows found in file');
        } else {
          setError('');
        }
      } catch (err) {
        console.error('Excel parse error:', err);
        setError('Failed to parse Excel file. Ensure it has "date" and "name" columns.');
      }
    };
    // Use readAsArrayBuffer for broader browser support
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleBulkSave = async () => {
    setLoading(true);
    setError('');
    let successCount = 0;
    let errorCount = 0;
    
    for (const record of uploadedData) {
      try {
        await axios.post('/holidays/', {
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
    const parsed = parseDateString(holiday.holiday_date);
    setEditValues({
      holiday_date: parsed ? parsed.iso : '',
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
      
      await axios.put(`/holidays/${id}/`, {
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

  // Helper: parse server date strings into a Date object and ISO string (YYYY-MM-DD)
  const parseDateString = (s) => {
    if (!s) return null;
    try {
      const raw = String(s).trim();
      // If ISO format YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [y,m,d] = raw.split('-').map(Number);
        const dateObj = new Date(y, m-1, d);
        return { iso: `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`, dateObj };
      }
      // If DD-MM-YYYY
      if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(raw)) {
        const [d,m,y] = raw.split('-').map(Number);
        const dateObj = new Date(y, m-1, d);
        return { iso: `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`, dateObj };
      }
      // Try cleaning like in parser: remove ordinals, commas, add space before year
      let cleaned = raw.replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1').replace(/,/g, '').replace(/(\D)(\d{4})$/, '$1 $2');
      const d = new Date(cleaned);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const day = d.getDate();
        return { iso: `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`, dateObj: d };
      }
      return null;
    } catch (err) {
      return null;
    }
  };

  const formatDisplayDDMMYYYY = (dateObj) => {
    if (!dateObj) return '';
    const d = dateObj.getDate();
    const m = dateObj.getMonth() + 1;
    const y = dateObj.getFullYear();
    return `${String(d).padStart(2,'0')}-${String(m).padStart(2,'0')}-${y}`;
  };

  // Group holidays by year for display
  const holidaysByYear = (holidays || []).reduce((acc, h) => {
    const parsed = parseDateString(h.holiday_date);
    const year = parsed ? parsed.dateObj.getFullYear() : 'Unknown';
    if (!acc[year]) acc[year] = [];
    acc[year].push({ ...h, _parsed: parsed });
    return acc;
  }, {});

  // Available years derived from fetched holidays (exclude 'Unknown')
  const availableYears = Object.keys(holidaysByYear).filter(y => y !== 'Unknown').map(String).sort((a, b) => Number(b) - Number(a));

  // Pre-sorted year list for rendering (keeps Unknown at the end)
  const yearsSorted = Object.keys(holidaysByYear).sort((a,b) => {
    const na = !isNaN(Number(a));
    const nb = !isNaN(Number(b));
    if (na && nb) return Number(b) - Number(a);
    if (na) return -1;
    if (nb) return 1;
    return String(a).localeCompare(String(b));
  });

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
        <p className="text-sm text-gray-600 mb-3">Select an Excel file, click <strong>Preview File</strong> to inspect records, then <strong>Upload</strong> to save.</p>
        <div className="flex items-center gap-3">
          <label className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 cursor-pointer transition shadow-md">
            📁 Choose Excel File
            <input 
              type="file" 
              accept=".xlsx,.xls" 
              onChange={handleFilePick} 
              className="hidden"
            />
          </label>
          <div>
              {selectedFile ? (
                <div className="text-sm">
                  <div>Selected: <strong>{selectedFile.name}</strong></div>
                  <div className="mt-2 flex gap-2 items-center">
                    <button
                      onClick={parseSelectedFile}
                      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm"
                    >Preview File</button>
                    <button
                      onClick={() => { setSelectedFile(null); setUploadedData([]); setError(''); }}
                      className="px-3 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 transition text-sm"
                    >Clear</button>
                    {uploadedData.length > 0 && (
                      <div className="ml-3 text-sm text-gray-700">Parsed: <strong>{uploadedData.length}</strong> rows</div>
                    )}
                  </div>
                </div>
              ) : (
                <span className="text-sm text-gray-600">Supported formats: <strong>.xlsx, .xls</strong></span>
              )}
            </div>
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
                disabled={loading || uploadedData.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 transition"
              >
                {loading ? 'Uploading...' : 'Upload'}
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

      {/* Year filter */}
      {availableYears.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm font-medium">Show year:</label>
          <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="p-2 border rounded">
            <option value="all">All years</option>
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {/* Existing Holidays Year-wise */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h4 className="text-lg font-semibold mb-3">Existing Holidays (by Year)</h4>
        {loading && Object.keys(holidaysByYear).length === 0 ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-6">
            {yearsSorted.filter(year => selectedYear === 'all' || String(year) === String(selectedYear)).map(year => (
              <div key={year} className="">
                <h5 className="text-md font-semibold mb-2">{year}</h5>
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
                      {holidaysByYear[year].map(h => (
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
                              <td className="px-4 py-2 text-sm">{h._parsed ? formatDisplayDDMMYYYY(h._parsed.dateObj) : h.holiday_date}</td>
                              <td className="px-4 py-2 text-sm">{h.holiday_name}</td>
                              <td className="px-4 py-2 text-sm text-gray-600">{h._parsed ? h._parsed.dateObj.toLocaleDateString('en-US', { weekday: 'long' }) : h.holiday_day}</td>
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
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
