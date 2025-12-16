/**
 * Cash Register service helpers
 */
import axiosInstance from '../api/axiosInstance';

const BASE_URL = '/api/cash-register/';

export const fetchCashEntries = async (params = {}) => {
  const response = await axiosInstance.get(BASE_URL, { params });
  return response.data;
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

export default {
  fetchCashEntries,
  createCashEntry,
  updateCashEntry,
  deleteCashEntry,
  fetchNextReceiptNumber,
};
