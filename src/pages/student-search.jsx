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
    // Don't render if value is null, undefined, empty string, or just "-"
    if (!value || value === "-" || value === "" || value === "null") return null;
    
    return (
      <div className="flex justify-between py-2 border-b border-gray-100">
        <span className="font-medium text-gray-600">{label}:</span>
        <span className="text-gray-900">{value}</span>
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

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
              <p className="font-semibold">Error</p>
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* Student Data Display */}
        {studentData && (
          <div className="space-y-6">
            {/* Section 1: General Information */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center space-x-3 mb-6">
                <FaUser className="text-indigo-600 text-2xl" />
                <h2 className="text-2xl font-bold text-gray-800">General Information</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-indigo-600 mb-3">Student Details</h3>
                  <InfoRow label="Name" value={studentData.general.student_name} />
                  <InfoRow label="Enrollment No" value={studentData.general.enrollment_no} />
                  <InfoRow label="Temp Enrollment" value={studentData.general.temp_enrollment_no} />
                  <InfoRow label="Gender" value={studentData.general.gender} />
                  <InfoRow label="Birth Date" value={formatDate(studentData.general.birth_date)} />
                  <InfoRow label="Category" value={studentData.general.category} />
                  <InfoRow label="Aadhar No" value={studentData.general.aadhar_no} />
                  <InfoRow label="ABC ID" value={studentData.general.abc_id} />
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-indigo-600 mb-3 flex items-center gap-2">
                    <FaUniversity /> Institute Details
                  </h3>
                  <InfoRow label="Institute Name" value={studentData.general.institute_name} />
                  <InfoRow label="Institute Code" value={studentData.general.institute_code} />
                  <InfoRow label="Address" value={studentData.general.institute_address} />
                  <InfoRow label="City" value={studentData.general.institute_city} />
                  <InfoRow label="Main Course" value={studentData.general.maincourse} />
                  <InfoRow label="Sub Course" value={studentData.general.subcourse} />
                  <InfoRow label="Batch" value={studentData.general.batch} />
                  <InfoRow label="Admission Date" value={formatDate(studentData.general.admission_date)} />
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-indigo-600 mb-3 flex items-center gap-2">
                    <FaPhone /> Contact Information
                  </h3>
                  <InfoRow label="Contact No" value={studentData.general.contact_no} />
                  <InfoRow label="Email" value={studentData.general.email} />
                  <InfoRow label="Address 1" value={studentData.general.address1} />
                  <InfoRow label="City 1" value={studentData.general.city1} />
                  <InfoRow label="Address 2" value={studentData.general.address2} />
                  <InfoRow label="City 2" value={studentData.general.city2} />
                  <InfoRow label="Mother Name" value={studentData.general.mother_name} />
                  <InfoRow label="Father Name" value={studentData.general.father_name} />
                </div>
              </div>
            </div>

            {/* Section 2: Services */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center space-x-3 mb-6">
                <FaFileAlt className="text-indigo-600 text-2xl" />
                <h2 className="text-2xl font-bold text-gray-800">Services</h2>
              </div>

              {/* Verification - Only show if data exists */}
              {studentData.services.verification.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-gray-700 mb-4 pb-2 border-b-2 border-indigo-200">
                    Verification ({studentData.services.verification.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200">
                      <thead className="bg-indigo-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Doc Rec ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Final No</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">TR</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">MS</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">DG</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Done Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Pay Rec</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {studentData.services.verification.map((vr, idx) => (
                          <tr key={vr.id} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                            <td className="px-4 py-3 text-sm">{vr.doc_rec_id}</td>
                            <td className="px-4 py-3 text-sm">{formatDate(vr.date)}</td>
                            <td className="px-4 py-3"><StatusBadge status={vr.status} /></td>
                            <td className="px-4 py-3 text-sm font-semibold">{vr.final_no || '-'}</td>
                            <td className="px-4 py-3 text-sm text-center">{vr.tr_count}</td>
                            <td className="px-4 py-3 text-sm text-center">{vr.ms_count}</td>
                            <td className="px-4 py-3 text-sm text-center">{vr.dg_count}</td>
                            <td className="px-4 py-3 text-sm">{formatDate(vr.vr_done_date)}</td>
                            <td className="px-4 py-3 text-sm">{vr.pay_rec_no || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Provisional - Only show if data exists */}
              {studentData.services.provisional.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-gray-700 mb-4 pb-2 border-b-2 border-indigo-200">
                    Provisional ({studentData.services.provisional.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200">
                      <thead className="bg-indigo-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Doc Rec ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Final No</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Remark</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {studentData.services.provisional.map((pr, idx) => (
                          <tr key={pr.id} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                            <td className="px-4 py-3 text-sm">{pr.doc_rec_id}</td>
                            <td className="px-4 py-3 text-sm">{formatDate(pr.date)}</td>
                            <td className="px-4 py-3"><StatusBadge status={pr.status} /></td>
                            <td className="px-4 py-3 text-sm font-semibold">{pr.final_no || '-'}</td>
                            <td className="px-4 py-3 text-sm">{pr.remark || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Migration - Only show if data exists */}
              {studentData.services.migration.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-gray-700 mb-4 pb-2 border-b-2 border-indigo-200">
                    Migration ({studentData.services.migration.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200">
                      <thead className="bg-indigo-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Doc Rec ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Final No</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Remark</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {studentData.services.migration.map((mg, idx) => (
                          <tr key={mg.id} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                            <td className="px-4 py-3 text-sm">{mg.doc_rec_id}</td>
                            <td className="px-4 py-3 text-sm">{formatDate(mg.date)}</td>
                            <td className="px-4 py-3"><StatusBadge status={mg.status} /></td>
                            <td className="px-4 py-3 text-sm font-semibold">{mg.final_no || '-'}</td>
                            <td className="px-4 py-3 text-sm">{mg.remark || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Institutional Verification - Only show if data exists */}
              {studentData.services.institutional_verification.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-gray-700 mb-4 pb-2 border-b-2 border-indigo-200">
                    Institutional Verification ({studentData.services.institutional_verification.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200">
                      <thead className="bg-indigo-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Doc Rec ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Remark</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {studentData.services.institutional_verification.map((iv, idx) => (
                          <tr key={iv.id} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                            <td className="px-4 py-3 text-sm">{iv.doc_rec_id}</td>
                            <td className="px-4 py-3 text-sm">{formatDate(iv.date)}</td>
                            <td className="px-4 py-3"><StatusBadge status={iv.status} /></td>
                            <td className="px-4 py-3 text-sm">{iv.remark || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Degree - Only show if data exists */}
              {studentData.services.degree.length > 0 && (
                <div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-4 pb-2 border-b-2 border-indigo-200">
                    Degree ({studentData.services.degree.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200">
                      <thead className="bg-indigo-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Doc Rec ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Final No</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Degree Count</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Remark</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {studentData.services.degree.map((dg, idx) => (
                          <tr key={dg.id} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                            <td className="px-4 py-3 text-sm">{dg.doc_rec_id}</td>
                            <td className="px-4 py-3 text-sm">{formatDate(dg.date)}</td>
                            <td className="px-4 py-3"><StatusBadge status={dg.status} /></td>
                            <td className="px-4 py-3 text-sm font-semibold">{dg.final_no || '-'}</td>
                            <td className="px-4 py-3 text-sm text-center font-bold text-indigo-600">{dg.degree_count}</td>
                            <td className="px-4 py-3 text-sm">{dg.remark || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
                    ₹{studentData.fees.total_fees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border-l-4 border-blue-500">
                  <p className="text-sm text-gray-600 mb-2">Hostel Required</p>
                  <p className="text-3xl font-bold text-blue-700">
                    {studentData.fees.hostel_required ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
            </div>
          </div>
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
