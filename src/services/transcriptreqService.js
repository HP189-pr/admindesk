import API from '../api/axiosInstance';

const BASE_PATH = '/api/transcript-requests/';

const normalizeResponseArray = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
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

export const fetchTranscriptRequests = async ({ status, search, institute, page, pageSize } = {}) => {
  try {
    const params = {};
    if (status) params.mail_status = status;
    if (search) params.search = search;
    if (institute) params.institute_name = institute;
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

export const updateTranscriptRequest = async (id, payload) => {
  try {
    const response = await API.patch(`${BASE_PATH}${id}/`, payload);
    return response.data;
  } catch (error) {
    throw new Error(extractMessage(error));
  }
};

export const bulkUpdateTranscriptStatus = async (ids, mailStatus) => {
  try {
    const response = await API.post(`${BASE_PATH}bulk-status/`, {
      ids,
      mail_status: mailStatus,
    });
    return response.data;
  } catch (error) {
    throw new Error(extractMessage(error));
  }
};
