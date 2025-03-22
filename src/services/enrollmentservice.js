import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/enrollment";

const getAuthHeader = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const axiosConfig = {
  timeout: 10000, // 10 seconds
};

// ✅ Fetch all enrollments
export const getEnrollments = async (query = "") => {
  try {
    const response = await axios.get(`${API_URL}/search/`, {
      params: { query },
      headers: { ...getAuthHeader() },
      ...axiosConfig,
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching enrollments:", error);
    throw new Error(error.response?.data?.error || "Failed to fetch enrollments");
  }
};

// ✅ Add or Update Enrollment
export const saveEnrollment = async (enrollment) => {
  if (!enrollment || !enrollment.enrollment_no || !enrollment.student_name) {
    throw new Error("Invalid enrollment data");
  }

  try {
    if (enrollment.id) {
      const response = await axios.put(`${API_URL}/${enrollment.id}/`, enrollment, {
        headers: { ...getAuthHeader() },
        ...axiosConfig,
      });
      return response.data;
    } else {
      const response = await axios.post(API_URL, enrollment, {
        headers: { ...getAuthHeader() },
        ...axiosConfig,
      });
      return response.data;
    }
  } catch (error) {
    console.error("Error saving enrollment:", error);
    throw new Error(error.response?.data?.error || "Failed to save enrollment");
  }
};

// ✅ Delete Enrollment
export const deleteEnrollment = async (id) => {
  try {
    const response = await axios.delete(`${API_URL}/${id}/`, {
      headers: { ...getAuthHeader() },
      ...axiosConfig,
    });
    return response.data;
  } catch (error) {
    console.error("Error deleting enrollment:", error);
    throw new Error(error.response?.data?.error || "Failed to delete enrollment");
  }
};

// ✅ Upload Excel File
export const uploadExcel = async (file) => {
  try {
    const formData = new FormData();
    formData.append("file", file);
    const response = await axios.post(`${API_URL}/upload-excel/`, formData, {
      headers: { ...getAuthHeader(), "Content-Type": "multipart/form-data" },
      ...axiosConfig,
    });
    return response.data;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw new Error(error.response?.data?.error || "Failed to upload file");
  }
};

// ✅ Process Selected Sheet
export const processSheet = async (file, sheetName, columnMapping) => {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("sheet_name", sheetName);
    formData.append("column_mapping", JSON.stringify(columnMapping));

    const response = await axios.post(`${API_URL}/process-sheet/`, formData, {
      headers: { ...getAuthHeader(), "Content-Type": "multipart/form-data" },
      ...axiosConfig,
    });
    return response.data;
  } catch (error) {
    console.error("Error processing sheet:", error);
    throw new Error(error.response?.data?.error || "Failed to process sheet");
  }
};