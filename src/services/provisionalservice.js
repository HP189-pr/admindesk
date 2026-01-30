// Provisional Service for API calls related to ProvisionalRecord
// See ProvisionalRecord model for field mapping

import { dmyToISO } from '../utils/date';

const API_BASE = '/api/provisional/';

export async function fetchProvisionals(query = '') {
  const url = query ? `${API_BASE}?search=${encodeURIComponent(query)}` : API_BASE;
  const res = await fetch(url, { headers: authHeaders() });
  const data = await res.json();
  return Array.isArray(data) ? data : data.results || [];
}

export async function fetchProvisionalsByDocRec(docRecKey) {
  if (!docRecKey) return [];
  const url = `${API_BASE}?doc_rec=${encodeURIComponent(docRecKey)}`;
  const res = await fetch(url, { headers: authHeaders() });
  const data = await res.json();
  return Array.isArray(data) ? data : data.results || [];
}

export async function saveProvisional(form) {
  const payload = mapFormToPayload(form);
  let res;
  if (form.id) {
    res = await fetch(`${API_BASE}${form.id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
  } else {
    res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
  }
  if (!res.ok) throw new Error(await res.text());
  return true;
}

export async function addProvisionalEntry(entry, list, form) {
  // validation: prv_number unique per doc_rec
  const sibling = list.find((r) => (r.prv_number || '').trim() === (entry.prv_number || '').trim());
  if (sibling && (entry.prv_status || '').toLowerCase() !== 'cancelled') {
    throw new Error('Duplicate PRV number for this document is not allowed unless status is Cancelled.');
  }
  // status rule: only one 'Issued' or one 'Pending' (null) per doc_rec
  const statusNonCancel = list.filter(r => (r.prv_status||'').toLowerCase() !== 'cancelled');
  if ((entry.prv_status||'').toLowerCase() !== 'cancelled') {
    const hasDoneOrNull = statusNonCancel.find(r => !r.prv_status || ['issued','pending','done'].includes((r.prv_status||'').toLowerCase()));
    if (hasDoneOrNull) {
      throw new Error('Only one non-cancelled provisional entry allowed per document.');
    }
  }
  // create via API
  const payload = mapFormToPayload({ ...form, ...entry });
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return true;
}

function mapFormToPayload(form) {
  return {
    doc_rec_key: form.doc_rec || form.doc_rec_key || undefined,
    enrollment: form.enrollment || null,
    student_name: form.student_name || null,
    institute: form.institute || null,
    subcourse: form.subcourse || null,
    maincourse: form.maincourse || null,
    class_obtain: form.class_obtain || null,
    prv_number: form.prv_number || null,
    prv_date: dmyToISO(form.prv_date) || null,
    passing_year: form.passing_year || null,
    prv_status: form.prv_status || 'Pending',
    pay_rec_no: form.pay_rec_no || null,
    doc_remark: form.doc_remark || null,
  };
}

function authHeaders() {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
