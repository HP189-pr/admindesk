// inst-letterservice.js
// Consolidated helpers for Institutional Letter/Verification APIs

const defaultHeaders = () => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const unwrap = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.objects)) return data.objects;
  return [];
};

const jsonFetch = async (path, { method = "GET", body, apiBase = "/api", headersFn = defaultHeaders } = {}) => {
  const headers = {
    Accept: "application/json",
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...headersFn(),
  };

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const detail =
      payload?.detail ||
      payload?.error ||
      payload?.message ||
      (payload && typeof payload === 'object' ? JSON.stringify(payload) : null);
    throw new Error(detail || `Request failed (${res.status})`);
  }

  return isJson ? payload : null;
};

export const fetchInstLetterMains = async ({ search = "", docRec = "", ivRecordNo = "", instVeriNumber = "", limit = 200, apiBase = "/api", headersFn = defaultHeaders } = {}) => {
  const params = new URLSearchParams();
  if (docRec) params.set("doc_rec", docRec);
  if (ivRecordNo) params.set("iv_record_no", ivRecordNo);
  if (instVeriNumber) params.set("inst_veri_number", instVeriNumber);
  if (search) params.set("search", search);
  if (limit) params.set("limit", String(limit));
  const data = await jsonFetch(`/inst-verification-main/?${params.toString()}`, { apiBase, headersFn });
  return unwrap(data);
};

export const fetchInstLetterMainDetail = async (id, { apiBase = "/api", headersFn = defaultHeaders } = {}) => {
  if (!id) throw new Error("Main record id is required");
  return jsonFetch(`/inst-verification-main/${id}/`, { apiBase, headersFn });
};

export const saveInstLetterMain = async (payload, { id = null, apiBase = "/api", headersFn = defaultHeaders } = {}) => {
  const path = id ? `/inst-verification-main/${id}/` : `/inst-verification-main/`;
  const method = id ? "PUT" : "POST";
  return jsonFetch(path, { method, body: payload, apiBase, headersFn });
};

export const fetchInstLetterStudents = async ({ docRec, apiBase = "/api", headersFn = defaultHeaders } = {}) => {
  if (!docRec) return [];
  const params = new URLSearchParams({ doc_rec: docRec });
  const data = await jsonFetch(`/inst-verification-student/?${params.toString()}`, { apiBase, headersFn });
  return unwrap(data);
};

export const saveInstLetterStudent = async (payload, { id = null, apiBase = "/api", headersFn = defaultHeaders } = {}) => {
  const path = id ? `/inst-verification-student/${id}/` : `/inst-verification-student/`;
  const method = id ? "PUT" : "POST";
  const sanitized = { ...(payload || {}) };
  // No need to strip removed fields
  // Debug logs for browser console
  console.log("======== STUDENT SAVE DEBUG ========");
  console.log("Original Payload:", payload);
  console.log("Sanitized Payload:", sanitized);
  console.log("Request URL:", `${apiBase}${path}`);
  console.log("Method:", method);
  console.log("====================================");
  try {
    const response = await jsonFetch(path, { method, body: sanitized, apiBase, headersFn });
    console.log("Student Save Response:", response);
    return response;
  } catch (err) {
    console.error("Student Save Error:", err);
    throw err;
  }
};

export const deleteInstLetterStudent = async (id, { apiBase = "/api", headersFn = defaultHeaders } = {}) => {
  if (!id) return null;
  return jsonFetch(`/inst-verification-student/${id}/`, { method: "DELETE", apiBase, headersFn });
};

export const suggestInstLetterDocRec = async ({ year = "", number = "", apiBase = "/api", headersFn = defaultHeaders } = {}) => {
  const params = new URLSearchParams();
  if (year) params.set("year", year);
  if (number) params.set("number", number);
  return jsonFetch(`/inst-letter/suggest-doc-rec/?${params.toString()}`, { apiBase, headersFn });
};

export const generateInstLetterPDF = async (payload, { apiBase = "/api", headersFn = defaultHeaders } = {}) => {
  const path = "/inst-letter/generate-pdf/";
  try {
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/pdf, application/json;q=0.9, */*;q=0.8",
        ...headersFn(),
      },
      credentials: "include",
      body: JSON.stringify(payload || {}),
    });

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    if (!res.ok || isJson) {
      let errText = "Unable to generate PDF";
      try {
        const errJson = await res.json();
        errText = errJson?.detail || errJson?.error || errText;
      } catch {
        errText = (await res.text().catch(() => null)) || errText;
      }
      throw new Error(errText);
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) throw new Error("Received an empty PDF from the server.");
    return blob;
  } catch (err) {
    throw new Error(err?.message || "Unable to generate PDF");
  }
};

export default {
  fetchInstLetterMains,
  fetchInstLetterMainDetail,
  saveInstLetterMain,
  fetchInstLetterStudents,
  saveInstLetterStudent,
  deleteInstLetterStudent,
  suggestInstLetterDocRec,
  generateInstLetterPDF,
};
