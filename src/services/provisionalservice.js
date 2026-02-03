// Provisional Service for API calls related to ProvisionalRecord
// Works in DEV (3000) + PROD (8081)

import { dmyToISO } from '../utils/date';

/* ==================== API PATHS ==================== */
/* IMPORTANT:
   These MUST match Django urls.py exactly
   Using relative URLs - nginx/Vite proxy handles routing
*/
const API_BASE = '/api/provisional/';
const INST_API = '/api/institutes/';
const MAIN_API = '/api/mainbranch/';
const SUB_API  = '/api/subbranch/';

/* ==================== HELPERS ==================== */

function authHeaders() {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: authHeaders() });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Expected JSON but got ${contentType}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : data.results || [];
}

/* ==================== READ ==================== */

export async function fetchProvisionals(query = '') {
  const url = query
    ? `${API_BASE}?search=${encodeURIComponent(query)}`
    : API_BASE;
  return fetchJson(url);
}

export async function fetchProvisionalsByDocRec(docRecKey) {
  if (!docRecKey) return [];
  const url = `${API_BASE}?doc_rec=${encodeURIComponent(docRecKey)}`;
  return fetchJson(url);
}

export async function fetchInstituteCodes(search = '') {
  const url = search
    ? `${INST_API}?search=${encodeURIComponent(search)}`
    : INST_API;
  return fetchJson(url);
}

export async function fetchCourseCodes(search = '') {
  const url = search
    ? `${MAIN_API}?search=${encodeURIComponent(search)}`
    : MAIN_API;
  return fetchJson(url);
}

export async function fetchSubcourseNames(search = '') {
  const url = search
    ? `${SUB_API}?search=${encodeURIComponent(search)}`
    : SUB_API;
  return fetchJson(url);
}

/* ==================== WRITE ==================== */

export async function saveProvisional(form) {
  const payload = mapFormToPayload(form);

  const res = await fetch(
    form.id ? `${API_BASE}${form.id}/` : API_BASE,
    {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) throw new Error(await res.text());
  return true;
}

export async function addProvisionalEntry(entry, list, form) {
  const sibling = list.find(
    (r) => (r.prv_number || '').trim() === (entry.prv_number || '').trim()
  );

  if (sibling && (entry.prv_status || '').toLowerCase() !== 'cancelled') {
    throw new Error('Duplicate PRV number for this document is not allowed unless status is Cancelled.');
  }

  const statusNonCancel = list.filter(
    r => (r.prv_status || '').toLowerCase() !== 'cancelled'
  );

  if ((entry.prv_status || '').toLowerCase() !== 'cancelled') {
    const hasExisting = statusNonCancel.find(
      r => !r.prv_status || ['issued', 'pending', 'done'].includes((r.prv_status || '').toLowerCase())
    );
    if (hasExisting) {
      throw new Error('Only one non-cancelled provisional entry allowed per document.');
    }
  }

  const payload = mapFormToPayload({ ...form, ...entry });

  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(await res.text());
  return true;
}

/* ==================== MAPPER ==================== */

function mapFormToPayload(form) {
  return {
    doc_rec_key: form.doc_rec || form.doc_rec_key || undefined,
    enrollment_no: form.enrollment || null,
    student_name: form.student_name || null,
    institute: form.institute || null,
    subcourse: form.subcourse || null,
    maincourse: form.maincourse || null,
    class_obtain: form.class_obtain || null,
    prv_degree_name: form.prv_degree_name || null,
    prv_number: form.prv_number || null,
    prv_date: dmyToISO(form.prv_date) || null,
    passing_year: form.passing_year || null,
    prv_status: form.prv_status || 'Pending',
    pay_rec_no: form.pay_rec_no || null,
    doc_remark: form.doc_remark || null,
  };
}
