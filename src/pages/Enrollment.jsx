import React, { useState, useEffect } from "react";
import { getEnrollments, saveEnrollment, deleteEnrollment, uploadExcel, processSheet } from "../services/enrollmentservice";

const Enrollment = ({ selectedTopbarMenu }) => {
  const [enrollments, setEnrollments] = useState([]);
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [columnMapping, setColumnMapping] = useState({});
  const [columns, setColumns] = useState([]);

  useEffect(() => {
    if (selectedTopbarMenu === "🔍") {
      fetchEnrollments();
    }
  }, [selectedTopbarMenu]);

  // 🔹 Fetch Enrollment Data
  const fetchEnrollments = async () => {
    const data = await getEnrollments("");
    setEnrollments(data);
  };

  // 🔹 Handle File Upload
  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    setFile(uploadedFile);
    const data = await uploadExcel(uploadedFile);
    setSheets(data.sheets);
  };

  // 🔹 Select Sheet
  const handleSheetSelect = async (e) => {
    setSelectedSheet(e.target.value);
    const firstSheetData = await processSheet(file, e.target.value, {});
    setColumns(Object.keys(firstSheetData[0]));
  };

  // 🔹 Handle Column Mapping
  const handleColumnMapping = (e, excelColumn) => {
    setColumnMapping({ ...columnMapping, [excelColumn]: e.target.value });
  };

  // 🔹 Process Sheet
  const handleProcessSheet = async () => {
    await processSheet(file, selectedSheet, columnMapping);
    alert("Data Uploaded Successfully!");
  };

  // 🔹 Handle Add/Edit Enrollment
  const handleSave = async (enrollment) => {
    await saveEnrollment(enrollment);
    fetchEnrollments();
  };

  // 🔹 Handle Delete
  const handleDelete = async (id) => {
    await deleteEnrollment(id);
    fetchEnrollments();
  };

  // 🔹 Render Content Based on Menu Selection
  const renderContent = () => {
    switch (selectedTopbarMenu) {
      case "➕": // Add Enrollment
        return (
          <div>
            <h2>Add/Edit Enrollment</h2>
            <button onClick={() => handleSave({ enrollment_no: "12345", student_name: "John Doe" })}>
              Save Enrollment
            </button>
          </div>
        );

      case "✏️": // Edit Enrollment
        return (
          <div>
            <h2>Edit Enrollment</h2>
            <button onClick={() => handleSave({ id: 1, enrollment_no: "67890", student_name: "Jane Doe" })}>
              Update Enrollment
            </button>
          </div>
        );

      case "🔍": // Search Enrollment
        return (
          <div>
            <h2>Enrollment List</h2>
            <table border="1">
              <thead>
                <tr>
                  <th>Enrollment No</th>
                  <th>Student Name</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enroll) => (
                  <tr key={enroll.id}>
                    <td>{enroll.enrollment_no}</td>
                    <td>{enroll.student_name}</td>
                    <td>
                      <button onClick={() => handleDelete(enroll.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case "📊 Excel Upload": // Excel Upload
        return (
          <div>
            <h2>Upload Excel File</h2>
            <input type="file" accept=".xlsx" onChange={handleFileUpload} />
            {sheets.length > 0 && (
              <div>
                <label>Select Sheet:</label>
                <select onChange={handleSheetSelect}>
                  {sheets.map((sheet) => (
                    <option key={sheet} value={sheet}>
                      {sheet}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {columns.length > 0 && (
              <div>
                <h3>Map Excel Columns to Database Fields</h3>
                {columns.map((col) => (
                  <div key={col}>
                    <label>{col} → </label>
                    <select onChange={(e) => handleColumnMapping(e, col)}>
                      <option value="">Select Field</option>
                      {["enrollment_no", "student_name", "batch"].map((dbCol) => (
                        <option key={dbCol} value={dbCol}>
                          {dbCol}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <button onClick={handleProcessSheet}>Upload Data</button>
              </div>
            )}
          </div>
        );

      default:
        return <h2 className="text-xl font-semibold">Please select an option.</h2>;
    }
  };

  return (
    <div className="flex h-full p-3 bg-gray-100">
      <div className="bg-white shadow rounded p-6 w-full">{renderContent()}</div>
    </div>
  );
};

export default Enrollment;
