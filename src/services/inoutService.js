/**
 * Inward/Outward Register Service
 * API calls for In/Out Register Management System
 */
import axiosInstance from '../api/axiosInstance';

const BASE_URL = '';

// ==================== INWARD REGISTER ====================

export const getInwardRegister = async (filters = {}) => {
  try {
    const response = await axiosInstance.get(`/api/inward-register/`, { params: filters });
    return response.data;
  } catch (error) {
    console.error('Error fetching inward register:', error);
    throw error;
  }
};

export const getInwardRegisterById = async (id) => {
  try {
    const response = await axiosInstance.get(`/api/inward-register/${id}/`);
    return response.data;
  } catch (error) {
    console.error('Error fetching inward register by ID:', error);
    throw error;
  }
};

export const addInwardRegister = async (data) => {
  try {
    const response = await axiosInstance.post(`/api/inward-register/`, data);
    return response.data;
  } catch (error) {
    console.error('Error adding inward register:', error);
    throw error;
  }
};

export const updateInwardRegister = async (id, data) => {
  try {
    const response = await axiosInstance.put(`/api/inward-register/${id}/`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating inward register:', error);
    throw error;
  }
};

export const deleteInwardRegister = async (id) => {
  try {
    const response = await axiosInstance.delete(`/api/inward-register/${id}/`);
    return response.data;
  } catch (error) {
    console.error('Error deleting inward register:', error);
    throw error;
  }
};

export const getNextInwardNumber = async (type = 'Gen') => {
  try {
    const response = await axiosInstance.get(`/api/inward-register/next-number/`, { params: { type } });
    return response.data;
  } catch (error) {
    console.error('Error fetching next inward number:', error);
    throw error;
  }
};

// ==================== OUTWARD REGISTER ====================

export const getOutwardRegister = async (filters = {}) => {
  try {
    const response = await axiosInstance.get(`/api/outward-register/`, { params: filters });
    return response.data;
  } catch (error) {
    console.error('Error fetching outward register:', error);
    throw error;
  }
};

export const getOutwardRegisterById = async (id) => {
  try {
    const response = await axiosInstance.get(`/api/outward-register/${id}/`);
    return response.data;
  } catch (error) {
    console.error('Error fetching outward register by ID:', error);
    throw error;
  }
};

export const addOutwardRegister = async (data) => {
  try {
    const response = await axiosInstance.post(`/api/outward-register/`, data);
    return response.data;
  } catch (error) {
    console.error('Error adding outward register:', error);
    throw error;
  }
};

export const updateOutwardRegister = async (id, data) => {
  try {
    const response = await axiosInstance.put(`/api/outward-register/${id}/`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating outward register:', error);
    throw error;
  }
};

export const deleteOutwardRegister = async (id) => {
  try {
    const response = await axiosInstance.delete(`/api/outward-register/${id}/`);
    return response.data;
  } catch (error) {
    console.error('Error deleting outward register:', error);
    throw error;
  }
};

export const getNextOutwardNumber = async (type = 'Gen') => {
  try {
    const response = await axiosInstance.get(`/api/outward-register/next-number/`, { params: { type } });
    return response.data;
  } catch (error) {
    console.error('Error fetching next outward number:', error);
    throw error;
  }
};

export default {
  getInwardRegister,
  getInwardRegisterById,
  addInwardRegister,
  updateInwardRegister,
  deleteInwardRegister,
  getOutwardRegister,
  getOutwardRegisterById,
  addOutwardRegister,
  updateOutwardRegister,
  deleteOutwardRegister,
};
