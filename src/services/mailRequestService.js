import API, { LONG_API } from '../api/axiosInstance';

const BASE_PATH = '/api/mail-requests/';

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
  if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')) {
    return 'The server took too long to respond. The request may still complete in the background.';
  }
  if (error.request) return 'No response from server. The request may still complete in the background.';
  return error.message || 'Unexpected error';
};

const wrapServiceError = (error) => {
  const wrapped = new Error(extractMessage(error));
  wrapped.status = error?.response?.status;
  wrapped.code = error?.code;
  wrapped.isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '');
  wrapped.isNoResponse = !!error?.request && !error?.response;
  wrapped.maybeCompleted = wrapped.isTimeout || wrapped.isNoResponse;
  return wrapped;
};

export const isMailRequestMaybeCompletedError = (error) => Boolean(error?.maybeCompleted);

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
    throw wrapServiceError(error);
  }
};

export const updateMailRequest = async (id, payload) => {
  try {
    const response = await LONG_API.patch(`${BASE_PATH}${id}/`, payload);
    return response.data;
  } catch (error) {
    throw wrapServiceError(error);
  }
};

export const refreshMailRequest = async (id) => {
  try {
    const response = await LONG_API.post(`${BASE_PATH}${id}/refresh-verification/`);
    return response.data;
  } catch (error) {
    throw wrapServiceError(error);
  }
};

export const bulkRefreshMailRequests = async (ids) => {
  try {
    const response = await LONG_API.post(`${BASE_PATH}bulk-refresh/`, ids);
    return response.data;
  } catch (error) {
    throw wrapServiceError(error);
  }
};

export const syncMailRequestsFromSheet = async ({ serviceAccountFile, sheetUrl, noPrune } = {}) => {
  try {
    const payload = {};
    if (serviceAccountFile) payload.service_account_file = serviceAccountFile;
    if (sheetUrl) payload.sheet_url = sheetUrl;
    if (noPrune) payload.no_prune = true;
    const response = await LONG_API.post(`${BASE_PATH}sync-from-sheet/`, payload);
    return response.data;
  } catch (error) {
    throw wrapServiceError(error);
  }
};
