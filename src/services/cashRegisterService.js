/**
 * Cash Register service helpers
 */
import axiosInstance from '../api/axiosInstance';

const BASE_URL = '/api/cash-register/';
const RECEIPTS_BASE = '/api/receipts/';

export const fetchCashEntries = async (params = {}) => {
  // Use flattened endpoint that returns Receipt+ReceiptItem as individual rows
  const response = await axiosInstance.get(`${RECEIPTS_BASE}flattened/`, { params });
  return response.data;
};

// Fetch ALL cash entries across all pages
export const fetchAllCashEntries = async (params = {}) => {
  let allResults = [];
  let url = BASE_URL;
  
  try {
    while (url) {
      const response = await axiosInstance.get(url, { params: url === BASE_URL ? params : {} });
      const data = response.data;
      
      // Handle paginated response
      if (data.results && Array.isArray(data.results)) {
        allResults = [...allResults, ...data.results];
        url = data.next; // Continue if there's a next page
      } else if (Array.isArray(data)) {
        // Already an array, no pagination
        allResults = data;
        break;
      } else {
        break;
      }
    }
  } catch (err) {
    console.error("Error fetching all cash entries:", err);
  }
  
  return allResults;
};


export const createCashEntry = async (payload) => {
  const response = await axiosInstance.post(BASE_URL, payload);
  return response.data;
};

export const updateCashEntry = async (id, payload) => {
  const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
  return response.data;
};

export const deleteCashEntry = async (id) => {
  const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
  return response.data;
};

export const fetchNextReceiptNumber = async ({ payment_mode = 'CASH', date } = {}) => {
  const params = { payment_mode };
  if (date) params.date = date;
  const response = await axiosInstance.get(`${BASE_URL}next-receipt/`, { params });
  return response.data;
};

export const fetchReceipts = async (params = {}) => {
  const response = await axiosInstance.get(RECEIPTS_BASE, { params });
  return response.data;
};

export const createReceiptsBulk = async (payload) => {
  const response = await axiosInstance.post(`${RECEIPTS_BASE}bulk-create/`, payload);
  return response.data;
};

export const fetchFeesAggregate = async (params = {}) => {
  // Debug: log params and response to help frontend troubleshooting
  try {
    console.log("fetchFeesAggregate - params:", params);
    const response = await axiosInstance.get(`${RECEIPTS_BASE}fees-aggregate/`, { params });
    console.log("fetchFeesAggregate - response:", response && response.data);
    return response.data;
  } catch (err) {
    console.error("fetchFeesAggregate error:", err);
    throw err;
  }
};

export default {
  fetchCashEntries,
  fetchAllCashEntries,
  createCashEntry,
  updateCashEntry,
  deleteCashEntry,
  fetchNextReceiptNumber,
  fetchReceipts,
  createReceiptsBulk,
  fetchFeesAggregate,
};
