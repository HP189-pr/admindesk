// inst-letterservice.js
// Lightweight helpers for Institutional Letter/Verification APIs

const defaultHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const unwrap = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.items)) return data.items;
  return [];
};

export const fetchInstLetterMains = async ({ search = '', docRec = '', limit = 200, apiBase = '/api', headersFn = defaultHeaders } = {}) => {
  const params = new URLSearchParams();
  if (docRec) params.set('doc_rec', docRec);
  if (search) params.set('search', search);
  if (limit) params.set('limit', String(limit));
  const res = await fetch(`${apiBase}/inst-verification-main/?${params.toString()}`, {
    headers: { 'Content-Type': 'application/json', ...headersFn() },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to load inst letter mains (${res.status})`);
  const data = await res.json();
  return unwrap(data);
};

export const fetchInstLetterStudents = async ({ docRec, apiBase = '/api', headersFn = defaultHeaders } = {}) => {
  if (!docRec) return [];
  const params = new URLSearchParams({ doc_rec: docRec });
  const res = await fetch(`${apiBase}/inst-verification-student/?${params.toString()}`, {
    headers: { 'Content-Type': 'application/json', ...headersFn() },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to load inst letter students (${res.status})`);
  const data = await res.json();
  return unwrap(data);
};

export const suggestInstLetterDocRec = async ({ year = '', number = '', apiBase = '/api', headersFn = defaultHeaders } = {}) => {
  const params = new URLSearchParams();
  if (year) params.set('year', year);
  if (number) params.set('number', number);
  const res = await fetch(`${apiBase}/inst-verification/suggest-doc-rec/?${params.toString()}`, {
    headers: { ...headersFn() },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to suggest doc_rec (${res.status})`);
  return res.json();
};

export const generateInstLetterPDF = async (payload, { apiBase = '/api', headersFn = defaultHeaders } = {}) => {
  const res = await fetch(`${apiBase}/inst-verification/generate-pdf/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/pdf, application/json;q=0.9, */*;q=0.8', ...headersFn() },
    credentials: 'include',
    body: JSON.stringify(payload || {}),
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || contentType.includes('application/json')) {
    let errText = 'Unable to generate PDF';
    try {
      const errJson = await res.json();
      errText = errJson?.detail || errJson?.error || errText;
    } catch {
      errText = await res.text().catch(() => errText);
    }
    throw new Error(errText);
  }

  const blob = await res.blob();
  if (!blob || blob.size === 0) throw new Error('Received an empty PDF from the server.');
  return blob;
};

export default {
  fetchInstLetterMains,
  fetchInstLetterStudents,
  suggestInstLetterDocRec,
  generateInstLetterPDF,
};
