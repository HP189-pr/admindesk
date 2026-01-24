/**
 * Cash Register service helpers
 * FINAL – stable & future-safe
 */
import axiosInstance from '../api/axiosInstance';

// axiosInstance baseURL is '/api', so use relative paths here
// to avoid generating '/api/api/...'.
const RECEIPTS_BASE = '/receipts/';
const CASH_REGISTER_BASE = '/cash-register/';
const CASH_OUTWARD_BASE = '/cash-outward/';
const CASH_ON_HAND_BASE = '/cash-on-hand/';

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
  bank_prefix,
} = {}) => {
  const params = { payment_mode };
  if (date) params.date = date;
  if (bank_prefix) params.bank_prefix = bank_prefix;

  const response = await axiosInstance.get(
    `${CASH_REGISTER_BASE}next-receipt/`,
    { params }
  );
  return response.data;
};

/* ----------------------------------------------------
   CREATE / UPDATE / DELETE RECEIPTS
---------------------------------------------------- */

export const createCashEntry = async (payload) => {
  const response = await axiosInstance.post(
    CASH_REGISTER_BASE,
    payload
  );
  return response.data;
};

// ✅ Update receipt with items (multi-fee edit, audit-safe)
export const updateReceiptWithItems = async (id, payload) => {
  const response = await axiosInstance.put(
    `${CASH_REGISTER_BASE}${id}/update-with-items/`,
    payload
  );
  return response.data;
};

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
   ✅ PERIODIC FEES AGGREGATE (REPORT PAGE)
---------------------------------------------------- */

export const fetchFeesAggregate = async (params = {}) => {
  const response = await axiosInstance.get(
    `${RECEIPTS_BASE}fees-aggregate/`,
    { params }
  );
  return response.data;
};

/* ----------------------------------------------------
   ✅ PERIODIC RECEIPT RANGE (REPORT PAGE)
---------------------------------------------------- */

export const fetchRecRange = async (params = {}) => {
  const response = await axiosInstance.get(
    `${RECEIPTS_BASE}rec-range/`,
    { params }
  );
  return response.data;
};

/* ----------------------------------------------------
   💸 CASH OUTWARD (DEPOSIT / EXPENSE)
---------------------------------------------------- */

export const fetchCashOutward = async (params = {}) => {
  const response = await axiosInstance.get(
    CASH_OUTWARD_BASE,
    { params }
  );
  return response.data;
};

export const createCashOutward = async (payload) => {
  const response = await axiosInstance.post(
    CASH_OUTWARD_BASE,
    payload
  );
  return response.data;
};

/* ----------------------------------------------------
   🧮 CASH ON HAND (DAILY CLOSING REPORT)
---------------------------------------------------- */

export const fetchCashOnHandReport = async ({ date }) => {
  if (!date) {
    throw new Error('date is required for cash on hand report');
  }

  const response = await axiosInstance.get(
    `${CASH_ON_HAND_BASE}report/`,
    {
      params: { date },
    }
  );

  return response.data;
};

export const closeCashDay = async (payload) => {
  const response = await axiosInstance.post(
    `${CASH_ON_HAND_BASE}close/`,
    payload
  );
  return response.data;
};

/* ----------------------------------------------------
   DEFAULT EXPORT (KEEP EVERYTHING)
---------------------------------------------------- */

export default {
  // Cash Register
  fetchCashEntries,
  fetchNextReceiptNumber,
  createCashEntry,
  updateReceiptWithItems,
  deleteCashEntry,
  createReceiptsBulk,

  // Reports
  fetchFeesAggregate,
  fetchRecRange,

  // Cash Outward
  fetchCashOutward,
  createCashOutward,

  // Cash On Hand
  fetchCashOnHandReport,
  closeCashDay,
};
