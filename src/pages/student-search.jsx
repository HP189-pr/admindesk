import React, { useState } from "react";
import { searchStudent, formatDate, getStatusColor } from "../services/studentSearchService";
import { FaSearch, FaUser, FaUniversity, FaPhone, FaEnvelope, FaFileAlt, FaMoneyBillWave } from "react-icons/fa";

export default function StudentSearch() {
  const [enrollmentNo, setEnrollmentNo] = useState("");
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    
    if (!enrollmentNo.trim()) {
      setError("Please enter an enrollment number");
      return;
    }

    setLoading(true);
    setError("");
    setStudentData(null);
    setSearched(true);

    try {
      const data = await searchStudent(enrollmentNo);
      setStudentData(data);
    } catch (err) {
      setError(err.message || "Failed to fetch student data");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setEnrollmentNo("");
    setStudentData(null);
    setError("");
    setSearched(false);
  };

  const StatusBadge = ({ status }) => {
    if (!status) return <span className="text-gray-400">-</span>;
    const color = getStatusColor(status);
    return (
      <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full bg-${color}-100 text-${color}-800`}>
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  const InfoRow = ({ label, value }) => {
    if (!value || value === '-' || value === '' || value === 'null') return null;
    return (
      <div className="flex justify-between py-2 border-b border-gray-100">
        <span className="font-medium text-gray-600">{label}:</span>
        <span className="text-gray-900">{value}</span>
      </div>
    );
  };

  const DetailStat = ({ label, value, large = false }) => (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`${large ? 'text-2xl' : 'text-sm'} font-semibold text-gray-900`}>{value || '—'}</p>
    </div>
  );

  const renderExamPeriod = (entry) => {
    if (!entry) return '-';
    const parts = [];
    if (entry.exam_month) parts.push(entry.exam_month);
    if (entry.exam_year) parts.push(entry.exam_year);
    const label = parts.join(' ').trim();
    if (label) return label;
    if (entry.date && entry.date.includes('-')) {
      return formatDate(entry.date);
    }
    return entry.date || '-';
  };

  const formatTableDate = (value) => {
    if (!value) return '-';
    const str = String(value);
    return str.includes('-') ? formatDate(str) : str;
  };

  const formatISODate = (value) => {
    if (!value) return '';
    return formatDate(value);
  };

  const serviceTables = {
    verification: {
      title: 'Verification',
      columns: [
        { key: 'doc_rec_id', label: 'Doc Rec ID' },
        { key: 'date', label: 'Date', render: (val) => formatTableDate(val) },
        { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
        { key: 'final_no', label: 'Final No', className: 'font-semibold' },
        { key: 'tr_count', label: 'TR', align: 'center' },
        { key: 'ms_count', label: 'MS', align: 'center' },
        { key: 'dg_count', label: 'DG', align: 'center' },
        { key: 'vr_done_date', label: 'Done Date', render: (val) => formatTableDate(val) },
        { key: 'pay_rec_no', label: 'Pay Rec' },
      ],
    },
    provisional: {
      title: 'Provisional',
      columns: [
        { key: 'doc_rec_id', label: 'Doc Rec ID' },
        { key: 'date', label: 'Date', render: (val) => formatTableDate(val) },
        { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
        { key: 'final_no', label: 'Provisional No', className: 'font-semibold' },
        { key: 'remark', label: 'Remark' },
      ],
    },
    migration: {
      title: 'Migration',
      columns: [
        { key: 'doc_rec_id', label: 'Doc Rec ID' },
        { key: 'date', label: 'Date', render: (val) => formatTableDate(val) },
        { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
        { key: 'final_no', label: 'Migration No', className: 'font-semibold' },
        { key: 'remark', label: 'Remark' },
      ],
    },
    institutional_verification: {
      title: 'Institutional Verification',
      columns: [
        { key: 'doc_rec_id', label: 'Doc Rec ID' },
        { key: 'date', label: 'Date', render: (val) => formatTableDate(val) },
        { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
        { key: 'remark', label: 'Remark' },
      ],
    },
    degree: {
      title: 'Degree',
      columns: [
        { key: 'dg_sr_no', label: 'DG SR No', className: 'font-semibold text-gray-900' },
        { key: 'enrollment_no', label: 'Enrollment' },
        { key: 'student_name_dg', label: 'Student Name' },
        { key: 'degree_name', label: 'Degree' },
        { key: 'specialisation', label: 'Specialisation' },
        { key: 'passing_year', label: 'Passing Year', render: (val, row) => row.passing_year || renderExamPeriod(row) },
        { key: 'class_obtain', label: 'Class' },
        { key: 'convocation_no', label: 'Conv' },
        { key: 'convocation_period', label: 'Convocation Month-Year', render: (val, row) => row.convocation_period || '-' },
      ],
    },
  };

  const generalInfo = studentData?.general || {};

  const renderServiceSection = (serviceKey) => {
    const rows = studentData?.services?.[serviceKey] || [];
    const config = serviceTables[serviceKey];
    if (!config || rows.length === 0) return null;

    const renderCell = (column, row) => {
      const rawValue = column.key === 'exam_period' ? null : row[column.key];
      const value = column.render ? column.render(rawValue, row) : (rawValue ?? '-');
      const alignClass = column.align === 'center' ? 'text-center' : '';
      return (
        <td key={column.key} className={`px-4 py-3 text-sm ${alignClass} ${column.className || ''}`}>
          {value}
        </td>
      );
    };

    return (
      <div className="mb-8" key={serviceKey}>
        <h3 className="text-xl font-semibold text-gray-700 mb-4 pb-2 border-b-2 border-indigo-200">
          {config.title} ({rows.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200">
            <thead className="bg-indigo-50">
              <tr>
                {config.columns.map((col) => (
                  <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((row, idx) => (
                <tr key={row.id || `${serviceKey}-${idx}`} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                  {config.columns.map((col) => renderCell(col, row))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-indigo-600 p-3 rounded-lg">
                <FaSearch className="text-white text-2xl" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Student Search</h1>
                <p className="text-gray-600">Search comprehensive student information by enrollment number</p>
              </div>
            </div>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="mt-6">
            <div className="flex gap-4">
              <input
                type="text"
                value={enrollmentNo}
                onChange={(e) => setEnrollmentNo(e.target.value.toUpperCase())}
                placeholder="Enter Enrollment Number (e.g., 19PHARMD01021)"
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500 text-lg"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? "Searching..." : "Search"}
              </button>
              {searched && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-6 py-3 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </form>
        </div>

        {studentData && (
          <>
            {/* Section 1: Student & Institute Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <FaUser className="text-indigo-600 text-2xl" />
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800">Student Information</h2>
                    <p className="text-gray-500 text-sm">Enrollment & profile overview</p>
                  </div>
                </div>
                <div className="space-y-6">
                  <DetailStat label="Student Name" value={generalInfo.student_name} large />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <DetailStat label="Enrollment No" value={generalInfo.enrollment_no} />
                    <DetailStat label="Temp Enrollment" value={generalInfo.temp_enrollment_no} />
                    <DetailStat label="Batch" value={generalInfo.batch} />
                    <DetailStat label="Category" value={generalInfo.category} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <DetailStat label="Gender" value={generalInfo.gender} />
                    <DetailStat label="Admission Date" value={formatISODate(generalInfo.admission_date)} />
                    <DetailStat label="Enrollment Date" value={formatISODate(generalInfo.enrollment_date)} />
                    <DetailStat label="ABC ID" value={generalInfo.abc_id} />
                    <DetailStat label="Aadhaar No" value={generalInfo.aadhar_no} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-indigo-50">
                    <FaPhone className="text-indigo-600 text-xl" />
                    <div>
                      <p className="text-xs uppercase text-gray-500">Contact</p>
                      <p className="text-sm font-semibold text-gray-900">{generalInfo.contact_no || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-indigo-50">
                    <FaEnvelope className="text-indigo-600 text-xl" />
                    <div>
                      <p className="text-xs uppercase text-gray-500">Email</p>
                      <p className="text-sm font-semibold text-gray-900">{generalInfo.email || '—'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <FaUniversity className="text-indigo-600 text-2xl" />
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800">Institute Details</h2>
                    <p className="text-gray-500 text-sm">Affiliated institute snapshot</p>
                  </div>
                </div>
                <div className="space-y-6">
                  <DetailStat label="Institute Name" value={generalInfo.institute_name} large />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <DetailStat label="Institute Code" value={generalInfo.institute_code} />
                    <DetailStat label="Institute City" value={generalInfo.institute_city} />
                    <DetailStat label="Main Course" value={generalInfo.maincourse} />
                    <DetailStat label="Specialisation" value={generalInfo.subcourse} />
                  </div>
                  <DetailStat label="Institute Address" value={generalInfo.institute_address} />
                </div>
              </div>
            </div>

            {/* Section 2: Services */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <div className="flex items-center space-x-3 mb-6">
                <FaFileAlt className="text-indigo-600 text-2xl" />
                <h2 className="text-2xl font-bold text-gray-800">Services</h2>
              </div>
              {['verification', 'provisional', 'migration', 'institutional_verification', 'degree'].map((key) => (
                renderServiceSection(key)
              ))}
            </div>

            {/* Section 3: Fees */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center space-x-3 mb-6">
                <FaMoneyBillWave className="text-indigo-600 text-2xl" />
                <h2 className="text-2xl font-bold text-gray-800">Fees Information</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border-l-4 border-green-500">
                  <p className="text-sm text-gray-600 mb-2">Total Fees</p>
                  <p className="text-3xl font-bold text-green-700">
                    ₹{(studentData?.fees?.total_fees ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border-l-4 border-blue-500">
                  <p className="text-sm text-gray-600 mb-2">Hostel Required</p>
                  <p className="text-3xl font-bold text-blue-700">
                    {studentData?.fees?.hostel_required ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* No Results Message */}
        {searched && !loading && !studentData && !error && (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <FaSearch className="text-gray-300 text-6xl mx-auto mb-4" />
            <p className="text-xl text-gray-600">No student found with this enrollment number</p>
          </div>
        )}
      </div>
    </div>
  );
}
