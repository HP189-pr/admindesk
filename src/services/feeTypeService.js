/**
 * Fee Type master service helpers
 */
import axiosInstance from '../api/axiosInstance';

// axiosInstance baseURL is the backend origin, so include /api here.
const BASE_URL = '/api/fee-types/';

export const fetchFeeTypes = async (params = {}) => {
  const response = await axiosInstance.get(BASE_URL, { params });
  return response.data;
};

export const createFeeType = async (payload) => {
  const response = await axiosInstance.post(BASE_URL, payload);
  return response.data;
};

export const updateFeeType = async (id, payload) => {
  const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
  return response.data;
};

export default {
  fetchFeeTypes,
  createFeeType,
  updateFeeType,
};
