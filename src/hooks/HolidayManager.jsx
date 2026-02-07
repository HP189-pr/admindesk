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
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString()); // Default to current year

  /* ========================= FETCH ========================= */

  const fetchHolidays = async (year = null) => {
    setLoading(true);
    try {
      const yearParam = year || selectedYear;
      const res = await axios.get(`/api/holidays/?year=${yearParam}`);
      const data = Array.isArray(res.data)
        ? res.data
        : res.data?.results || [];
      setHolidays(data);
    } catch (err) {
      console.error('Fetch holidays failed:', err);
      setHolidays([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, [selectedYear]);

  /* ========================= ADD ========================= */

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
        holiday_day: new Date(date).toLocaleDateString('en-US', { weekday: 'long' }),
      });
      setDate('');
      setName('');
      fetchHolidays();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add holiday');
    }
  };

  /* ========================= DELETE ========================= */

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this holiday?')) return;
    try {
      await axios.delete(`/api/holidays/${id}/`);
      fetchHolidays();
    } catch {
      setError('Failed to delete holiday');
    }
  };

  /* ========================= EXCEL ========================= */

  const handleFilePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadedData([]);
    setError('');
    e.target.value = '';
  };

  const parseSelectedFile = () => {
    if (!selectedFile) {
      setError('No file selected');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false });

        const parsed = rows
          .map((row, idx) => {
            const dateVal =
              row.date ||
              row.Date ||
              row.holiday_date ||
              row['Holiday Date'];

            const nameVal =
              row.name ||
              row.Name ||
              row.holiday_name ||
              row['Holiday Name'];

            if (!dateVal || !nameVal) return null;

            let clean = String(dateVal)
              .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
              .replace(/,/g, '')
              .trim();

            let d = /^\d{4}-\d{2}-\d{2}$/.test(clean)
              ? new Date(clean)
              : new Date(clean);

            if (isNaN(d.getTime())) return null;

            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const da = String(d.getDate()).padStart(2, '0');

            const iso = `${y}-${m}-${da}`;

            return {
              tempId: `tmp-${idx}`,
              holiday_date: iso,
              holiday_name: nameVal,
              holiday_day: d.toLocaleDateString('en-US', { weekday: 'long' }),
            };
          })
          .filter(Boolean);

        setUploadedData(parsed);
        if (!parsed.length) setError('No valid rows found');
      } catch (err) {
        console.error(err);
        setError('Failed to parse Excel file');
      }
    };

    reader.readAsArrayBuffer(selectedFile);
  };

  const handleBulkSave = async () => {
    setLoading(true);
    setError('');
    let failed = 0;

    for (const r of uploadedData) {
      try {
        await axios.post('/api/holidays/', r);
      } catch {
        failed++;
      }
    }

    setUploadedData([]);
    fetchHolidays();
    setLoading(false);

    if (failed) setError(`${failed} records failed (duplicates?)`);
  };

  /* ========================= EDIT ========================= */

  const handleEditStart = (h) => {
    setEditingId(h.hdid);
    setEditValues({
      holiday_date: h.holiday_date,
      holiday_name: h.holiday_name,
    });
  };

  const handleEditSave = async (id) => {
    try {
      const d = editValues.holiday_date;
      await axios.put(`/api/holidays/${id}/`, {
        holiday_date: d,
        holiday_name: editValues.holiday_name,
        holiday_day: new Date(d).toLocaleDateString('en-US', { weekday: 'long' }),
      });
      setEditingId(null);
      fetchHolidays();
    } catch {
      setError('Failed to update holiday');
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditValues({});
  };

  /* ========================= SORT HOLIDAYS (JAN TO DEC) ========================= */

  const sortedHolidays = [...holidays].sort(
    (a, b) => new Date(a.holiday_date) - new Date(b.holiday_date)
  );
  
  // Generate year options (current year ± 5 years)
  const currentYear = new Date().getFullYear();
  const yearOptions = [];
  for (let y = currentYear + 2; y >= currentYear - 5; y--) {
    yearOptions.push(y.toString());
  }

  /* ========================= UI ========================= */

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold">Holiday Management</h3>

      {/* ADD HOLIDAY PANEL */}
      <div className="bg-white border border-gray-300 rounded-lg shadow-sm p-6">
        <h4 className="font-semibold text-lg mb-4">Add New Holiday</h4>
        <form onSubmit={handleAdd} className="flex gap-3 flex-wrap items-end">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">Date</label>
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              className="border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500" 
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">Holiday Name</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Holiday Name" 
              className="border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500" 
            />
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded font-medium">
            Add Holiday
          </button>
        </form>
        
        {/* UPLOAD EXCEL */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h5 className="text-sm font-medium text-gray-700 mb-2">Or upload from Excel</h5>
          <div className="flex gap-2 items-center">
            <input type="file" accept=".xls,.xlsx" onChange={handleFilePick} className="text-sm" />
            <button onClick={parseSelectedFile} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm">
              Preview
            </button>
            {uploadedData.length > 0 && (
              <button onClick={handleBulkSave} className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm">
                {loading ? 'Saving...' : 'Upload'}
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded">{error}</div>}

      {/* HOLIDAY LIST PANEL */}
      <div className="bg-white border border-gray-300 rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h4 className="font-semibold text-lg">Holiday List</h4>
          
          {/* YEAR FILTER */}
          <div className="flex items-center gap-3">
            <label className="font-medium text-gray-700">Year:</label>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="text-sm text-gray-600">({holidays.length} holidays)</span>
          </div>
        </div>

        {loading && <div className="text-gray-500 text-center py-4">Loading...</div>}

        {/* LIST */}
        {!loading && holidays.length === 0 && (
          <div className="text-gray-500 text-center py-8">No holidays found for {selectedYear}</div>
        )}

        {!loading && holidays.length > 0 && (
          <table className="min-w-full border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="border-b px-4 py-2 text-left text-sm font-semibold text-gray-700 w-16">No.</th>
                <th className="border-b px-4 py-2 text-left text-sm font-semibold text-gray-700">Date</th>
                <th className="border-b px-4 py-2 text-left text-sm font-semibold text-gray-700">Holiday Name</th>
                <th className="border-b px-4 py-2 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedHolidays.map((h, index) => (
                <tr key={h.hdid} className="border-b hover:bg-gray-50">
                  {editingId === h.hdid ? (
                    <>
                      <td className="px-4 py-2 text-gray-600 font-medium">{index + 1}</td>
                      <td className="px-4 py-2">
                        <input 
                          type="date" 
                          value={editValues.holiday_date} 
                          onChange={e => setEditValues(v => ({ ...v, holiday_date: e.target.value }))} 
                          className="border border-gray-300 px-2 py-1 rounded w-full"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input 
                          value={editValues.holiday_name} 
                          onChange={e => setEditValues(v => ({ ...v, holiday_name: e.target.value }))} 
                          className="border border-gray-300 px-2 py-1 rounded w-full"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleEditSave(h.hdid)} 
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                          >
                            Save
                          </button>
                          <button 
                            onClick={handleEditCancel} 
                            className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 text-gray-600 font-medium">{index + 1}</td>
                      <td className="px-4 py-2 text-gray-800">{h.holiday_date}</td>
                      <td className="px-4 py-2 text-gray-800">{h.holiday_name}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleEditStart(h)} 
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => handleDelete(h.hdid)} 
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
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
        )}
      </div>
    </div>
  );
}
