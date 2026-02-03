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

  /* ========================= FETCH ========================= */

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/holidays/?all=1');
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
  }, []);

  /* ========================= ADD ========================= */

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
      await axios.delete(`/holidays/${id}/`);
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
        await axios.post('/holidays/', r);
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
      await axios.put(`/holidays/${id}/`, {
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

  /* ========================= GROUP BY YEAR ========================= */

  const holidaysByYear = holidays.reduce((acc, h) => {
    const y = h.holiday_date?.slice(0, 4) || 'Unknown';
    acc[y] = acc[y] || [];
    acc[y].push(h);
    return acc;
  }, {});

  const years = Object.keys(holidaysByYear).sort((a, b) => b.localeCompare(a));

  /* ========================= UI ========================= */

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold">Holiday Management</h3>

      {/* ADD */}
      <form onSubmit={handleAdd} className="flex gap-2 flex-wrap">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border p-2 rounded" />
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Holiday Name" className="border p-2 rounded" />
        <button className="bg-indigo-600 text-white px-4 py-2 rounded">Add</button>
      </form>

      {/* UPLOAD */}
      <div className="space-x-2">
        <input type="file" accept=".xls,.xlsx" onChange={handleFilePick} />
        <button onClick={parseSelectedFile} className="bg-blue-600 text-white px-3 py-1 rounded">Preview</button>
        {uploadedData.length > 0 && (
          <button onClick={handleBulkSave} className="bg-green-600 text-white px-3 py-1 rounded">
            {loading ? 'Saving...' : 'Upload'}
          </button>
        )}
      </div>

      {error && <div className="text-red-600">{error}</div>}

      {/* LIST */}
      {years.filter(y => selectedYear === 'all' || y === selectedYear).map(year => (
        <div key={year}>
          <h4 className="font-semibold mt-4">{year}</h4>
          <table className="min-w-full border mt-2">
            <tbody>
              {holidaysByYear[year].map(h => (
                <tr key={h.hdid} className="border-t">
                  {editingId === h.hdid ? (
                    <>
                      <td><input type="date" value={editValues.holiday_date} onChange={e => setEditValues(v => ({ ...v, holiday_date: e.target.value }))} /></td>
                      <td><input value={editValues.holiday_name} onChange={e => setEditValues(v => ({ ...v, holiday_name: e.target.value }))} /></td>
                      <td>
                        <button onClick={() => handleEditSave(h.hdid)}>Save</button>
                        <button onClick={handleEditCancel}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{h.holiday_date}</td>
                      <td>{h.holiday_name}</td>
                      <td>
                        <button onClick={() => handleEditStart(h)}>Edit</button>
                        <button onClick={() => handleDelete(h.hdid)}>Delete</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
