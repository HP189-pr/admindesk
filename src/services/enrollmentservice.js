import axios from "axios";


const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";


const axiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000, // 10 seconds
  headers: { "Content-Type": "application/json" },
});

axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token"); // Get token from localStorage
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

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
  const token = localStorage.getItem("access_token"); // Ensure token is retrieved

  if (!token) {
    throw new Error("Authentication token is missing. Please log in again.");
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await axiosInstance.post("/api/enrollments/upload-excel/", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        Authorization: `Bearer ${token}`, // Ensure token is passed
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw new Error(error.response?.data?.error || "Failed to upload file");
  }
};


// ✅ Process Selected Sheet
export const processSheet = async (file, sheetName, columnMapping) => {
  const token = localStorage.getItem("access_token"); // Ensure token is retrieved

  if (!token) {
    throw new Error("Authentication token is missing. Please log in again.");
  }

  if (!file) {
    throw new Error("No file selected. Please upload a valid Excel file.");
  }

  if (!sheetName) {
    throw new Error("Sheet name is missing. Please select a valid sheet.");
  }

  if (!columnMapping || Object.keys(columnMapping).length === 0) {
    console.error("🚨 Column Mapping Error:", columnMapping);
    throw new Error("Column mapping is missing. Please match the columns correctly.");
  }

  console.log("📄 Selected Sheet:", sheetName);
  console.log("🔗 Column Mapping:", JSON.stringify(columnMapping, null, 2));

  const formData = new FormData();
  formData.append("file", file);
  formData.append("sheet_name", sheetName);
  formData.append("column_mapping", JSON.stringify(columnMapping));

  console.log("📝 FormData Contents:");
  console.log("FormData - file:", formData.get("file"));
  console.log("FormData - sheet_name:", formData.get("sheet_name"));
  console.log("FormData - column_mapping:", formData.get("column_mapping"));

  try {
    const response = await axiosInstance.post("/api/enrollments/process-sheet/", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        Authorization: `Bearer ${token}`,
      },
    });
    console.log("✅ API Response:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error processing sheet:", error);
    throw new Error(error.response?.data?.error || "Failed to process sheet");
  }
};
