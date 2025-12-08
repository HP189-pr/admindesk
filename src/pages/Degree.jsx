/**
 * Degree.jsx
 * Main degree management component with CRUD operations
 */
import React, { useState, useEffect } from 'react';
import PageTopbar from '../components/PageTopbar';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';
import {
    getDegrees,
    createDegree,
    updateDegree,
    deleteDegree,
    getAllConvocations,
    bulkUploadDegrees
} from '../services/degreeService';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Degree = ({ onToggleSidebar, onToggleChatbox }) => {
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
    
    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadResult, setUploadResult] = useState(null);
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
        fetchDegrees();
        fetchConvocations();
    }, [currentPage, pageSize, searchTerm, filterConvocation, filterExamYear]);

    const fetchDegrees = async () => {
        setLoading(true);
        try {
            const params = {
                page: currentPage,
                page_size: pageSize,
            };
            
            if (searchTerm) params.search = searchTerm;
            if (filterConvocation) params.convocation_no = filterConvocation;
            if (filterExamYear) params.last_exam_year = filterExamYear;
            
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
            setUploadProgress(10);
            const result = await bulkUploadDegrees(uploadFile);
            setUploadProgress(100);
            setUploadResult(result);
            
            toast.success(`Bulk upload completed! Created: ${result.created}, Updated: ${result.updated}`);
            
            if (result.errors && result.errors.length > 0) {
                toast.warning(`${result.errors.length} rows had errors. Check details below.`);
            }
            
            fetchDegrees();
        } catch (err) {
            toast.error('Bulk upload failed: ' + (err.response?.data?.error || err.message));
            setUploadProgress(0);
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

    const actions = ["➕", "🔍", "📄 Report"];

    const handleTopbarSelect = (action) => {
        setSelectedMenu(action);
        setPanelOpen(true);
    };

    return (
        <div className="p-4 space-y-4">
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
                rightSlot={
                    <a href="/" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-white ml-2">
                        🏠 Home
                    </a>
                }
            />

            {/* Collapsible Action Panel */}
            <div className="border rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
                    <div className="font-semibold">
                        {selectedMenu === '➕' ? 'ADD Panel' : selectedMenu === '🔍' ? 'SEARCH Panel' : 'REPORT Panel'}
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
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Search</label>
                                    <input
                                        type="text"
                                        placeholder="Search enrollment, name, etc..."
                                        value={searchTerm}
                                        onChange={(e) => {
                                            setSearchTerm(e.target.value);
                                            setCurrentPage(1);
                                        }}
                                        className="w-full px-3 py-2 border rounded-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Convocation</label>
                                    <select
                                        value={filterConvocation}
                                        onChange={(e) => {
                                            setFilterConvocation(e.target.value);
                                            setCurrentPage(1);
                                        }}
                                        className="w-full px-3 py-2 border rounded-lg"
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
                                    <label className="block text-sm font-medium mb-1">Exam Year</label>
                                    <input
                                        type="number"
                                        placeholder="e.g., 2024"
                                        value={filterExamYear}
                                        onChange={(e) => {
                                            setFilterExamYear(e.target.value);
                                            setCurrentPage(1);
                                        }}
                                        className="w-full px-3 py-2 border rounded-lg"
                                    />
                                </div>
                            </div>
                        )}
                        {selectedMenu === '📄 Report' && (
                            <div className="text-sm text-gray-600">Report view coming soon…</div>
                        )}
                    </div>
                )}
            </div>

            {/* Records Section */}
            {selectedMenu !== '➕' && (
                <div className="bg-white shadow rounded-2xl p-4 h-[calc(100vh-220px)] overflow-auto">
                    <h2 className="text-lg font-semibold mb-4">Degree Search</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse border">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th className="border p-2 text-left">DG SR No</th>
                                    <th className="border p-2 text-left">Enrollment</th>
                                    <th className="border p-2 text-left">Student Name</th>
                                    <th className="border p-2 text-left">Contact</th>
                                    <th className="border p-2 text-left">Degree</th>
                                    <th className="border p-2 text-left">Specialisation</th>
                                    <th className="border p-2 text-left">Year</th>
                                    <th className="border p-2 text-left">Class</th>
                                    <th className="border p-2 text-left">Conv</th>
                                    <th className="border p-2 text-left">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="10" className="border p-2 text-center">Loading...</td>
                                </tr>
                            ) : degrees.length === 0 ? (
                                <tr>
                                    <td colSpan="10" className="border p-2 text-center">No degree records found.</td>
                                </tr>
                            ) : (
                                degrees.map((degree) => (
                                    <tr key={degree.id}>
                                        <td className="border p-2">{degree.dg_sr_no || '-'}</td>
                                        <td className="border p-2">{degree.enrollment_no}</td>
                                        <td className="border p-2">{degree.student_name_dg || '-'}</td>
                                        <td className="border p-2">{degree.dg_contact || '-'}</td>
                                        <td className="border p-2">{degree.degree_name || '-'}</td>
                                        <td className="border p-2">{degree.specialisation || '-'}</td>
                                        <td className="border p-2">{degree.last_exam_year || '-'}</td>
                                        <td className="border p-2">{degree.class_obtain || '-'}</td>
                                        <td className="border p-2">{degree.convocation_no || '-'}</td>
                                        <td className="border p-2">
                                            <button
                                                onClick={() => handleEdit(degree)}
                                                className="px-2 py-1 bg-yellow-500 text-white rounded mr-2"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(degree.id)}
                                                className="px-2 py-1 bg-red-600 text-white rounded"
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
