import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const getAuthHeader = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const axiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000, // 10 seconds
  headers: { "Content-Type": "application/json" },
});
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

export default axiosInstance;

// ✅ Fetch all enrollments
export const getEnrollments = async (query = "") => {
  try {
    const response = await axiosInstance.get("/api/enrollments/search/", {
      params: { query },
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
      // Update existing enrollment (Use PUT method)
      const response = await axiosInstance.put(`/api/enrollments/${enrollment.id}/`, enrollment);
      return response.data;
    } else {
      // Create new enrollment (Ensure correct API endpoint)
      const response = await axiosInstance.post("/api/enrollments/", enrollment);
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
    const response = await axiosInstance.delete(`/api/enrollments/${id}/`);
    return response.data;
  } catch (error) {
    console.error("Error deleting enrollment:", error);
    throw new Error(error.response?.data?.error || "Failed to delete enrollment");
  }
};

// ✅ Upload Excel File
export const uploadExcel = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await axiosInstance.post("/api/enrollments/upload-excel/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
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

    const response = await axiosInstance.post("/api/enrollments/process-sheet/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  } catch (error) {
    console.error("Error processing sheet:", error);
    throw new Error(error.response?.data?.error || "Failed to process sheet");
  }
};
