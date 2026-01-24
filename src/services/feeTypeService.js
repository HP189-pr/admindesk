/**
 * Fee Type master service helpers
 */
import axiosInstance from '../api/axiosInstance';

// axiosInstance already has baseURL '/api', so we only need
// the relative path segment for this resource.
const BASE_URL = '/fee-types/';

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
