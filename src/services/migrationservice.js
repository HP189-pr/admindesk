import API from '../api/axiosInstance';

const MIGRATION_API = '/api/migration/';

export const getMigrationReport = async (params = {}, config = {}) => {
  const res = await API.get(`${MIGRATION_API}report/`, { params, ...config });
  return res.data;
};

export const getMigrationFilterOptions = async () => {
  const res = await API.get(`${MIGRATION_API}filter-options/`);
  return res.data;
};

export default {
  getMigrationReport,
  getMigrationFilterOptions,
};
