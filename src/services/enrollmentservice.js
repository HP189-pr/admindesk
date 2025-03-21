import axios from "axios";

const API_URL = "http://localhost:8000/enrollment";

// ✅ Fetch all enrollments
export const getEnrollments = async (query) => {
  const response = await axios.get(`${API_URL}/search/?query=${query}`);
  return response.data;
};

// ✅ Add or Update Enrollment
export const saveEnrollment = async (enrollment) => {
  if (enrollment.id) {
    return await axios.put(`${API_URL}/${enrollment.id}/`, enrollment);
  } else {
    return await axios.post(API_URL, enrollment);
  }
};

// ✅ Delete Enrollment
export const deleteEnrollment = async (id) => {
  return await axios.delete(`${API_URL}/${id}/`);
};

// ✅ Upload Excel File
export const uploadExcel = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await axios.post(`${API_URL}/upload-excel/`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

// ✅ Process Selected Sheet
export const processSheet = async (file, sheetName, columnMapping) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sheet_name", sheetName);
  formData.append("column_mapping", JSON.stringify(columnMapping));

  const response = await axios.post(`${API_URL}/process-sheet/`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};
