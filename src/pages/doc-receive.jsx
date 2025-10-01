import React, { useEffect, useMemo, useState } from "react";
import { dmyToISO } from "../utils/date";
import PageTopbar from "../components/PageTopbar";

const ACTIONS = ["➕", "🔍", "📄 Report"];

const APPLY_FOR = [
  { value: "VR", label: "Verification" },
  { value: "IV", label: "Institutional Verification" },
  { value: "PR", label: "Provisional" },
  { value: "MG", label: "Migration" },
  { value: "GT", label: "Marks to Grade" },
];

const PAY_BY = [
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank" },
  { value: "UPI", label: "UPI" },
];

export default function DocReceive({ onToggleSidebar, onToggleChatbox }) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [selected, setSelected] = useState("➕");

  const [form, setForm] = useState({
    apply_for: "VR",
    pay_by: "CASH",
    pay_amount: 0,

    // derived/readonly from server after create
    doc_rec_id: "",
    pay_rec_no_pre: "",
    pay_rec_no: "",

    // verification specific
    enrollment: "",
    second_enrollment: "",
    student_name: "",
    institute_id: "",
    sub_course: "",
    main_course: "",
    tr: 0, ms: 0, dg: 0, moi: 0, backlog: 0,
    eca_required: false,

    // inst-verify fields
    rec_by: "",
    rec_inst_name: "",
  rec_inst_suggestions: [],
  rec_inst_loading: false,

    // provisional / migration
    prv_number: "",
    prv_date: "", // Change type to text for dd-mm-yyyy format
    passing_year: "",
    mg_number: "",
    mg_date: "", // Change type to text for dd-mm-yyyy format
    exam_year: "",
    admission_year: "",
  });

  const handleChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const authHeaders = () => {
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const clamp3 = (n) => {
    const x = Math.max(0, Math.min(999, Number.isNaN(+n) ? 0 : +n));
    return x;
  };

  const onSelect = (a) => {
    setSelected((cur) => (cur === a ? a : a));
    setPanelOpen(true);
  };

  const createDocRec = async () => {
    const payload = {
      apply_for: form.apply_for,
      pay_by: form.pay_by,
      pay_amount: +form.pay_amount || 0,
      pay_rec_no: form.pay_rec_no || null,
    };
    const res = await fetch("/api/docrec/", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || "Failed to create doc rec");
    }
    const row = await res.json();
    setForm((f) => ({
      ...f,
      doc_rec_id: row.doc_rec_id,
      pay_rec_no_pre: row.pay_rec_no_pre,
    }));
    return row;
  };

  // basic UI only; backend integration of sub-flows to be completed per endpoint availability

  const submit = async () => {
    // 1) Create doc_rec
    const rec = await createDocRec();

    // 2) Depending on apply_for, create related minimal record
    if (form.apply_for === "VR") {
      const payload = {
        enrollment: form.enrollment || null,
        second_enrollment: form.second_enrollment || null,
        student_name: form.student_name || null,
        tr_count: clamp3(form.tr),
        ms_count: clamp3(form.ms),
        dg_count: clamp3(form.dg),
        moi_count: clamp3(form.moi),
        backlog_count: clamp3(form.backlog),
        pay_rec_no: rec.pay_rec_no || null,
        doc_rec_id: rec.id,
      };
      await fetch("/api/verification/", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
    } else if (form.apply_for === "IV") {
      const payload = {
        doc_rec_id: rec.id,
        rec_by: form.rec_by || null,
        rec_inst_name: form.rec_inst_name || null,
      };
      await fetch("/api/inst-verification-main/", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
    } else if (form.apply_for === "PR") {
      const payload = {
        doc_rec: rec.id,
        enrollment: form.enrollment || null,
        student_name: form.student_name || "",
        institute: form.institute_id || null,
        subcourse: form.sub_course || null,
        maincourse: form.main_course || null,
        class_obtain: form.class_obtain || null,
        prv_number: form.prv_number,
        prv_date: dmyToISO(form.prv_date) || null,
        passing_year: form.passing_year,
        prv_status: "Pending",
        pay_rec_no: rec.pay_rec_no || "",
      };
      await fetch("/api/provisional/", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
    } else if (form.apply_for === "MG") {
      const payload = {
        doc_rec: rec.id,
        enrollment: form.enrollment || null,
        student_name: form.student_name || "",
        institute: form.institute_id || null,
        subcourse: form.sub_course || null,
        maincourse: form.main_course || null,
        mg_number: form.mg_number,
        mg_date: dmyToISO(form.mg_date) || null,
        exam_year: form.exam_year,
        admission_year: form.admission_year,
        mg_status: "Pending",
        pay_rec_no: rec.pay_rec_no || "",
      };
      await fetch("/api/migration/", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
    }

    alert("Saved");
  };

  const leftSlot = (
    <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-sky-600 text-white text-xl">📥</div>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 h-full">
      <PageTopbar
        title="Doc Receive"
        actions={ACTIONS}
        selected={selected}
        onSelect={onSelect}
        onToggleSidebar={onToggleSidebar}
        onToggleChatbox={onToggleChatbox}
        actionsOnLeft
        leftSlot={leftSlot}
        rightSlot={<a href="/" className="px-3 py-2 rounded-lg bg-slate-800 text-white">🏠 Home</a>}
      />

      {/* Collapsible Action Box */}
      <div className="border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
          <div className="font-semibold">{selected ? `${selected} Panel` : "Action Panel"}</div>
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
          >
            {panelOpen ? "▲" : "▼"} {panelOpen ? "Collapse" : "Expand"}
          </button>
        </div>

        {panelOpen && selected === "➕" && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* apply_for */}
            <div>
              <label className="text-sm">Apply For</label>
              <select className="w-full border rounded-lg p-2" value={form.apply_for} onChange={(e)=>handleChange("apply_for", e.target.value)}>
                {APPLY_FOR.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </div>
            {/* pay_by */}
            <div>
              <label className="text-sm">Pay By</label>
              <select className="w-full border rounded-lg p-2" value={form.pay_by} onChange={(e)=>handleChange("pay_by", e.target.value)}>
                {PAY_BY.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </div>
            {/* pay_amount */}
            <div>
              <label className="text-sm">Amount</label>
              <input type="number" className="w-full border rounded-lg p-2" value={form.pay_amount} onChange={(e)=>handleChange("pay_amount", e.target.value)} />
            </div>
            {/* pay_rec_no */}
            <div>
              <label className="text-sm">Pay Receipt No (optional)</label>
              <input className="w-full border rounded-lg p-2" value={form.pay_rec_no} onChange={(e)=>handleChange("pay_rec_no", e.target.value)} />
            </div>

            {/* If VR show verification options (simplified UI as placeholder) */}
            {form.apply_for === 'VR' && (
              <>
                <div className="md:col-span-2">
                  <label className="text-sm">Enrollment No</label>
                  <input className="w-full border rounded-lg p-2" value={form.enrollment} onChange={(e)=>handleChange("enrollment", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm">2nd Enrollment</label>
                  <input className="w-full border rounded-lg p-2" value={form.second_enrollment} onChange={(e)=>handleChange("second_enrollment", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm">Student Name</label>
                  <input className="w-full border rounded-lg p-2" value={form.student_name} onChange={(e)=>handleChange("student_name", e.target.value)} />
                </div>

                <div>
                  <label className="text-sm">TR</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2" value={form.tr} onChange={(e)=>handleChange("tr", clamp3(e.target.value))} />
                </div>
                <div>
                  <label className="text-sm">MS</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2" value={form.ms} onChange={(e)=>handleChange("ms", clamp3(e.target.value))} />
                </div>
                <div>
                  <label className="text-sm">DG</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2" value={form.dg} onChange={(e)=>handleChange("dg", clamp3(e.target.value))} />
                </div>
                <div>
                  <label className="text-sm">MOI</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2" value={form.moi} onChange={(e)=>handleChange("moi", clamp3(e.target.value))} />
                </div>
                <div>
                  <label className="text-sm">Backlog</label>
                  <input type="number" min="0" max="999" className="w-full border rounded-lg p-2" value={form.backlog} onChange={(e)=>handleChange("backlog", clamp3(e.target.value))} />
                </div>
              </>
            )}

            {/* If inst-verification, rec_by & rec_inst_name */}
            {form.apply_for === 'IV' && (
              <>
                <div>
                  <label className="text-sm">Received By</label>
                  <select className="w-full border rounded-lg p-2" value={form.rec_by} onChange={(e)=>handleChange("rec_by", e.target.value)}>
                    <option value="">--</option>
                    <option value="Mail">Mail</option>
                    <option value="Post">Post</option>
                    <option value="Self">Self</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm">Rec Inst Name (type 3 chars)</label>
                  <div className="relative">
                    <input
                      className="w-full border rounded-lg p-2"
                      value={form.rec_inst_name}
                      onChange={async (e)=>{
                        const v = e.target.value;
                        handleChange("rec_inst_name", v);
                        if ((v||"").trim().length >= 3) {
                          try {
                            const res = await fetch(`/api/inst-verification-main/search-rec-inst?q=${encodeURIComponent(v.trim())}`, { headers: { ...authHeaders() } });
                            if (res.ok) {
                              const items = await res.json();
                              handleChange("rec_inst_suggestions", items || []);
                            }
                          } catch {}
                        } else {
                          handleChange("rec_inst_suggestions", []);
                        }
                      }}
                    />
                    {Array.isArray(form.rec_inst_suggestions) && form.rec_inst_suggestions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg max-h-60 overflow-auto shadow">
                        {form.rec_inst_suggestions.map((s)=> (
                          <div key={s.id} className="px-3 py-2 hover:bg-gray-50 cursor-pointer" onClick={()=>{
                            handleChange("rec_inst_name", s.name);
                            handleChange("rec_inst_suggestions", []);
                          }}>{s.name}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Provisional / Migration minimal UI */}
            {form.apply_for === 'PR' && (
              <>
                <div>
                  <label className="text-sm">PRV No</label>
                  <input className="w-full border rounded-lg p-2" value={form.prv_number} onChange={(e)=>handleChange("prv_number", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm">PRV Date</label>
                  <input type="text" className="w-full border rounded-lg p-2" value={form.prv_date} onChange={(e)=>handleChange("prv_date", e.target.value)} placeholder="dd-mm-yyyy" />
                </div>
                <div>
                  <label className="text-sm">Passing Year</label>
                  <input className="w-full border rounded-lg p-2" value={form.passing_year} onChange={(e)=>handleChange("passing_year", e.target.value)} />
                </div>
              </>
            )}

            {form.apply_for === 'MG' && (
              <>
                <div>
                  <label className="text-sm">MG No</label>
                  <input className="w-full border rounded-lg p-2" value={form.mg_number} onChange={(e)=>handleChange("mg_number", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm">MG Date</label>
                  <input type="text" className="w-full border rounded-lg p-2" value={form.mg_date} onChange={(e)=>handleChange("mg_date", e.target.value)} placeholder="dd-mm-yyyy" />
                </div>
                <div>
                  <label className="text-sm">Exam Year</label>
                  <input className="w-full border rounded-lg p-2" value={form.exam_year} onChange={(e)=>handleChange("exam_year", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm">Admission Year</label>
                  <input className="w-full border rounded-lg p-2" value={form.admission_year} onChange={(e)=>handleChange("admission_year", e.target.value)} />
                </div>
              </>
            )}

            <div className="md:col-span-4 flex justify-end">
              <button className="px-4 py-2 rounded-lg bg-emerald-600 text-white" onClick={async()=>{
                try { await submit(); alert('Saved!'); } catch(e){ alert(e.message || 'Failed'); }
              }}>Save</button>
            </div>
          </div>
        )}
      </div>

      {/* Placeholder table of latest DocRecs could go below; wire as needed */}
      <div className="border rounded-2xl p-3">
        <div className="font-semibold mb-2">Recent Receipts</div>
        <div className="text-sm text-gray-500">Coming soon…</div>
      </div>
    </div>
  );
}
