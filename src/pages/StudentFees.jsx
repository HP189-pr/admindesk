/**
 * StudentFees.jsx
 * Entry-first layout (like Enrollment): Topbar + collapsible action panel + records section
 */
import React, { useEffect, useMemo, useState } from 'react';
import { FaChevronDown, FaChevronUp, FaEdit, FaTrash } from 'react-icons/fa';
import PageTopbar from '../components/PageTopbar';
import StudentFeesReport from '../report/StudentFeesReport';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
    getFeesByStudent,
    getStudentFees,
    getStudentFeesSummary,
    createFeeEntry,
    updateFeeEntry,
    deleteFeeEntry,
} from '../services/studentFeesService';

const TERM_OPTIONS = [
    'Term-1', 'Term-2', 'Term-3', 'Term-4', 'Term-5',
    'Term-6', 'Term-7', 'Term-8', 'Term-9', 'Term-10',
    'Extension-1', 'Extension-2', 'Extension-3', 'Extension-4', 'Extension-5',
    'Thesis', 'Exam', 'Enrollment', 'Registration',
];

const BATCH_OPTIONS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

const todayISO = () => new Date().toISOString().split('T')[0];
const normalizeIsoDate = (value) => {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
        const [day, month, year] = value.split('-');
        return `${year}-${month}-${day}`;
    }
    return value;
};

const StudentFees = ({ onToggleSidebar, onToggleChatbox, rights = { can_view: true, can_create: true, can_edit: true, can_delete: true } }) => {
    // Action panel state
    const actions = useMemo(() => ['➕', '🔍', '📄 Report'], []);
    const [selectedAction, setSelectedAction] = useState('➕');
    const [panelOpen, setPanelOpen] = useState(true);
    const [showReport, setShowReport] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        student_no: '',
        student_name: '',
        enrollment_no: '',
        temp_enroll_no: '',
        receipt_date: todayISO(),
        receipt_no: '',
        term: '',
        amount: '',
        remark: '',
    });

    // Records state
    const [searchStudentNo, setSearchStudentNo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(50);
    const [fees, setFees] = useState([]);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [summary, setSummary] = useState(null);
    const [editingFeeId, setEditingFeeId] = useState(null);
    const [batchFilter, setBatchFilter] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    // Fetch student summary (used for auto-populating name + numbers)
    const fetchStudentMeta = async (studentNo) => {
        if (!studentNo) return null;
        try {
            const data = await getStudentFeesSummary(studentNo);
            setFormData((prev) => ({
                ...prev,
                student_name: data.student_name || '',
                enrollment_no: data.enrollment_no || '',
                temp_enroll_no: data.temp_enroll_no || '',
            }));
            return data;
        } catch (err) {
            setFormData((prev) => ({ ...prev, student_name: '', enrollment_no: '', temp_enroll_no: '' }));
            return null;
        }
    };

    // Load fees + summary for records/report
    const loadFees = async (studentNo, page = 1, filtersOverride) => {
        setLoading(true);
        try {
            const filters = filtersOverride || { batch: batchFilter, fromDate, toDate };
            const params = { page, page_size: pageSize };
            if (filters.batch) params.batch = filters.batch;
            if (filters.fromDate) params.start_date = filters.fromDate;
            if (filters.toDate) params.end_date = filters.toDate;

            const data = studentNo
                ? await getFeesByStudent(studentNo, params)
                : await getStudentFees(params);

            setFees(data.results || []);
            setTotalPages(data.num_pages || 1);
            setTotalCount(data.count || 0);

            // Refresh summary (enrollment based)
            if (studentNo) {
                const sum = await getStudentFeesSummary(studentNo);
                setSummary(sum);
                // Keep form name in sync when browsing
                setFormData((prev) => ({
                    ...prev,
                    student_name: sum?.student_name || prev.student_name,
                    enrollment_no: sum?.enrollment_no || prev.enrollment_no,
                    temp_enroll_no: sum?.temp_enroll_no || prev.temp_enroll_no,
                }));
            } else {
                setSummary(null);
            }
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Could not fetch records';
            toast.error(msg);
            setFees([]);
            setSummary(null);
        } finally {
            setLoading(false);
        }
    };

    // Handlers
    const handleTopbarSelect = (action) => {
        if (action === '📄 Report') {
            setShowReport(true);
            setSelectedAction(action);
            setPanelOpen(false);
            return;
        }
        setShowReport(false);
        if (selectedAction === action) {
            setPanelOpen((o) => !o);
        } else {
            setSelectedAction(action);
            setPanelOpen(true);
        }
    };

    const handleFormChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleStudentBlur = async () => {
        if (!formData.student_no.trim()) return;
        const studentNo = formData.student_no.trim();
        const meta = await fetchStudentMeta(studentNo);
        if (!meta) {
            toast.error('Student not found');
            return;
        }
        setSearchStudentNo(studentNo);
        setCurrentPage(1);
        loadFees(studentNo, 1);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!rights.can_create) {
            toast.error('You do not have permission to create entries');
            return;
        }
        if (!formData.student_no.trim()) return toast.error('Enrollment/Temp number is required');
        if (!formData.receipt_no.trim()) return toast.error('Receipt No is required');
        if (!formData.receipt_date) return toast.error('Date is required');
        if (!formData.term.trim()) return toast.error('Term is required');
        if (!formData.amount || Number(formData.amount) <= 0) return toast.error('Amount must be greater than zero');

        try {
            const payload = {
                student_no: formData.student_no.trim(),
                receipt_no: formData.receipt_no.trim(),
                receipt_date: formData.receipt_date,
                term: formData.term.trim(),
                amount: Number(formData.amount),
                remark: formData.remark?.trim() || '',
            };
            await createFeeEntry(payload);
            toast.success('Fee entry saved');
            setSearchStudentNo('');
            setSelectedAction('🔍');
            setPanelOpen(true);
            setCurrentPage(1);
            loadFees('', 1);
        } catch (err) {
            const msg = err.response?.data?.receipt_no?.[0]
                || err.response?.data?.student_no?.[0]
                || err.response?.data?.error
                || 'Failed to save fee entry';
            toast.error(msg);
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        if (!rights.can_edit) {
            toast.error('You do not have permission to edit entries');
            return;
        }
        if (!editingFeeId) return;
        if (!formData.student_no.trim()) return toast.error('Enrollment/Temp number is required');
        if (!formData.receipt_no.trim()) return toast.error('Receipt No is required');
        if (!formData.receipt_date) return toast.error('Date is required');
        if (!formData.term.trim()) return toast.error('Term is required');
        if (!formData.amount || Number(formData.amount) <= 0) return toast.error('Amount must be greater than zero');

        try {
            const payload = {
                student_no: formData.student_no.trim(),
                receipt_no: formData.receipt_no.trim(),
                receipt_date: formData.receipt_date,
                term: formData.term.trim(),
                amount: Number(formData.amount),
                remark: formData.remark?.trim() || '',
            };
            await updateFeeEntry(editingFeeId, payload);
            toast.success('Fee entry updated');
            setEditingFeeId(null);
            setFormData((prev) => ({
                ...prev,
                receipt_no: '',
                receipt_date: todayISO(),
                term: '',
                amount: '',
                remark: '',
            }));
            loadFees(searchStudentNo.trim(), currentPage);
        } catch (err) {
            const msg = err.response?.data?.receipt_no?.[0]
                || err.response?.data?.student_no?.[0]
                || err.response?.data?.error
                || 'Failed to update fee entry';
            toast.error(msg);
        }
    };

    const startEditFee = (fee) => {
        setEditingFeeId(fee.id);
        setFormData({
            student_no: fee.enrollment_no || fee.temp_enroll_no || '',
            student_name: fee.student_name || '',
            enrollment_no: fee.enrollment_no || '',
            temp_enroll_no: fee.temp_enroll_no || '',
            receipt_date: normalizeIsoDate(fee.receipt_date) || todayISO(),
            receipt_no: fee.receipt_no || '',
            term: fee.term || '',
            amount: fee.amount || '',
            remark: fee.remark || '',
        });
        setSelectedAction('➕');
        setPanelOpen(true);
    };

    const handleSearch = async (e) => {
        e?.preventDefault?.();
        if (!searchStudentNo.trim()) return toast.error('Enter enrollment or temp number');
        setCurrentPage(1);
        loadFees(searchStudentNo.trim(), 1);
        await fetchStudentMeta(searchStudentNo.trim());
    };

    const handleApplyFilters = () => {
        setCurrentPage(1);
        loadFees(searchStudentNo.trim(), 1);
    };

    const handleResetFilters = () => {
        setBatchFilter('');
        setFromDate('');
        setToDate('');
        setCurrentPage(1);
        loadFees(searchStudentNo.trim(), 1, { batch: '', fromDate: '', toDate: '' });
    };

    const handleDelete = async (id, receiptNo) => {
        if (!rights.can_delete) return toast.error('You do not have permission to delete entries');
        if (!window.confirm(`Delete receipt ${receiptNo}?`)) return;
        try {
            await deleteFeeEntry(id);
            toast.success('Entry deleted');
            loadFees(searchStudentNo, currentPage);
        } catch (err) {
            toast.error('Failed to delete');
        }
    };

    const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', minimumFractionDigits: 2,
    }).format(Number(amount || 0));

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const normalized = normalizeIsoDate(dateString);
        const date = new Date(normalized);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    // Initial focus on entry panel
    useEffect(() => {
        setSelectedAction('➕');
        setPanelOpen(true);
    }, []);

    useEffect(() => {
        loadFees('', 1);
    }, []);

    if (showReport) {
        return (
            <StudentFeesReport
                onBack={() => {
                    setShowReport(false);
                    setSelectedAction('🔍');
                    setPanelOpen(true);
                }}
            />
        );
    }

    // Render helpers
    const renderEntryForm = () => (
        <form onSubmit={editingFeeId ? handleUpdate : handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Date *</label>
                    <input
                        type="date"
                        value={formData.receipt_date}
                        onChange={(e) => handleFormChange('receipt_date', e.target.value)}
                        className="w-full border rounded px-3 py-2"
                        required
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Enrollment / Temp No *</label>
                    <input
                        type="text"
                        value={formData.student_no}
                        onChange={(e) => handleFormChange('student_no', e.target.value)}
                        onBlur={handleStudentBlur}
                        placeholder="Enter enrollment or temp number"
                        className="w-full border rounded px-3 py-2"
                        required
                    />
                </div>
                <div className="md:col-span-8">
                    <label className="block text-sm font-medium mb-1">Name (auto)</label>
                    <input
                        type="text"
                        value={formData.student_name}
                        readOnly
                        className="w-full border rounded px-3 py-2 bg-gray-100"
                        placeholder="Auto fetched after student no"
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Receipt No</label>
                    <input
                        type="text"
                        value={formData.receipt_no}
                        onChange={(e) => handleFormChange('receipt_no', e.target.value)}
                        className="w-full border rounded px-3 py-2"
                        required
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Term *</label>
                    <select
                        value={formData.term}
                        onChange={(e) => handleFormChange('term', e.target.value)}
                        className="w-full border rounded px-3 py-2 bg-white"
                        required
                    >
                        <option value="" disabled>Select term</option>
                        {TERM_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Amount *</label>
                    <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => handleFormChange('amount', e.target.value)}
                        className="w-full border rounded px-3 py-2"
                        required
                    />
                </div>
            
            <div className="md:col-span-4">
                <label className="block text-sm font-medium mb-1">Remark</label>
                <input
                        type="text"
                    value={formData.remark}
                    onChange={(e) => handleFormChange('remark', e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Optional notes"
                />
            </div>
            
            <div className="md:col-span-2 flex justify-center ">
                <button
                    type="submit"
                    disabled={editingFeeId ? !rights.can_edit : !rights.can_create}
                    className="h-[42px] px-3 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400"
                >
                    {editingFeeId ? 'Update Entry' : 'Save Entry'}
                </button>
            </div>
            </div>
        </form>
    );

    const renderSearchPanel = () => (
        <form onSubmit={handleSearch} className="space-y-3">
            <label className="block text-sm font-medium">Enrollment / Temp No *</label>
            <div className="flex gap-3 flex-col md:flex-row">
                <input
                    type="text"
                    value={searchStudentNo}
                    onChange={(e) => setSearchStudentNo(e.target.value)}
                    className="flex-1 border rounded px-3 py-2"
                    placeholder="Enter enrollment or temp number"
                />
                <button
                    type="submit"
                    className="px-5 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                >
                    Search
                </button>
            </div>
        </form>
    );

    const renderReportPanel = () => (
        <div className="space-y-3 text-sm text-gray-700">
            <div className="font-semibold">Enrollment-based report</div>
            <p>Enter an enrollment/temp number and use the Records tab below. Summary and totals will appear automatically.</p>
        </div>
    );

    const renderSummary = () => (
        summary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg bg-white shadow-sm">
                    <div className="text-sm text-gray-500">Student</div>
                    <div className="font-semibold text-gray-800">{summary.student_name || '-'}</div>
                    <div className="text-xs text-gray-600">Enroll: {summary.enrollment_no || '—'} | Temp: {summary.temp_enroll_no || '—'}</div>
                </div>
                <div className="p-4 border rounded-lg bg-white shadow-sm">
                    <div className="text-sm text-gray-500">Total Paid</div>
                    <div className="text-xl font-bold text-green-600">{formatCurrency(summary.total_fees_paid)}</div>
                    <div className="text-xs text-gray-600">Entries: {summary.total_entries}</div>
                </div>
                <div className="p-4 border rounded-lg bg-white shadow-sm">
                    <div className="text-sm text-gray-500">Date Range</div>
                    <div className="text-sm text-gray-800">{summary.first_payment_date ? formatDate(summary.first_payment_date) : '—'} → {summary.last_payment_date ? formatDate(summary.last_payment_date) : '—'}</div>
                </div>
            </div>
        )
    );

    const renderTable = () => (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b overflow-x-auto">
                <div className="flex items-center justify-between gap-4 flex-nowrap min-w-max">
                    <div className="font-semibold text-gray-800 whitespace-nowrap">Fee Records {totalCount ? `(${totalCount})` : ''}</div>
                    <div className="flex items-center justify-center gap-3 text-sm flex-nowrap">
                        <select
                            value={batchFilter}
                            onChange={(e) => setBatchFilter(e.target.value)}
                            className="border rounded px-2 py-1 bg-white"
                        >
                            <option value="">All</option>
                            {BATCH_OPTIONS.map((batch) => (
                                <option key={batch} value={batch}>{batch}</option>
                            ))}
                        </select>
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="border rounded px-2 py-1"
                        />
                        <span className="text-gray-500">to</span>
                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="border rounded px-2 py-1"
                        />
                        <button
                            type="button"
                            onClick={handleApplyFilters}
                            className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                        >
                            Apply
                        </button>
                        <button
                            type="button"
                            onClick={handleResetFilters}
                            className="px-3 py-1 rounded border"
                        >
                            Reset
                        </button>
                    </div>
                    <div className="flex items-center justify-end gap-2 text-sm flex-nowrap">
                        {totalPages > 1 && (
                            <>
                                <button
                                    onClick={() => {
                                        if (currentPage > 1) {
                                            const next = currentPage - 1;
                                            setCurrentPage(next);
                                            loadFees(searchStudentNo, next);
                                        }
                                    }}
                                    className="px-3 py-1 border rounded disabled:opacity-50"
                                    disabled={currentPage === 1}
                                >Prev</button>
                                <span>Page {currentPage} / {totalPages}</span>
                                <button
                                    onClick={() => {
                                        if (currentPage < totalPages) {
                                            const next = currentPage + 1;
                                            setCurrentPage(next);
                                            loadFees(searchStudentNo, next);
                                        }
                                    }}
                                    className="px-3 py-1 border rounded disabled:opacity-50"
                                    disabled={currentPage === totalPages}
                                >Next</button>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-100 text-left text-xs uppercase text-gray-600">
                        <tr>
                            <th className="px-3 py-3 w-28">Date</th>
                            <th className="px-4 py-3">Enrollment / Temp No</th>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Rec No</th>
                            <th className="px-3 py-3 w-28">Term</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3">Remark</th>
                            <th className="px-4 py-3 text-center w-28">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {fees.map((fee) => (
                            <tr
                                key={fee.id}
                                className="hover:bg-gray-50 cursor-pointer"
                                onClick={() => startEditFee(fee)}
                            >
                                <td className="px-3 py-1.5 text-sm w-28">{formatDate(fee.receipt_date)}</td>
                                <td className="px-4 py-1.5 text-sm">{fee.enrollment_no || fee.temp_enroll_no || '—'}</td>
                                <td className="px-4 py-1.5 text-sm">{fee.student_name || '—'}</td>
                                <td className="px-4 py-1.5 text-sm font-semibold text-gray-800">{fee.receipt_no}</td>
                                <td className="px-3 py-1.5 text-sm w-28">{fee.term}</td>
                                <td className="px-4 py-1.5 text-sm text-right font-semibold text-green-600">{formatCurrency(fee.amount)}</td>
                                <td className="px-4 py-1.5 text-sm text-gray-600">{fee.remark || '—'}</td>
                                <td className="px-4 py-1.5 text-sm text-center w-28">
                                    <div className="inline-flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                startEditFee(fee);
                                            }}
                                            className="w-7 h-7 inline-flex items-center justify-center rounded bg-yellow-400 text-white hover:bg-yellow-500"
                                            title="Edit"
                                        >
                                            <FaEdit size={12} />
                                        </button>
                                        {rights.can_delete ? (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(fee.id, fee.receipt_no);
                                                }}
                                                className="w-7 h-7 inline-flex items-center justify-center rounded bg-red-600 text-white hover:bg-red-700"
                                                title="Delete"
                                            >
                                                <FaTrash size={12} />
                                            </button>
                                        ) : (
                                            <span className="text-gray-400">—</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {!loading && fees.length === 0 && (
                            <tr>
                                <td className="px-4 py-6 text-center text-sm text-gray-500" colSpan={7}>
                                    No records found for the current filters.
                                </td>
                            </tr>
                        )}
                        {loading && (
                            <tr>
                                <td className="px-4 py-6 text-center text-sm text-gray-500" colSpan={7}>
                                    Loading...
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="p-4 md:p-6 space-y-4 h-full bg-slate-100">
            <PageTopbar
                title="Student Fees"
                actions={actions}
                selected={selectedAction}
                onSelect={handleTopbarSelect}
                actionsOnLeft
                leftSlot={
                    <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-emerald-600 text-white text-xl">
                        💵
                    </div>
                }
            />

            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
                    <div className="font-semibold">
                        {selectedAction === '➕' && 'Entry Panel'}
                        {selectedAction === '🔍' && 'Search Panel'}
                        {selectedAction === '📄 Report' && 'Report Panel'}
                    </div>
                    <button
                        onClick={() => setPanelOpen((o) => !o)}
                        className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
                    >
                        {panelOpen ? <FaChevronUp /> : <FaChevronDown />} {panelOpen ? 'Collapse' : 'Expand'}
                    </button>
                </div>
                {panelOpen && (
                    <div className="p-4">
                        {selectedAction === '➕' && renderEntryForm()}
                        {selectedAction === '🔍' && renderSearchPanel()}
                        {selectedAction === '📄 Report' && renderReportPanel()}
                    </div>
                )}
            </div>

            {/* Summary & Records */}
            <div className="space-y-4">
                {renderSummary()}
                {renderTable()}
            </div>
        </div>
    );
};

export default StudentFees;
