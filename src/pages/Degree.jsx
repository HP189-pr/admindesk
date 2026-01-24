/**
 * Degree.jsx
 * Main degree management component with CRUD operations
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageTopbar from '../components/PageTopbar';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';
import {
    getDegrees,
    createDegree,
    updateDegree,
    deleteDegree,
    getAllConvocations,
    getConvocations,
    createConvocation,
    updateConvocation,
    deleteConvocation,
    bulkUploadDegrees,
    getBulkUploadProgress,
    downloadBulkUploadLog
} from '../services/degreeService';
import DegreeReport from '../report/DegreeReport';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Degree = ({ onToggleSidebar, onToggleChatbox }) => {
    const navigate = useNavigate();
    const [degrees, setDegrees] = useState([]);
    const [convocations, setConvocations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [panelOpen, setPanelOpen] = useState(true);
    const [selectedMenu, setSelectedMenu] = useState('🔍');
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [pageSize] = useState(50);
    
    // Filter state
    const [searchTerm, setSearchTerm] = useState('');
    const [filterConvocation, setFilterConvocation] = useState('');
    const [filterExamYear, setFilterExamYear] = useState('');
    const [filterConvocationMonth, setFilterConvocationMonth] = useState('');
    const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
    const [appliedConvocation, setAppliedConvocation] = useState('');
    const [appliedExamYear, setAppliedExamYear] = useState('');
    const [appliedConvocationMonth, setAppliedConvocationMonth] = useState('');
    const [hasSearched, setHasSearched] = useState(false);
    const [convocationList, setConvocationList] = useState([]);
    const [convocationLoading, setConvocationLoading] = useState(false);
    const [convocationSearchTerm, setConvocationSearchTerm] = useState('');
    const [convocationYear, setConvocationYear] = useState('');
    const [showConvocationModal, setShowConvocationModal] = useState(false);
    const [editingConvocation, setEditingConvocation] = useState(null);
    const [convocationFormData, setConvocationFormData] = useState({
        convocation_no: '',
        convocation_title: '',
        convocation_date: '',
        month_year: ''
    });
    
    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadResult, setUploadResult] = useState(null);
    const [uploadId, setUploadId] = useState(null);
    const [editingDegree, setEditingDegree] = useState(null);
    const [formData, setFormData] = useState({
        dg_sr_no: '',
        enrollment_no: '',
        student_name_dg: '',
        dg_address: '',
        dg_contact: '',
        institute_name_dg: '',
        degree_name: '',
        specialisation: '',
        seat_last_exam: '',
        last_exam_month: '',
        last_exam_year: '',
        class_obtain: '',
        course_language: '',
        dg_rec_no: '',
        dg_gender: '',
        convocation_no: ''
    });

    useEffect(() => {
        fetchConvocations();
    }, []);

    useEffect(() => {
        if (!hasSearched) return;
        fetchDegrees();
    }, [currentPage, pageSize, appliedSearchTerm, appliedConvocation, appliedExamYear, hasSearched]);

    useEffect(() => {
        if (selectedMenu === '🎖 Convocation') {
            fetchConvocationList();
        }
    }, [selectedMenu]);

    const fetchDegrees = async () => {
        setLoading(true);
        try {
            const params = {
                page: currentPage,
                page_size: pageSize,
            };
            
            if (appliedSearchTerm) params.search = appliedSearchTerm;
            if (appliedConvocation) {
                const convParam = Number(appliedConvocation);
                params.convocation_no = Number.isNaN(convParam) ? appliedConvocation : convParam;
            } else if (appliedConvocationMonth) {
                const match = convocations.find((conv) => conv.month_year === appliedConvocationMonth);
                if (match) {
                    params.convocation_no = match.convocation_no;
                }
            }
            if (appliedExamYear) params.last_exam_year = appliedExamYear;
            
            const data = await getDegrees(params);
            setDegrees(data.results || []);
            setTotalPages(data.num_pages || 1);
            setTotalCount(data.count || 0);
        } catch (err) {
            toast.error('Failed to load degrees: ' + (err.response?.data?.detail || err.message));
        } finally {
            setLoading(false);
        }
    };

    const fetchConvocations = async () => {
        try {
            const data = await getAllConvocations();
            setConvocations(data || []);
        } catch (err) {
            console.error('Failed to load convocations:', err);
        }
    };

    const fetchConvocationList = async (overrides = {}) => {
        setConvocationLoading(true);
        try {
            const params = {};
            const searchValue = overrides.search ?? convocationSearchTerm;
            const yearValue = overrides.year ?? convocationYear;
            if (searchValue) params.search = searchValue.trim();
            if (yearValue) params.year = yearValue;
            const data = await getConvocations(params);
            const list = Array.isArray(data)
                ? data
                : Array.isArray(data?.results)
                    ? data.results
                    : [];
            setConvocationList(list);
        } catch (err) {
            toast.error('Failed to load convocations: ' + (err.response?.data?.detail || err.message));
        } finally {
            setConvocationLoading(false);
        }
    };

    const handleConvocationFiltersApply = () => {
        fetchConvocationList();
    };

    const handleConvocationFiltersReset = () => {
        setConvocationSearchTerm('');
        setConvocationYear('');
        fetchConvocationList({ search: '', year: '' });
    };

    const resetConvocationForm = () => {
        setConvocationFormData({
            convocation_no: '',
            convocation_title: '',
            convocation_date: '',
            month_year: ''
        });
        setEditingConvocation(null);
    };

    const handleConvocationFormChange = (e) => {
        const { name, value } = e.target;
        setConvocationFormData((prev) => ({ ...prev, [name]: value }));
    };

    const openConvocationModal = () => {
        resetConvocationForm();
        setShowConvocationModal(true);
    };

    const handleConvocationSubmit = async (e) => {
        e.preventDefault();
        const convInput = convocationFormData.convocation_no;
        const convNumber = convInput === '' || convInput === null || typeof convInput === 'undefined'
            ? null
            : Number(convInput);
        const payload = {
            convocation_no: Number.isNaN(convNumber) ? null : convNumber,
            convocation_title: convocationFormData.convocation_title?.trim() || null,
            convocation_date: convocationFormData.convocation_date || null,
            month_year: convocationFormData.month_year?.trim() || null,
        };

        try {
            if (editingConvocation) {
                await updateConvocation(editingConvocation.id, payload);
                toast.success('Convocation updated successfully');
            } else {
                await createConvocation(payload);
                toast.success('Convocation created successfully');
            }
            setShowConvocationModal(false);
            resetConvocationForm();
            fetchConvocationList();
            fetchConvocations();
        } catch (err) {
            toast.error('Failed to save convocation: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleEditConvocation = (convocation) => {
        setEditingConvocation(convocation);
        setConvocationFormData({
            convocation_no: convocation.convocation_no ?? '',
            convocation_title: convocation.convocation_title ?? '',
            convocation_date: convocation.convocation_date ?? '',
            month_year: convocation.month_year ?? ''
        });
        setShowConvocationModal(true);
    };

    const handleDeleteConvocation = async (convocation) => {
        if (!window.confirm('Are you sure you want to delete this convocation?')) return;
        try {
            await deleteConvocation(convocation.id);
            toast.success('Convocation deleted successfully');
            fetchConvocationList();
            fetchConvocations();
        } catch (err) {
            toast.error('Failed to delete convocation: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleSearchDegrees = () => {
        setAppliedSearchTerm(searchTerm.trim());
        setAppliedConvocation(filterConvocation);
        setAppliedExamYear(filterExamYear);
        setAppliedConvocationMonth(filterConvocationMonth);
        setCurrentPage(1);
        setHasSearched(true);
    };

    const handleClearSearch = () => {
        setSearchTerm('');
        setFilterConvocation('');
        setFilterExamYear('');
        setFilterConvocationMonth('');
        setAppliedSearchTerm('');
        setAppliedConvocation('');
        setAppliedExamYear('');
        setAppliedConvocationMonth('');
        setDegrees([]);
        setTotalPages(1);
        setTotalCount(0);
        setCurrentPage(1);
        setHasSearched(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        try {
            if (editingDegree) {
                await updateDegree(editingDegree.dg_sr_no, formData);
                toast.success('Degree updated successfully');
            } else {
                await createDegree(formData);
                toast.success('Degree created successfully');
            }
            setShowModal(false);
            resetForm();
            fetchDegrees();
        } catch (err) {
            toast.error(err.response?.data?.detail || err.message || 'Operation failed');
        }
    };

    const handleEdit = (degree) => {
        setEditingDegree(degree);
        setFormData({
            dg_sr_no: degree.dg_sr_no || '',
            enrollment_no: degree.enrollment_no || '',
            student_name_dg: degree.student_name_dg || '',
            dg_address: degree.dg_address || '',
            dg_contact: degree.dg_contact || '',
            institute_name_dg: degree.institute_name_dg || '',
            degree_name: degree.degree_name || '',
            specialisation: degree.specialisation || '',
            seat_last_exam: degree.seat_last_exam || '',
            last_exam_month: degree.last_exam_month || '',
            last_exam_year: degree.last_exam_year || '',
            class_obtain: degree.class_obtain || '',
            course_language: degree.course_language || '',
            dg_rec_no: degree.dg_rec_no || '',
            dg_gender: degree.dg_gender || '',
            convocation_no: degree.convocation_no || ''
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this degree record?')) return;
        
        try {
            await deleteDegree(id);
            toast.success('Degree deleted successfully!');
            fetchDegrees();
        } catch (err) {
            toast.error('Failed to delete degree: ' + (err.response?.data?.detail || err.message));
        }
    };

    const resetForm = () => {
        setFormData({
            dg_sr_no: '',
            enrollment_no: '',
            student_name_dg: '',
            dg_address: '',
            dg_contact: '',
            institute_name_dg: '',
            degree_name: '',
            specialisation: '',
            seat_last_exam: '',
            last_exam_month: '',
            last_exam_year: '',
            class_obtain: '',
            course_language: '',
            dg_rec_no: '',
            dg_gender: '',
            convocation_no: ''
        });
        setEditingDegree(null);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleBulkUpload = async () => {
        if (!uploadFile) {
            toast.error('Please select a CSV file');
            return;
        }

        try {
            setUploadProgress(0);
            setUploadResult(null);
            const startResp = await bulkUploadDegrees(uploadFile);
            // expect { upload_id, total, message } with 202
            const id = startResp.upload_id;
            if (!id) {
                toast.error('Unexpected response from server');
                return;
            }
            setUploadId(id);

            // Poll progress every 1 second
            let stopped = false;
            const pollInterval = 1000;
            const poller = setInterval(async () => {
                try {
                    const p = await getBulkUploadProgress(id);
                    setUploadProgress(p.percent || 0);

                    if (p.status === 'finished' || p.status === 'error') {
                        clearInterval(poller);
                        stopped = true;
                        setUploadResult({
                            created: p.created,
                            updated: p.updated,
                            errors: p.errors || [],
                            log_file: p.log_file || null
                        });

                        toast.success(`Bulk upload finished. Created: ${p.created}, Updated: ${p.updated}`);
                        if (p.errors && p.errors.length > 0) {
                            toast.warning(`${p.errors.length} rows had errors. Check details below.`);
                        }
                        fetchDegrees();
                        setUploadId(null);
                    }
                } catch (err) {
                    console.error('Error polling upload progress', err);
                    clearInterval(poller);
                    if (!stopped) {
                        toast.error('Error monitoring upload progress.');
                        setUploadProgress(0);
                    }
                }
            }, pollInterval);

            // Also set an initial indicator so the UI shows immediate progress
            setUploadProgress(5);
        } catch (err) {
            toast.error('Bulk upload failed: ' + (err.response?.data?.error || err.message));
            setUploadProgress(0);
        }
    };

    const handleDownloadLog = async () => {
        if (!uploadId && !(uploadResult && uploadResult.log_file)) {
            toast.error('No upload log available');
            return;
        }
        // Prefer active uploadId if present, otherwise try to extract id from result.log_file path
        const id = uploadId || (uploadResult && uploadResult.log_file && (() => {
            // try to parse UUID from server path like ...bulk_upload_degrees_<uuid>.log
            const m = String(uploadResult.log_file).match(/bulk_upload_degrees_([0-9a-fA-F-]{36})/);
            return m ? m[1] : null;
        })());

        if (!id) {
            toast.error('Unable to determine upload id for log');
            return;
        }

        try {
            const resp = await downloadBulkUploadLog(id);
            const content = resp.log || '';
            const blob = new Blob([content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bulk_upload_degrees_${id}.log`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            toast.success('Log downloaded');
        } catch (err) {
            toast.error('Failed to download log: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && !file.name.endsWith('.csv')) {
            toast.error('Please select a CSV file');
            return;
        }
        setUploadFile(file);
        setUploadResult(null);
        setUploadProgress(0);
    };

    const downloadTemplate = () => {
        const csvContent = `dg_sr_no,enrollment_no,student_name_dg,dg_address,dg_contact,institute_name_dg,degree_name,specialisation,seat_last_exam,last_exam_month,last_exam_year,class_obtain,course_language,dg_rec_no,dg_gender,convocation_no
DG001,2023001,John Doe,123 Main St Mumbai,+91 9876543210,ABC Institute,Bachelor of Science,Computer Science,101,May,2023,First Class,English,REC001,Male,1
DG002,2023002,Jane Smith,456 Park Ave Delhi,+91 9876543211,XYZ College,Master of Arts,English Literature,102,June,2023,First Class with Distinction,English,REC002,Female,1`;
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'degree_bulk_upload_template.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        toast.success('Template downloaded!');
    };

    const actions = ["➕", "🔍", "📄 Report", "🎖 Convocation"];

    const panelTitle = selectedMenu === '➕'
        ? 'ADD Panel'
        : selectedMenu === '🔍'
            ? 'SEARCH Panel'
            : selectedMenu === '📄 Report'
                ? 'REPORT Panel'
                : 'CONVOCATION Panel';

    const convocationMonthYearOptions = useMemo(() => {
        const seen = new Set();
        const options = [];
        convocations.forEach((conv) => {
            if (conv.month_year && !seen.has(conv.month_year)) {
                seen.add(conv.month_year);
                options.push({ label: conv.month_year, value: conv.month_year, convocation_no: conv.convocation_no });
            }
        });
        return options;
    }, [convocations]);

    const handleConvocationMonthFilterChange = (value) => {
        setFilterConvocationMonth(value);
        if (!value) {
            return;
        }
        const match = convocationMonthYearOptions.find((opt) => opt.value === value);
        if (match) {
            setFilterConvocation(String(match.convocation_no));
        }
    };

    const handleTopbarSelect = (action) => {
        setSelectedMenu(action);
        setPanelOpen(true);
    };

    return (
        <div className="p-4 md:p-6 space-y-4 h-full bg-slate-100">
            {/* Page Topbar */}
            <PageTopbar
                title="Degree"
                actions={actions}
                selected={selectedMenu}
                onSelect={handleTopbarSelect}
                actionsOnLeft
                leftSlot={
                    <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-600 text-white text-xl">
                        🎓
                    
                    </div>
                }
            />

            {/* Collapsible Action Panel */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
                    <div className="font-semibold">{panelTitle}</div>
                    <button
                        onClick={() => setPanelOpen((o) => !o)}
                        className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
                    >
                        {panelOpen ? <FaChevronUp /> : <FaChevronDown />} {panelOpen ? 'Collapse' : 'Expand'}
                    </button>
                </div>
                {panelOpen && (
                    <div className="p-4">
                        {selectedMenu === '➕' && (
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        resetForm();
                                        setShowModal(true);
                                    }}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    ➕ Add New Degree
                                </button>
                                <button
                                    onClick={() => setShowBulkUploadModal(true)}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                                >
                                    📤 Bulk Upload CSV
                                </button>
                            </div>
                        )}
                        {selectedMenu === '🔍' && (
                            <div className="space-y-4 bg-white/80 border border-indigo-100 rounded-2xl p-4 shadow-sm">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-600 mb-1">Search</label>
                                        <input
                                            type="text"
                                            placeholder="Search enrollment, name, etc..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-600 mb-1">Convocation</label>
                                        <select
                                            value={filterConvocation}
                                            onChange={(e) => setFilterConvocation(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-200 bg-white"
                                        >
                                            <option value="">All Convocations</option>
                                            {convocations.map(conv => (
                                                <option key={conv.id} value={conv.convocation_no}>
                                                    Convocation {conv.convocation_no} - {conv.convocation_title}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-600 mb-1">Convocation Month-Year</label>
                                        <select
                                            value={filterConvocationMonth}
                                            onChange={(e) => handleConvocationMonthFilterChange(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-200 bg-white"
                                        >
                                            <option value="">Select Month-Year</option>
                                            {convocationMonthYearOptions.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-600 mb-1">Exam Year</label>
                                        <input
                                            type="number"
                                            placeholder="e.g., 2024"
                                            value={filterExamYear}
                                            onChange={(e) => setFilterExamYear(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-200"
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-wrap justify-end gap-3">
                                    {hasSearched && (
                                        <button
                                            type="button"
                                            onClick={handleClearSearch}
                                            className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-indigo-50"
                                        >
                                            Clear
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleSearchDegrees}
                                        className="px-5 py-2.5 bg-[#5d4bff] text-white rounded-xl shadow hover:bg-[#4b3de6] disabled:bg-gray-400 disabled:cursor-not-allowed"
                                        disabled={loading}
                                    >
                                        Search Degrees
                                    </button>
                                </div>
                            </div>
                        )}
                        {selectedMenu === '📄 Report' && (
                            <DegreeReport />
                        )}
                        {selectedMenu === '🎖 Convocation' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Search</label>
                                        <input
                                            type="text"
                                            placeholder="Search number or title"
                                            value={convocationSearchTerm}
                                            onChange={(e) => setConvocationSearchTerm(e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Year</label>
                                        <input
                                            type="number"
                                            placeholder="e.g., 2024"
                                            value={convocationYear}
                                            onChange={(e) => setConvocationYear(e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg"
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={handleConvocationFiltersReset}
                                            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                                        >
                                            Reset Filters
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleConvocationFiltersApply}
                                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                            disabled={convocationLoading}
                                        >
                                            Search Convocations
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={openConvocationModal}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                                    >
                                        ➕ Add Convocation
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Records Section */}
            {selectedMenu !== '➕' && selectedMenu !== '🎖 Convocation' && (
                <div className="bg-white shadow rounded-2xl p-4 h-[calc(100vh-220px)] overflow-auto">
                    <h2 className="text-lg font-semibold mb-4">Degree Search</h2>
                    <div className="overflow-x-auto rounded-2xl border border-indigo-100 shadow-sm">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-indigo-50 text-indigo-900 uppercase text-[11px] tracking-wide">
                                    <th className="p-3 text-left font-semibold">DG SR No</th>
                                    <th className="p-3 text-left font-semibold">Enrollment</th>
                                    <th className="p-3 text-left font-semibold">Student Name</th>
                                    <th className="p-3 text-left font-semibold">Contact</th>
                                    <th className="p-3 text-left font-semibold">Degree</th>
                                    <th className="p-3 text-left font-semibold">Specialisation</th>
                                    <th className="p-3 text-left font-semibold">Year</th>
                                    <th className="p-3 text-left font-semibold">Class</th>
                                    <th className="p-3 text-left font-semibold">Conv</th>
                                    <th className="p-3 text-left font-semibold">Convocation Month-Year</th>
                                    <th className="p-3 text-left font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="11" className="p-4 text-center text-gray-500 bg-white">Loading...</td>
                                </tr>
                            ) : degrees.length === 0 ? (
                                <tr>
                                    <td colSpan="11" className="p-4 text-center text-gray-500 bg-white">No degree records found.</td>
                                </tr>
                            ) : (
                                degrees.map((degree, idx) => (
                                    <tr
                                        key={degree.id}
                                        className={`border-b border-indigo-100 text-gray-700 ${idx % 2 === 0 ? 'bg-white' : 'bg-indigo-50/40'} hover:bg-indigo-50 transition-colors`}
                                    >
                                        <td className="p-3 font-semibold text-gray-900">{degree.dg_sr_no || '-'}</td>
                                        <td className="p-3">{degree.enrollment_no}</td>
                                        <td className="p-3">{degree.student_name_dg || '-'}</td>
                                        <td className="p-3">{degree.dg_contact || '-'}</td>
                                        <td className="p-3">{degree.degree_name || '-'}</td>
                                        <td className="p-3">{degree.specialisation || '-'}</td>
                                        <td className="p-3">{degree.last_exam_year || '-'}</td>
                                        <td className="p-3">{degree.class_obtain || '-'}</td>
                                        <td className="p-3">{degree.convocation_no || '-'}</td>
                                        <td className="p-3">{degree.convocation_month_year || '-'}</td>
                                        <td className="p-3">
                                            <button
                                                onClick={() => handleEdit(degree)}
                                                className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 mr-2"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(degree.id)}
                                                className="px-3 py-1 text-xs font-semibold rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
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
            )}

            {selectedMenu === '🎖 Convocation' && (
                <div className="bg-white shadow rounded-2xl p-4">
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                        <h2 className="text-lg font-semibold">Convocation Master</h2>
                        <button
                            type="button"
                            onClick={openConvocationModal}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                            ➕ Add Convocation
                        </button>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-indigo-100 shadow-sm">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-indigo-50 text-indigo-900 uppercase text-[11px] tracking-wide">
                                    <th className="p-3 text-left font-semibold">#</th>
                                    <th className="p-3 text-left font-semibold">Title</th>
                                    <th className="p-3 text-left font-semibold">Date</th>
                                    <th className="p-3 text-left font-semibold">Month-Year</th>
                                    <th className="p-3 text-left font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {convocationLoading ? (
                                    <tr>
                                        <td colSpan="5" className="p-4 text-center text-gray-500 bg-white">Loading convocations...</td>
                                    </tr>
                                ) : convocationList.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="p-4 text-center text-gray-500 bg-white">No convocations found.</td>
                                    </tr>
                                ) : (
                                    convocationList.map((conv, idx) => (
                                        <tr
                                            key={conv.id}
                                            className={`border-b border-indigo-100 text-gray-700 ${idx % 2 === 0 ? 'bg-white' : 'bg-indigo-50/40'} hover:bg-indigo-50 transition-colors`}
                                        >
                                            <td className="p-3 font-semibold text-gray-900">{conv.convocation_no}</td>
                                            <td className="p-3">{conv.convocation_title || '-'}</td>
                                            <td className="p-3">{conv.convocation_date || '-'}</td>
                                            <td className="p-3">{conv.month_year || '-'}</td>
                                            <td className="p-3">
                                                <button
                                                    onClick={() => handleEditConvocation(conv)}
                                                    className="px-3 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 mr-2"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteConvocation(conv)}
                                                    className="px-3 py-1 text-xs font-semibold rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
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
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
                    <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-8">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-2xl font-bold text-gray-800">{editingDegree ? 'Edit Degree' : 'Add New Degree'}</h2>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-2">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">DG SR No</label>
                                    <input type="text" name="dg_sr_no" value={formData.dg_sr_no} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Enrollment No <span className="text-red-500">*</span></label>
                                    <input type="text" name="enrollment_no" value={formData.enrollment_no} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Student Name</label>
                                    <input type="text" name="student_name_dg" value={formData.student_name_dg} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                                    <select name="dg_gender" value={formData.dg_gender} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                        <option value="">Select Gender</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                                    <input type="tel" name="dg_contact" value={formData.dg_contact} onChange={handleInputChange} placeholder="e.g., +91 9876543210" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                                    <textarea name="dg_address" value={formData.dg_address} onChange={handleInputChange} rows="2" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Institute Name</label>
                                    <input type="text" name="institute_name_dg" value={formData.institute_name_dg} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Degree Name</label>
                                    <input type="text" name="degree_name" value={formData.degree_name} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Specialisation</label>
                                    <input type="text" name="specialisation" value={formData.specialisation} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Course Language</label>
                                    <input type="text" name="course_language" value={formData.course_language} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Seat Last Exam</label>
                                    <input type="text" name="seat_last_exam" value={formData.seat_last_exam} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Exam Month</label>
                                    <input type="text" name="last_exam_month" value={formData.last_exam_month} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Exam Year</label>
                                    <input type="number" name="last_exam_year" value={formData.last_exam_year} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Class Obtained</label>
                                    <input type="text" name="class_obtain" value={formData.class_obtain} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">DG Record No</label>
                                    <input type="text" name="dg_rec_no" value={formData.dg_rec_no} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Convocation</label>
                                    <select name="convocation_no" value={formData.convocation_no} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                        <option value="">Select Convocation</option>
                                        {convocations.map(conv => (
                                            <option key={conv.id} value={conv.convocation_no}>
                                                Conv {conv.convocation_no} - {conv.convocation_title}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            
                            <div className="mt-6 flex justify-end gap-3">
                                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingDegree ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showConvocationModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-gray-800">
                                {editingConvocation ? 'Edit Convocation' : 'Add Convocation'}
                            </h2>
                            <button
                                onClick={() => {
                                    setShowConvocationModal(false);
                                    resetConvocationForm();
                                }}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                ✕
                            </button>
                        </div>
                        <form onSubmit={handleConvocationSubmit} className="px-6 py-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Convocation Number <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    name="convocation_no"
                                    value={convocationFormData.convocation_no}
                                    onChange={handleConvocationFormChange}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                                <input
                                    type="text"
                                    name="convocation_title"
                                    value={convocationFormData.convocation_title || ''}
                                    onChange={handleConvocationFormChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Convocation Date <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    name="convocation_date"
                                    value={convocationFormData.convocation_date || ''}
                                    onChange={handleConvocationFormChange}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Month-Year Label</label>
                                <input
                                    type="text"
                                    name="month_year"
                                    placeholder="e.g., Oct-2024"
                                    value={convocationFormData.month_year || ''}
                                    onChange={handleConvocationFormChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowConvocationModal(false);
                                        resetConvocationForm();
                                    }}
                                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    {editingConvocation ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Bulk Upload Modal */}
            {showBulkUploadModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-2xl font-bold text-gray-800">Bulk Upload Degrees</h2>
                        </div>
                        
                        <div className="px-6 py-4">
                            <div className="mb-4">
                                <button
                                    onClick={downloadTemplate}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-300"
                                >
                                    📥 Download CSV Template
                                </button>
                                <p className="text-sm text-gray-600 mt-2">
                                    Download the template to see the required format with all fields including the new Contact field.
                                </p>
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Select CSV File
                                </label>
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                                {uploadFile && (
                                    <p className="text-sm text-green-600 mt-1">
                                        Selected: {uploadFile.name}
                                    </p>
                                )}
                            </div>

                            {uploadProgress > 0 && uploadProgress < 100 && (
                                <div className="mb-4">
                                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                                        <div
                                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                                            style={{ width: `${uploadProgress}%` }}
                                        ></div>
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1">Uploading... {uploadProgress}%</p>
                                </div>
                            )}

                            {uploadResult && (
                                <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                                    <h3 className="font-semibold text-blue-900 mb-2">Upload Results</h3>
                                    <div className="text-sm text-blue-800 space-y-1">
                                        <p>✅ Created: {uploadResult.created}</p>
                                        <p>🔄 Updated: {uploadResult.updated}</p>
                                        {uploadResult.errors && uploadResult.errors.length > 0 && (
                                            <div className="mt-2">
                                                <p className="text-red-700 font-medium">❌ Errors: {uploadResult.errors.length}</p>
                                                <div className="max-h-40 overflow-y-auto mt-1">
                                                    {uploadResult.errors.map((error, idx) => (
                                                        <p key={idx} className="text-xs text-red-600">{error}</p>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {(uploadResult.log_file || uploadId) && (
                                            <div className="mt-3">
                                                <button onClick={handleDownloadLog} className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200">📄 Download Log</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                                <p className="text-sm text-yellow-800">
                                    <strong>Note:</strong> CSV must include headers. Required field: enrollment_no. 
                                    The Contact field (dg_contact) is now included in the template.
                                </p>
                            </div>
                        </div>
                        
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowBulkUploadModal(false);
                                    setUploadFile(null);
                                    setUploadResult(null);
                                    setUploadProgress(0);
                                }}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                            >
                                Close
                            </button>
                            <button
                                onClick={handleBulkUpload}
                                disabled={!uploadFile || uploadProgress > 0}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                📤 Upload
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Degree;
