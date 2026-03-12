/**
 * Inward/Outward Register Management
 * 2-Tab Layout: Inward Register | Outward Register
 */
import React, { useState, useEffect } from 'react';
import PageTopbar from "../components/PageTopbar";
import { toDateInput } from "../utils/date";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  searchInstitutes,
  getMainCourses,
  getSubCoursesByMain,
  getInstituteCourses,
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

  // Dynamic extra fields (stored as plain object, sent as extra_data)
  const [inwardExtra, setInwardExtra] = useState({});
  const [outwardExtra, setOutwardExtra] = useState({});

  // Institute / course autocomplete state
  const [institutes, setInstitutes] = useState([]);
  const [allMainCourses, setAllMainCourses] = useState([]);
  const [inwardInstCourses, setInwardInstCourses] = useState([]);
  const [outwardInstCourses, setOutwardInstCourses] = useState([]);
  const [inwardSubBranches, setInwardSubBranches] = useState([]);
  const [outwardSubBranches, setOutwardSubBranches] = useState([]);

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

  // Load next numbers and main courses on mount
  useEffect(() => {
    fetchInwardNextNumber('Gen');
    fetchOutwardNextNumber('Gen');
    getMainCourses().then(d => setAllMainCourses(Array.isArray(d) ? d : (d?.results || []))).catch(() => {});
  }, []);

  // When institute search results arrive, auto-load courses for selected college
  useEffect(() => {
    if (institutes.length > 0) {
      if (inwardExtra.college && inwardInstCourses.length === 0) {
        const m = institutes.find(i => i.institute_name === inwardExtra.college);
        if (m) getInstituteCourses(m.institute_id).then(d => setInwardInstCourses(Array.isArray(d) ? d : (d?.results || []))).catch(() => {});
      }
      if (outwardExtra.college && outwardInstCourses.length === 0) {
        const m = institutes.find(i => i.institute_name === outwardExtra.college);
        if (m) getInstituteCourses(m.institute_id).then(d => setOutwardInstCourses(Array.isArray(d) ? d : (d?.results || []))).catch(() => {});
      }
    }
  }, [institutes]);

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
    const payload = {
      ...inwardForm,
      rec_type: ['Gen', 'Exam', 'Doc'].includes(inwardForm.inward_type) ? inwardForm.rec_type : '',
      extra_data: Object.keys(inwardExtra).length > 0 ? inwardExtra : null,
    };
    try {
      if (editingInward) {
        await updateInwardRegister(editingInward.id, payload);
        showAlert('success', 'Inward register updated successfully');
        setEditingInward(null);
      } else {
        await addInwardRegister(payload);
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
      setInwardExtra({});
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
      rec_type: record.rec_type || 'Internal',
      details: record.details || '',
      remark: record.remark || '',
    });
    const extra = record.extra_data || {};
    setInwardExtra(extra);
    setInwardInstCourses([]);
    setInwardSubBranches([]);
    if (extra.college) {
      searchInstitutes(extra.college)
        .then(d => setInstitutes(Array.isArray(d) ? d : (d?.results || [])))
        .catch(() => {});
    }
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
    setInwardExtra({});
  };

  // ==================== OUTWARD HANDLERS ====================

  const handleOutwardSubmit = async (e) => {
    e.preventDefault();
    if (!outwardForm.outward_date || !outwardForm.outward_type || !outwardForm.outward_to) {
      showAlert('error', 'Please fill all required fields');
      return;
    }
    setLoading(true);
    const payload = {
      ...outwardForm,
      send_type: ['Gen', 'Exam', 'Doc'].includes(outwardForm.outward_type) ? outwardForm.send_type : '',
      extra_data: Object.keys(outwardExtra).length > 0 ? outwardExtra : null,
    };
    try {
      if (editingOutward) {
        await updateOutwardRegister(editingOutward.id, payload);
        showAlert('success', 'Outward register updated successfully');
        setEditingOutward(null);
      } else {
        await addOutwardRegister(payload);
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
      setOutwardExtra({});
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
      send_type: record.send_type || 'Internal',
      details: record.details || '',
      remark: record.remark || '',
    });
    const extra = record.extra_data || {};
    setOutwardExtra(extra);
    setOutwardInstCourses([]);
    setOutwardSubBranches([]);
    if (extra.college) {
      searchInstitutes(extra.college)
        .then(d => setInstitutes(Array.isArray(d) ? d : (d?.results || [])))
        .catch(() => {});
    }
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
    setOutwardExtra({});
  };

  // ==================== COURSE / INSTITUTE LOOKUP ====================

  const fetchInstituteSearch = (value) => {
    if (!value || value.length < 2) { setInstitutes([]); return; }
    searchInstitutes(value).then(d => setInstitutes(Array.isArray(d) ? d : (d?.results || []))).catch(() => {});
  };

  const handleInwardCollegeChange = (value) => {
    setInwardExtra(prev => ({ ...prev, college: value, main_course: '', sub_course: '' }));
    setInwardInstCourses([]);
    setInwardSubBranches([]);
    fetchInstituteSearch(value);
  };

  const handleOutwardCollegeChange = (value) => {
    setOutwardExtra(prev => ({ ...prev, college: value, main_course: '', sub_course: '' }));
    setOutwardInstCourses([]);
    setOutwardSubBranches([]);
    fetchInstituteSearch(value);
  };

  const handleInwardMainCourseChange = (courseId) => {
    setInwardExtra(prev => ({ ...prev, main_course: courseId, sub_course: '' }));
    if (inwardInstCourses.length === 0 && courseId) {
      getSubCoursesByMain(courseId).then(d => setInwardSubBranches(Array.isArray(d) ? d : (d?.results || []))).catch(() => {});
    } else {
      setInwardSubBranches([]);
    }
  };

  const handleOutwardMainCourseChange = (courseId) => {
    setOutwardExtra(prev => ({ ...prev, main_course: courseId, sub_course: '' }));
    if (outwardInstCourses.length === 0 && courseId) {
      getSubCoursesByMain(courseId).then(d => setOutwardSubBranches(Array.isArray(d) ? d : (d?.results || []))).catch(() => {});
    } else {
      setOutwardSubBranches([]);
    }
  };

  const getInwardMainOptions = () => {
    if (inwardInstCourses.length > 0) {
      const seen = new Set();
      return inwardInstCourses
        .filter(o => { const k = o.maincourse?.maincourse_id; if (k && !seen.has(k)) { seen.add(k); return true; } return false; })
        .map(o => ({ id: o.maincourse.maincourse_id, name: o.maincourse.name || o.maincourse.maincourse_id }));
    }
    return allMainCourses.map(m => ({ id: m.maincourse_id, name: m.course_name || m.maincourse_id }));
  };

  const getInwardSubOptions = () => {
    if (inwardInstCourses.length > 0 && inwardExtra.main_course) {
      const seen = new Set();
      return inwardInstCourses
        .filter(o => o.maincourse?.maincourse_id === inwardExtra.main_course && o.subcourse?.subcourse_id)
        .filter(o => { const k = o.subcourse.subcourse_id; if (!seen.has(k)) { seen.add(k); return true; } return false; })
        .map(o => ({ id: o.subcourse.subcourse_id, name: o.subcourse.name || o.subcourse.subcourse_id }));
    }
    return inwardSubBranches.map(s => ({ id: s.subcourse_id, name: s.subcourse_name || s.subcourse_id }));
  };

  const getOutwardMainOptions = () => {
    if (outwardInstCourses.length > 0) {
      const seen = new Set();
      return outwardInstCourses
        .filter(o => { const k = o.maincourse?.maincourse_id; if (k && !seen.has(k)) { seen.add(k); return true; } return false; })
        .map(o => ({ id: o.maincourse.maincourse_id, name: o.maincourse.name || o.maincourse.maincourse_id }));
    }
    return allMainCourses.map(m => ({ id: m.maincourse_id, name: m.course_name || m.maincourse_id }));
  };

  const getOutwardSubOptions = () => {
    if (outwardInstCourses.length > 0 && outwardExtra.main_course) {
      const seen = new Set();
      return outwardInstCourses
        .filter(o => o.maincourse?.maincourse_id === outwardExtra.main_course && o.subcourse?.subcourse_id)
        .filter(o => { const k = o.subcourse.subcourse_id; if (!seen.has(k)) { seen.add(k); return true; } return false; })
        .map(o => ({ id: o.subcourse.subcourse_id, name: o.subcourse.name || o.subcourse.subcourse_id }));
    }
    return outwardSubBranches.map(s => ({ id: s.subcourse_id, name: s.subcourse_name || s.subcourse_id }));
  };

  // ==================== EXPORT FUNCTIONS ====================

  const exportInwardExcel = () => {
    const rows = inwardData.map((r) => ({
      'Inward No': r.inward_no, 'Date': r.inward_date, 'Type': r.inward_type,
      'From': r.inward_from, 'Rec Type': r.rec_type || '', 'Details': r.details || '', 'Remark': r.remark || '',
      'College': r.extra_data?.college || '', 'Main Course': r.extra_data?.main_course || '',
      'Sub Course': r.extra_data?.sub_course || '', 'Students': r.extra_data?.students || '',
      'Receiver Name': r.extra_data?.receiver || '', 'Place': r.extra_data?.place || '',
      'Subject': r.extra_data?.subject || '', 'Inward Ref No': r.extra_data?.inward_ref || '',
      'Enrollment No(s)': r.extra_data?.enrollment_nos || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inward');
    XLSX.writeFile(wb, 'Inward_Register.xlsx');
  };

  const exportInwardPDF = () => {
    const doc = new jsPDF();
    doc.text('Inward Register', 14, 15);
    autoTable(doc, {
      startY: 20,
      head: [['Inward No', 'Date', 'Type', 'From', 'Details']],
      body: inwardData.map((r) => [r.inward_no, r.inward_date, r.inward_type, r.inward_from, r.details || '']),
    });
    doc.save('Inward_Register.pdf');
  };

  const exportOutwardExcel = () => {
    const rows = outwardData.map((r) => ({
      'Outward No': r.outward_no, 'Date': r.outward_date, 'Type': r.outward_type,
      'To': r.outward_to, 'Send Type': r.send_type || '', 'Details': r.details || '', 'Remark': r.remark || '',
      'College': r.extra_data?.college || '', 'Main Course': r.extra_data?.main_course || '',
      'Sub Course': r.extra_data?.sub_course || '', 'Students': r.extra_data?.students || '',
      'Receiver Name': r.extra_data?.receiver || '', 'Place': r.extra_data?.place || '',
      'Subject': r.extra_data?.subject || '', 'Outward Ref No': r.extra_data?.outward_ref || '',
      'Enrollment No(s)': r.extra_data?.enrollment_nos || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Outward');
    XLSX.writeFile(wb, 'Outward_Register.xlsx');
  };

  const exportOutwardPDF = () => {
    const doc = new jsPDF();
    doc.text('Outward Register', 14, 15);
    autoTable(doc, {
      startY: 20,
      head: [['Outward No', 'Date', 'Type', 'To', 'Details']],
      body: outwardData.map((r) => [r.outward_no, r.outward_date, r.outward_type, r.outward_to, r.details || '']),
    });
    doc.save('Outward_Register.pdf');
  };

  // ==================== DYNAMIC FIELDS ====================

  const renderDynamicInwardFields = () => {
    const t = inwardForm.inward_type;
    if (t === 'Gen') return (
      <>
        <div>
          <label className="block text-sm font-medium mb-1">Receiver Name</label>
          <input type="text" value={inwardExtra.receiver || ''} onChange={(e) => setInwardExtra({ ...inwardExtra, receiver: e.target.value })} className="w-full border px-3 py-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Place</label>
          <input type="text" value={inwardExtra.place || ''} onChange={(e) => setInwardExtra({ ...inwardExtra, place: e.target.value })} className="w-full border px-3 py-2 rounded" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Subject</label>
          <input type="text" value={inwardExtra.subject || ''} onChange={(e) => setInwardExtra({ ...inwardExtra, subject: e.target.value })} className="w-full border px-3 py-2 rounded" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea value={inwardExtra.description || ''} onChange={(e) => setInwardExtra({ ...inwardExtra, description: e.target.value })} className="w-full border px-3 py-2 rounded" rows="2" />
        </div>
      </>
    );
    if (t === 'Enr') return (
      <>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">College Name</label>
          <input
            list="inward-institutes"
            type="text"
            value={inwardExtra.college || ''}
            onChange={(e) => handleInwardCollegeChange(e.target.value)}
            className="w-full border px-3 py-2 rounded"
            placeholder="Type to search college..."
          />
          <datalist id="inward-institutes">
            {institutes.map(i => <option key={i.institute_id} value={i.institute_name} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Main Course</label>
          <select
            value={inwardExtra.main_course || ''}
            onChange={(e) => handleInwardMainCourseChange(e.target.value)}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="">Select Course</option>
            {getInwardMainOptions().map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Sub Course</label>
          <select
            value={inwardExtra.sub_course || ''}
            onChange={(e) => setInwardExtra({ ...inwardExtra, sub_course: e.target.value })}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="">Select Sub Course</option>
            {getInwardSubOptions().map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">No of Students</label>
          <input type="number" value={inwardExtra.students || ''} onChange={(e) => setInwardExtra({ ...inwardExtra, students: e.target.value })} className="w-full border px-3 py-2 rounded" />
        </div>
      </>
    );
    if (t === 'Can') return (
      <>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">College Name</label>
          <input
            list="inward-institutes"
            type="text"
            value={inwardExtra.college || ''}
            onChange={(e) => handleInwardCollegeChange(e.target.value)}
            className="w-full border px-3 py-2 rounded"
            placeholder="Type to search college..."
          />
          <datalist id="inward-institutes">
            {institutes.map(i => <option key={i.institute_id} value={i.institute_name} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Inward Ref No</label>
          <input type="text" value={inwardExtra.inward_ref || ''} onChange={(e) => setInwardExtra({ ...inwardExtra, inward_ref: e.target.value })} className="w-full border px-3 py-2 rounded" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Enrollment No(s)</label>
          <textarea value={inwardExtra.enrollment_nos || ''} onChange={(e) => setInwardExtra({ ...inwardExtra, enrollment_nos: e.target.value })} className="w-full border px-3 py-2 rounded" rows="2" placeholder="One per line" />
        </div>
      </>
    );
    return null;
  };

  const renderDynamicOutwardFields = () => {
    const t = outwardForm.outward_type;
    if (t === 'Gen') return (
      <>
        <div>
          <label className="block text-sm font-medium mb-1">Receiver Name</label>
          <input type="text" value={outwardExtra.receiver || ''} onChange={(e) => setOutwardExtra({ ...outwardExtra, receiver: e.target.value })} className="w-full border px-3 py-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Place</label>
          <input type="text" value={outwardExtra.place || ''} onChange={(e) => setOutwardExtra({ ...outwardExtra, place: e.target.value })} className="w-full border px-3 py-2 rounded" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Subject</label>
          <input type="text" value={outwardExtra.subject || ''} onChange={(e) => setOutwardExtra({ ...outwardExtra, subject: e.target.value })} className="w-full border px-3 py-2 rounded" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea value={outwardExtra.description || ''} onChange={(e) => setOutwardExtra({ ...outwardExtra, description: e.target.value })} className="w-full border px-3 py-2 rounded" rows="2" />
        </div>
      </>
    );
    if (t === 'Enr') return (
      <>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">College Name</label>
          <input
            list="outward-institutes"
            type="text"
            value={outwardExtra.college || ''}
            onChange={(e) => handleOutwardCollegeChange(e.target.value)}
            className="w-full border px-3 py-2 rounded"
            placeholder="Type to search college..."
          />
          <datalist id="outward-institutes">
            {institutes.map(i => <option key={i.institute_id} value={i.institute_name} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Main Course</label>
          <select
            value={outwardExtra.main_course || ''}
            onChange={(e) => handleOutwardMainCourseChange(e.target.value)}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="">Select Course</option>
            {getOutwardMainOptions().map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Sub Course</label>
          <select
            value={outwardExtra.sub_course || ''}
            onChange={(e) => setOutwardExtra({ ...outwardExtra, sub_course: e.target.value })}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="">Select Sub Course</option>
            {getOutwardSubOptions().map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">No of Students</label>
          <input type="number" value={outwardExtra.students || ''} onChange={(e) => setOutwardExtra({ ...outwardExtra, students: e.target.value })} className="w-full border px-3 py-2 rounded" />
        </div>
      </>
    );
    if (t === 'Can') return (
      <>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">College Name</label>
          <input
            list="outward-institutes"
            type="text"
            value={outwardExtra.college || ''}
            onChange={(e) => handleOutwardCollegeChange(e.target.value)}
            className="w-full border px-3 py-2 rounded"
            placeholder="Type to search college..."
          />
          <datalist id="outward-institutes">
            {institutes.map(i => <option key={i.institute_id} value={i.institute_name} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Outward Ref No</label>
          <input type="text" value={outwardExtra.outward_ref || ''} onChange={(e) => setOutwardExtra({ ...outwardExtra, outward_ref: e.target.value })} className="w-full border px-3 py-2 rounded" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Enrollment No(s)</label>
          <textarea value={outwardExtra.enrollment_nos || ''} onChange={(e) => setOutwardExtra({ ...outwardExtra, enrollment_nos: e.target.value })} className="w-full border px-3 py-2 rounded" rows="2" placeholder="One per line" />
        </div>
      </>
    );
    return null;
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
      <div className="bg-white rounded-xl shadow p-4">
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
      <div className="bg-white rounded-xl shadow p-4">
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
              value={toDateInput(inwardForm.inward_date)}
              onChange={(e) => setInwardForm({ ...inwardForm, inward_date: e.target.value })}
              className="w-40 border px-2 py-1 rounded text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type <span className="text-red-500">*</span></label>
            <select
              value={inwardForm.inward_type}
              onChange={(e) => {
                setInwardForm({ ...inwardForm, inward_type: e.target.value });
                setInwardExtra({});
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
          {['Gen', 'Exam', 'Doc'].includes(inwardForm.inward_type) && (
          <div>
            <label className="block text-sm font-medium mb-1">Rec Type <span className="text-red-500">*</span></label>
            <select
              value={inwardForm.rec_type}
              onChange={(e) => setInwardForm({ ...inwardForm, rec_type: e.target.value })}
              className="w-full border px-3 py-2 rounded"
            >
              <option value="Internal">Internal</option>
              <option value="External">External</option>
            </select>
          </div>
          )}
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
          {renderDynamicInwardFields()}
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
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Inward Register List</h2>
          <div className="flex gap-2">
            <button onClick={exportInwardExcel} className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm">Export Excel</button>
            <button onClick={exportInwardPDF} className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm">Export PDF</button>
          </div>
        </div>
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
              value={toDateInput(outwardForm.outward_date)}
              onChange={(e) => setOutwardForm({ ...outwardForm, outward_date: e.target.value })}
              className="w-40 border px-2 py-1 rounded text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type <span className="text-red-500">*</span></label>
            <select
              value={outwardForm.outward_type}
              onChange={(e) => {
                setOutwardForm({ ...outwardForm, outward_type: e.target.value });
                setOutwardExtra({});
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
          {['Gen', 'Exam', 'Doc'].includes(outwardForm.outward_type) && (
          <div>
            <label className="block text-sm font-medium mb-1">Send Type <span className="text-red-500">*</span></label>
            <select
              value={outwardForm.send_type}
              onChange={(e) => setOutwardForm({ ...outwardForm, send_type: e.target.value })}
              className="w-full border px-3 py-2 rounded"
            >
              <option value="Internal">Internal</option>
              <option value="External">External</option>
            </select>
          </div>
          )}
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
          {renderDynamicOutwardFields()}
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
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Outward Register List</h2>
          <div className="flex gap-2">
            <button onClick={exportOutwardExcel} className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm">Export Excel</button>
            <button onClick={exportOutwardPDF} className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm">Export PDF</button>
          </div>
        </div>
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

  const TAB_LABELS = {
    inward: 'Inward Register',
    outward: 'Outward Register',
  };

  const topbarActions = Object.values(TAB_LABELS);
  const selectedAction = TAB_LABELS[activeTab];

  return (
    <div className="p-2 md:p-3 space-y-4">
      <PageTopbar
        title="Document Register (Inward/Outward)"
        actions={topbarActions}
        selected={selectedAction}
        onSelect={(action) => {
          const entry = Object.entries(TAB_LABELS).find(([, label]) => label === action);
          if (entry) {
            setActiveTab(entry[0]);
          }
        }}
      />

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
