/**
 * Inventory Service
 * API calls for Inventory Management System
 */
import axiosInstance from '../api/axiosInstance';

// axiosInstance is already configured with baseURL '/api',
// so we use relative paths here (no extra /api prefix).
const BASE_URL = '';

// ==================== ITEM MASTER ====================

export const getItems = async (searchQuery = '') => {
  try {
    const params = searchQuery ? { search: searchQuery } : {};
    const response = await axiosInstance.get(`${BASE_URL}/inventory-items/`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching items:', error);
    throw error;
  }
};

export const addItem = async (data) => {
  try {
    const response = await axiosInstance.post(`${BASE_URL}/inventory-items/`, data);
    return response.data;
  } catch (error) {
    console.error('Error adding item:', error);
    throw error;
  }
};

export const updateItem = async (id, data) => {
  try {
    const response = await axiosInstance.put(`${BASE_URL}/inventory-items/${id}/`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating item:', error);
    throw error;
  }
};

export const deleteItem = async (id) => {
  try {
    const response = await axiosInstance.delete(`${BASE_URL}/inventory-items/${id}/`);
    return response.data;
  } catch (error) {
    console.error('Error deleting item:', error);
    throw error;
  }
};

// ==================== INWARD ENTRY ====================

export const getInward = async (filters = {}) => {
  try {
    const response = await axiosInstance.get(`${BASE_URL}/inventory-inward/`, { params: filters });
    return response.data;
  } catch (error) {
    console.error('Error fetching inward entries:', error);
    throw error;
  }
};

export const addInward = async (data) => {
  try {
    const response = await axiosInstance.post(`${BASE_URL}/inventory-inward/`, data);
    return response.data;
  } catch (error) {
    console.error('Error adding inward entry:', error);
    throw error;
  }
};

export const updateInward = async (id, data) => {
  try {
    const response = await axiosInstance.put(`${BASE_URL}/inventory-inward/${id}/`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating inward entry:', error);
    throw error;
  }
};

export const deleteInward = async (id) => {
  try {
    const response = await axiosInstance.delete(`${BASE_URL}/inventory-inward/${id}/`);
    return response.data;
  } catch (error) {
    console.error('Error deleting inward entry:', error);
    throw error;
  }
};

// ==================== OUTWARD ENTRY ====================

export const getOutward = async (filters = {}) => {
  try {
    const response = await axiosInstance.get(`${BASE_URL}/inventory-outward/`, { params: filters });
    return response.data;
  } catch (error) {
    console.error('Error fetching outward entries:', error);
    throw error;
  }
};

export const addOutward = async (data) => {
  try {
    const response = await axiosInstance.post(`${BASE_URL}/inventory-outward/`, data);
    return response.data;
  } catch (error) {
    console.error('Error adding outward entry:', error);
    throw error;
  }
};

export const updateOutward = async (id, data) => {
  try {
    const response = await axiosInstance.put(`${BASE_URL}/inventory-outward/${id}/`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating outward entry:', error);
    throw error;
  }
};

export const deleteOutward = async (id) => {
  try {
    const response = await axiosInstance.delete(`${BASE_URL}/inventory-outward/${id}/`);
    return response.data;
  } catch (error) {
    console.error('Error deleting outward entry:', error);
    throw error;
  }
};

// ==================== STOCK SUMMARY ====================

export const getStockSummary = async () => {
  try {
    const response = await axiosInstance.get(`${BASE_URL}/inventory-stock-summary/`);
    return response.data;
  } catch (error) {
    console.error('Error fetching stock summary:', error);
    throw error;
  }
};

export default {
  getItems,
  addItem,
  updateItem,
  deleteItem,
  getInward,
  addInward,
  updateInward,
  deleteInward,
  getOutward,
  addOutward,
  updateOutward,
  deleteOutward,
  getStockSummary,
};
