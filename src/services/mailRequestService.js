import API from '../api/axiosInstance';

const BASE_PATH = '/mail-requests/';

const normalizeResponseArray = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.results && Array.isArray(data.results)) return data.results;
  if (data.items && Array.isArray(data.items)) return data.items;
  return [];
};

const extractMessage = (error) => {
  if (!error) return 'Unexpected error';
  if (error.response) {
    const detail = error.response.data?.detail || error.response.data?.message;
    return detail || `Server error (${error.response.status})`;
  }
  if (error.request) return 'No response from server';
  return error.message || 'Unexpected error';
};

export const fetchMailRequests = async ({ status, search, page, pageSize } = {}) => {
  try {
    const params = {};
    if (status) params.mail_status = status;
    if (search) params.search = search;
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    const response = await API.get(BASE_PATH, { params });
    return {
      raw: response.data,
      rows: normalizeResponseArray(response.data),
      count: response.data?.count || response.data?.total || undefined,
    };
  } catch (error) {
    throw new Error(extractMessage(error));
  }
};

export const updateMailRequest = async (id, payload) => {
  try {
    const response = await API.patch(`${BASE_PATH}${id}/`, payload);
    return response.data;
  } catch (error) {
    throw new Error(extractMessage(error));
  }
};

export const refreshMailRequest = async (id) => {
  try {
    const response = await API.post(`${BASE_PATH}${id}/refresh-verification/`);
    return response.data;
  } catch (error) {
    throw new Error(extractMessage(error));
  }
};

export const bulkRefreshMailRequests = async (ids) => {
  try {
    const response = await API.post(`${BASE_PATH}bulk-refresh/`, ids);
    return response.data;
  } catch (error) {
    throw new Error(extractMessage(error));
  }
};

export const syncMailRequestsFromSheet = async ({ serviceAccountFile, sheetUrl, noPrune } = {}) => {
  try {
    const payload = {};
    if (serviceAccountFile) payload.service_account_file = serviceAccountFile;
    if (sheetUrl) payload.sheet_url = sheetUrl;
    if (noPrune) payload.no_prune = true;
    const response = await API.post(`${BASE_PATH}sync-from-sheet/`, payload);
    return response.data;
  } catch (error) {
    throw new Error(extractMessage(error));
  }
};
