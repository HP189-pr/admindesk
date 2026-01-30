// verificationservice.js
// All API and data logic for Verification page

import { isoToDMY, dmyToISO } from "../utils/date";

// Resolve enrollment number to enrollment object (for auto name fetch)
export const resolveEnrollment = async (enrollmentNo) => {
  if (!enrollmentNo) return null;
  try {
    const res = await fetch(
      `/api/enrollments/?search=${encodeURIComponent(enrollmentNo)}&limit=1`,
      { headers: { ...authHeaders() } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rows = data?.results || [];
    return rows.length ? rows[0] : null;
  } catch (e) {
    console.warn("resolveEnrollment failed", e);
    return null;
  }
};


export const authHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const resolveDocRecIdentifier = async (form) => {
  const key = (form.doc_rec_key || "").toString().trim();
  if (key) return key;
  const idVal = (form.doc_rec_id || "").toString().trim();
  if (!idVal) return null;
  if (/^(vr_|iv_|pr_|mg_|gt_)/i.test(idVal)) return idVal;
  if (/^\d+$/.test(idVal)) {
    try {
      const res = await fetch(`/api/docrec/${idVal}/`, { headers: { ...authHeaders() } });
      if (res.ok) {
        const data = await res.json();
        if (data && data.doc_rec_id) return data.doc_rec_id;
      }
    } catch (e) {
      console.warn("DocRec id resolve failed", e);
    }
  }
  return idVal || null;
};

export const syncDocRecRemark = async (form, remarkValue) => {
  const docRecId = await resolveDocRecIdentifier(form);
  if (!docRecId) return;
  try {
    const payload = {
      doc_rec_id: docRecId,
      doc_rec_data: { doc_remark: remarkValue || null },
      verification_data: { doc_remark: remarkValue || null },
    };
    const res = await fetch('/api/docrec/update-with-verification/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn('DocRec remark sync failed', res.status, txt);
    }
  } catch (e) {
    console.warn('DocRec remark sync error', e);
  }
};

export const loadRecords = async (q, setLoading, setErrorMsg, setRecords) => {
  setLoading(true);
  try {
    let url;
    const qtrim = (q || '').toString().trim();
    if (qtrim && (/^(vr_|iv_|pr_|mg_|gt_)/i).test(qtrim)) {
      url = `/api/verification/?doc_rec=${encodeURIComponent(qtrim)}&limit=50`;
    } else if (q) {
      url = `/api/verification/?search=${encodeURIComponent(q)}&limit=50`;
    } else {
      url = `/api/verification/?limit=200&include_pending=true`;
    }
    const res = await fetch(url, { headers: { ...authHeaders() } });
    if (!res.ok) {
      let txt = '';
      try { txt = await res.text(); } catch (e) { txt = res.statusText || String(res.status); }
      console.error('Verification load error', res.status, txt);
      setErrorMsg(`Failed to load records: ${res.status} ${res.statusText}` + (txt ? ` - ${txt}` : ''));
      setRecords([]);
      return;
    }
    const data = await res.json();
    const rows = Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : []);
    const mapped = rows.map((r) => ({
      id: r.id,
      date: isoToDMY(
        r.doc_rec_date || r.date || (r.doc_rec && r.doc_rec.doc_rec_date) || r.createdat || ''
      ),
      enrollment_no: r.enrollment_no || (r.enrollment && r.enrollment.enrollment_no) || '',
      enrollment: r.enrollment || null,
      second_enrollment_no: r.second_enrollment_no || (r.second_enrollment && r.second_enrollment.enrollment_no) || '',
      student_name: r.student_name || '',
      tr_count: r.tr_count ?? 0,
      ms_count: r.ms_count ?? 0,
      dg_count: r.dg_count ?? 0,
      moi_count: r.moi_count ?? 0,
      backlog_count: r.backlog_count ?? 0,
      status: r.status || '',
      vr_done_date: isoToDMY(
        r.vr_done_date || r.last_resubmit_date || r.doc_rec_date || r.date || (r.doc_rec && r.doc_rec.doc_rec_date) || r.createdat || ''
      ),
      final_no: r.final_no || '',
      mail_status: r.mail_send_status || r.mail_status || '',
      pay_rec_no: r.pay_rec_no || '',
      doc_remark: r.doc_remark || r.vr_remark || (r.doc_rec && r.doc_rec.doc_remark) || '',
      doc_rec_key: r.doc_rec_key || (r.doc_rec && r.doc_rec.doc_rec_id) || r.sequence || r.doc_rec_id || '',
      doc_rec_id: r.doc_rec_id || (r.doc_rec && (r.doc_rec.doc_rec_id || r.doc_rec.id)) || '',
      eca_required: !!r.eca_required,
      eca_name: r.eca_name || '',
      eca_ref_no: r.eca_ref_no || '',
      eca_send_date: r.eca_send_date || '',
      eca_status: r.eca_required === true
        ? (r.eca_status || "NOT_SENT")
        : "",
      eca_resubmit_date: r.eca_resubmit_date || '',
    }));
    // Custom sort: status, then ECA status, then Doc Rec ID
    const statusOrder = { IN_PROGRESS: 1, PENDING: 2, CORRECTION: 3 };
    mapped.sort((a, b) => {
      // 1. Status order
      const aStatusRank = statusOrder[a.status] || 99;
      const bStatusRank = statusOrder[b.status] || 99;
      if (aStatusRank !== bStatusRank) return aStatusRank - bStatusRank;
      // 2. ECA Required + ECA Status (NOT_SENT on top)
      if (a.eca_required && b.eca_required) {
        if (a.eca_status === "NOT_SENT" && b.eca_status !== "NOT_SENT") return -1;
        if (b.eca_status === "NOT_SENT" && a.eca_status !== "NOT_SENT") return 1;
      } else if (a.eca_required && !b.eca_required) {
        return -1;
      } else if (!a.eca_required && b.eca_required) {
        return 1;
      }
      // 3. Doc Rec ID (descending numeric if possible)
      const extractDigits = (s) => {
        if (!s) return NaN;
        const d = String(s).replace(/\D+/g, "");
        return d ? parseInt(d, 10) : NaN;
      };
      const aDoc = extractDigits(a.doc_rec_key || a.doc_rec_id);
      const bDoc = extractDigits(b.doc_rec_key || b.doc_rec_id);
      if (!Number.isNaN(aDoc) && !Number.isNaN(bDoc)) return bDoc - aDoc;
      if (!Number.isNaN(aDoc) && Number.isNaN(bDoc)) return -1;
      if (Number.isNaN(aDoc) && !Number.isNaN(bDoc)) return 1;
      return (b.doc_rec_key || b.doc_rec_id || '').localeCompare(a.doc_rec_key || a.doc_rec_id || '');
    });
    setRecords(mapped);
    setErrorMsg("");
  } catch (e) {
    console.error(e);
  } finally {
    setLoading(false);
  }
};


export const createRecord = async (form, syncDocRecRemark, loadRecords) => {
  // POST /api/verification
  // Ensure we send the numeric DocRec PK when possible. If `form.doc_rec_id` is not numeric
  // but `form.doc_rec_key` is present, try resolving the DocRec PK from the server.
  const resolveDocRecPk = async (key) => {
    if (!key) return null;
    try {
      const res = await fetch(`/api/docrec/?doc_rec_id=${encodeURIComponent(key)}`, { headers: { ...authHeaders() } });
      if (!res.ok) return null;
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : []);
      if (rows.length > 0) return rows[0].id || null;
    } catch (e) {
      console.warn('DocRec lookup failed', e);
    }
    return null;
  };

  let docRecPk = null;
  if (form.doc_rec_id && String(form.doc_rec_id).trim() !== "") {
    // if numeric, use numeric; if string contains digits only, parse
    if (!Number.isNaN(Number(form.doc_rec_id)) && String(form.doc_rec_id).trim() !== '') docRecPk = Number(form.doc_rec_id);
  }
  if (!docRecPk && form.doc_rec_key && String(form.doc_rec_key).trim() !== "") {
    docRecPk = await resolveDocRecPk(form.doc_rec_key);
  }

  const body = {
    doc_rec_date: (function(s){ if(!s) return null; if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return s; const x = dmyToISO(s); return x || null; })(form.date),
    // Send the numeric DocRec PK where the API expects a PK value. If unresolved, send null
    doc_rec_id: docRecPk || null,
    enrollment_no: form.enrollment_id || null,
    second_enrollment_id: form.second_enrollment_id || null,
    student_name: form.name, // server can overwrite from Enrollment
    tr_count: +form.tr || 0,
    ms_count: +form.ms || 0,
    dg_count: +form.dg || 0,
    moi_count: +form.moi || 0,
    backlog_count: +form.backlog || 0,
    status: form.status,
    final_no: form.final_no || null,
    mail_status: form.mail_status,
    eca_required: !!form.eca_required,
    eca_name: form.eca_required ? (form.eca_name || null) : null,
    eca_ref_no: form.eca_required ? (form.eca_ref_no || null) : null,
    eca_send_date: form.eca_required ? (function(s){ if(!s) return null; if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return s; const x = dmyToISO(s); return x || null; })(form.eca_send_date) : null,
    eca_status: form.eca_required ? (form.eca_send_date ? "SENT" : "NOT_SENT") : null,
    eca_resubmit_date: form.eca_required ? (form.eca_resubmit_date || null) : null,
    doc_remark: form.doc_remark || null,
    pay_rec_no: form.pay_rec_no || null,
  };
  const res = await fetch(`/api/verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  // Debug: log what we sent
  // console.debug('createRecord payload', { docRecPk, body });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Create failed");
  }
  await syncDocRecRemark(form, form.doc_remark);
  await loadRecords();
};

export const updateRecord = async (id, form, syncDocRecRemark) => {
  // When updating, DON'T change the doc_rec relationship - it should stay the same
  // Only include doc_rec_id if explicitly creating a new verification
  const body = {
    doc_rec_date: (function(s){ if(!s) return null; if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return s; const x = dmyToISO(s); return x || null; })(form.date),
    vr_done_date: (function(s){ if(!s) return null; if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return s; const x = dmyToISO(s); return x || null; })(form.vr_done_date),
    // DO NOT send doc_rec_id on update - it would change the linked DocRec!
    // doc_rec_id should remain unchanged when editing
    enrollment_no: form.enrollment_id || null,
    second_enrollment_id: form.second_enrollment_id || null,
    student_name: form.name || null,
    tr_count: +form.tr || null,
    ms_count: +form.ms || null,
    dg_count: +form.dg || null,
    moi_count: +form.moi || null,
    backlog_count: +form.backlog || null,
    status: form.status,
    final_no: form.final_no || null,
    mail_status: form.mail_status,
    eca_required: !!form.eca_required,
    eca_name: form.eca_required ? (form.eca_name || null) : null,
    eca_ref_no: form.eca_required ? (form.eca_ref_no || null) : null,
    eca_send_date: form.eca_required ? (function(s){ if(!s) return null; if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return s; const x = dmyToISO(s); return x || null; })(form.eca_send_date) : null,
    eca_status: form.eca_required ? form.eca_status : null,
    eca_resubmit_date: form.eca_required ? (form.eca_resubmit_date || null) : null,
    doc_remark: form.doc_remark || null,
    pay_rec_no: form.pay_rec_no || null,
  };
  const res = await fetch(`/api/verification/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  // Debug: log what we sent and received
  const responseText = await res.text();
  // console.debug('updateRecord payload', { id, body });
  // console.debug('updateRecord response', { status: res.status, responseText });
  if (!res.ok) throw new Error(responseText || "Update failed");
  await syncDocRecRemark(form, form.doc_remark);
};
