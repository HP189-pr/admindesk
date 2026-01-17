/**
 * Cash Register service helpers
 * FINAL – stable & future-safe
 */
import axiosInstance from '../api/axiosInstance';

const RECEIPTS_BASE = '/api/receipts/';
const CASH_REGISTER_BASE = '/api/cash-register/';

/* ----------------------------------------------------
   CASH REGISTER (FLATTENED – USED BY MAIN ENTRY PAGE)
---------------------------------------------------- */

export const fetchCashEntries = async (params = {}) => {
  const response = await axiosInstance.get(
    `${RECEIPTS_BASE}flattened/`,
    { params }
  );
  return response.data;
};

/* ----------------------------------------------------
   NEXT RECEIPT NUMBER
---------------------------------------------------- */

export const fetchNextReceiptNumber = async ({
  payment_mode = 'CASH',
  date,
} = {}) => {
  const params = { payment_mode };
  if (date) params.date = date;

  const response = await axiosInstance.get(
    `${CASH_REGISTER_BASE}next-receipt/`,
    { params }
  );
  return response.data;
};

/* ----------------------------------------------------
   CREATE / UPDATE / DELETE
---------------------------------------------------- */

export const createCashEntry = async (payload) => {
  const response = await axiosInstance.post(
    CASH_REGISTER_BASE,
    payload
  );
  return response.data;
};

// ❌ Updating cash register entries is intentionally disabled for audit safety
// export const updateCashEntry = async (id, payload) => {
//   const response = await axiosInstance.put(
//     `${CASH_REGISTER_BASE}${id}/`,
//     payload
//   );
//   return response.data;
// };

export const deleteCashEntry = async (id) => {
  const response = await axiosInstance.delete(
    `${CASH_REGISTER_BASE}${id}/`
  );
  return response.data;
};

/* ----------------------------------------------------
   BULK CREATE (MULTI FEE RECEIPT)
---------------------------------------------------- */

export const createReceiptsBulk = async (payload) => {
  const response = await axiosInstance.post(
    `${RECEIPTS_BASE}bulk-create/`,
    payload
  );
  return response.data;
};

/* ----------------------------------------------------
   ✅ PERIODIC FEES AGGREGATE (REPORT PAGE ONLY)
---------------------------------------------------- */

export const fetchFeesAggregate = async (params = {}) => {
  /**
   * params:
   * {
   *   date_from: 'YYYY-MM-DD',
   *   date_to: 'YYYY-MM-DD',
   *   payment_mode?: 'CASH' | 'BANK' | 'UPI',
   *   report_by: 'Daily' | 'Monthly' | 'Quarterly' | 'Half-Yearly' | 'Yearly'
   * }
   */
  console.log('fetchFeesAggregate params:', params);
  const response = await axiosInstance.get(
    `${RECEIPTS_BASE}fees-aggregate/`,
    { params }
  );
  console.log('fetchFeesAggregate response:', response.data);
  return response.data;
};

/* ----------------------------------------------------
   ✅ PERIODIC RECEIPT RANGE (REPORT PAGE ONLY)
---------------------------------------------------- */

export const fetchRecRange = async (params = {}) => {
  /**
   * params:
   * {
   *   date_from: 'YYYY-MM-DD',
   *   date_to: 'YYYY-MM-DD',
   *   payment_mode?: 'CASH' | 'BANK' | 'UPI',
   *   report_by: 'Daily' | 'Monthly' | 'Quarterly' | 'Half-Yearly' | 'Yearly'
   * }
   */
  console.log('fetchRecRange params:', params);
  const response = await axiosInstance.get(
    `${RECEIPTS_BASE}rec-range/`,
    { params }
  );
  console.log('fetchRecRange response:', response.data);
  return response.data;
};

/* ----------------------------------------------------
   EXPORT
---------------------------------------------------- */

export default {
  fetchCashEntries,
  fetchNextReceiptNumber,
  createCashEntry,
  deleteCashEntry,
  createReceiptsBulk,
  fetchFeesAggregate,
  fetchRecRange,
};
