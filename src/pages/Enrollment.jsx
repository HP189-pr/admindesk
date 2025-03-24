import React, { useState, useEffect } from "react";
import { 
  getEnrollments, 
  saveEnrollment, 
  deleteEnrollment, 
  uploadExcel, 
  processSheet 
} from "../services/enrollmentservice";
import { useAuth } from "../hooks/AuthContext";



const Enrollment = ({ selectedTopbarMenu }) => {
  const [enrollments, setEnrollments] = useState([]);
  const [filteredEnrollments, setFilteredEnrollments] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [columnMapping, setColumnMapping] = useState({});
  const [columns, setColumns] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const { auth } = useAuth();

  // 🔹 Fetch enrollments when search menu is selected
  useEffect(() => {
    if (selectedTopbarMenu === "🔍") {
      fetchEnrollments();
    }
  }, [selectedTopbarMenu]);

  // 🔹 Fetch Enrollment Data
  const fetchEnrollments = async () => {
    try {
      const data = await getEnrollments("");
      setEnrollments(data);
      setFilteredEnrollments(data); // Initialize filtered list
    } catch (error) {
      console.error("Error fetching enrollments:", error);
    }
  };

  // 🔹 Handle Search Input Change
  useEffect(() => {
    if (searchTerm.length >= 3) {
      const filtered = enrollments.filter(enroll =>
        enroll.enrollment_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
        enroll.student_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredEnrollments(filtered);
    } else {
      setFilteredEnrollments(enrollments);
    }
  }, [searchTerm, enrollments]);

  // 🔹 Handle File Upload & Extract Sheets
  const handleFileUpload = (event) => {
    const uploadedFile = event.target.files[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setSheets([]);
      setColumns([]);
      setSelectedColumns([]);
    }
  };

  // Fetch Sheet Names from Excel
  const handleFetchSheets = async () => {
    if (!file) {
      alert("Please select a file first.");
      return;
    }
    try {
      const data = await uploadExcel(file); // Remove extra token param
      setSheets(data.sheets); // Store sheet names
    } catch (error) {
      console.error("Error fetching sheets:", error);
    }
  };

  // Fetch Columns from Selected Sheet
  // Fetch Columns from Selected Sheet
const handleSheetSelect = async (selectedSheet) => {
  console.log("📄 Selected Sheet:", selectedSheet);
  setSelectedSheet(selectedSheet); // Update selected sheet

  if (!file) {
    alert("Please upload a file first.");
    return;
  }

  try {
    const response = await processSheet(file, selectedSheet); // Fetch columns
    if (response && response.columns) {
      setColumns(response.columns); // Update column names
      setColumnMapping({});
      setSelectedColumns([]);
    } else {
      console.error("❌ No columns received from API.");
    }
  } catch (error) {
    console.error("❌ Error fetching columns:", error.message);
  }
};

  

  // Handle Column Selection
  const handleColumnSelection = (column) => {
    setSelectedColumns((prev) => {
      const updatedColumns = prev.includes(column)
        ? prev.filter(col => col !== column)
        : [...prev, column];
  
      // Update column mapping dynamically
      setColumnMapping((prevMapping) => ({
        ...prevMapping,
        [column]: column, // Assuming a direct mapping
      }));
  
      return updatedColumns;
    });
  };

  // Upload Data to Database
  const handleUpload = async () => {
    if (!selectedSheet || selectedColumns.length === 0) {
      alert("Please select a worksheet and at least one column.");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sheet_name", selectedSheet);
      formData.append("column_mapping", JSON.stringify(selectedColumns));
  
      const response = await processSheet(formData);
      if (response.success) {
        alert("Data uploaded successfully!");
      } else {
        alert(`Upload failed: ${response.message}`);
      }
    } catch (error) {
      console.error("Error uploading data:", error);
      alert("Failed to upload data. Please check your file and try again.");
    }
  };
  // 🔹 Handle Save (Add/Edit)
  const handleSave = async (enrollment) => {
    try {
      await saveEnrollment(enrollment);
      fetchEnrollments();
    } catch (error) {
      console.error("Error saving enrollment:", error);
    }
  };

  // 🔹 Handle Delete
  const handleDelete = async (id) => {
    try {
      await deleteEnrollment(id);
      fetchEnrollments();
    } catch (error) {
      console.error("Error deleting enrollment:", error);
    }
  };

  // 🔹 Render Content Based on Menu Selection
  const renderContent = () => {
    switch (selectedTopbarMenu) {
      case "➕": // Add Enrollment
        return (
          <div>
            <h2 className="text-lg font-semibold">Add/Edit Enrollment</h2>
            <button 
              className="px-4 py-2 bg-blue-500 text-white rounded" 
              onClick={() => handleSave({ enrollment_no: "12345", student_name: "John Doe" })}
            >
              Save Enrollment
            </button>
          </div>
        );

      case "✏️": // Edit Enrollment
        return (
          <div>
            <h2 className="text-lg font-semibold">Edit Enrollment</h2>
            <button 
              className="px-4 py-2 bg-green-500 text-white rounded" 
              onClick={() => handleSave({ id: 1, enrollment_no: "67890", student_name: "Jane Doe" })}
            >
              Update Enrollment
            </button>
          </div>
        );

      case "🔍": // Search Enrollment
        return (
          <div>
            <h2 className="text-lg font-semibold">Enrollment List</h2>
            
            {/* 🔎 Search Box */}
            <input 
                type="text" 
                placeholder="🔍 Search Enrollment..." 
                className="border border-gray-300 rounded-full px-4 py-2 w-1/3 shadow-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />

            {/* 📄 Enrollment Table */}
            <table className="w-full border-collapse border border-gray-300 mt-3">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2">Enrollment No</th>
                  <th className="border p-2">Student Name</th>
                  <th className="border p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEnrollments.map((enroll) => (
                  <tr key={enroll.id} className="text-center">
                    <td className="border p-2">{enroll.enrollment_no}</td>
                    <td className="border p-2">{enroll.student_name}</td>
                    <td className="border p-2">
                      <button 
                        className="px-3 py-1 bg-red-500 text-white rounded" 
                        onClick={() => handleDelete(enroll.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case "📊 Excel Upload": // Excel Upload
        return (
          <div className="p-6 bg-gray-100">
          <h2 className="text-lg font-semibold mb-4">Upload Excel File</h2>
          <input type="file" accept=".xlsx" onChange={handleFileUpload} className="mb-3" />
          <button onClick={handleFetchSheets} className="ml-3 px-4 py-2 bg-blue-500 text-white rounded">
            Fetch Sheets
          </button>
    
          {/* Display Sheet Names */}
          {sheets.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold">Select a Worksheet:</h3>
              {sheets.map((sheet) => (
                <div key={sheet}>
                  <input
                    type="radio"
                    id={sheet}
                    name="sheets"
                    value={sheet}
                    onChange={(e) => handleSheetSelect(e.target.value, columnMapping)}
                  />
                  <label htmlFor={sheet} className="ml-2">{sheet}</label>
                </div>
              ))}
            </div>
          )}
    
          {/* Display Column Checkboxes */}
          {columns.length > 0 && (
                  <div className="mt-4 p-4 border border-gray-300 bg-white rounded">
                    <h3 className="font-semibold">Select Columns to Upload:</h3>
                    {columns.map((col) => (
                      <div key={col} className="flex items-center mt-2">
                        <input
                          type="checkbox"
                          id={col}
                          checked={selectedColumns.includes(col)}
                          onChange={() => handleColumnSelection(col)}
                        />
                        <label htmlFor={col} className="ml-2">{col}</label>
                      </div>
                    ))}
                    <button onClick={handleUpload} className="mt-4 px-4 py-2 bg-green-500 text-white rounded">
                      Upload Data
                    </button>
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
