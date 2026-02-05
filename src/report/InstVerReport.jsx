import React, { useMemo, useState, useRef } from "react";
import { isoToDMY } from "../utils/date";
import { printElement } from "../utils/print"; // 👈 NEW
import { generateInstLetterPDF, fetchInstLetterStudents } from "../services/inst-letterservice";

const MAX_RANGE_PRINT = 300;

const InstVerReport = ({
  apiBase = "/api",
  authHeadersFn,
  defaultIvRecordNo = "",
  defaultInstVeriNumber = "",
  records = [],
}) => {
  const [mode, setMode] = useState("single");
  const [singleIv, setSingleIv] = useState(defaultIvRecordNo || "");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [printData, setPrintData] = useState([]);

  // 👇 REF FOR PRINT.JS
  const printRef = useRef(null);

  /* ---------------- record options ---------------- */

  const recordOptions = useMemo(() => {
    if (!Array.isArray(records)) return [];
    return records
      .map((rec, idx) => {
        const ivNoRaw = rec?.iv_record_no;
        const ivRecordNo =
          ivNoRaw === null || ivNoRaw === undefined
            ? ""
            : String(ivNoRaw).replace(/[^0-9]/g, "");

        const instNo = rec?.inst_veri_number || "";
        const labelParts = [];
        if (ivRecordNo) labelParts.push(ivRecordNo);
        if (instNo) labelParts.push(instNo);

        return {
          key: `${ivRecordNo || idx}`,
          label: labelParts.join(" / "),
          ivRecordNo,
          instVeriNumber: instNo,
          idx,
        };
      });
  }, [records]);

  /* ---------------- backend PDF (UNCHANGED) ---------------- */

  const buildPayload = () => {
    if (mode === "single") {
      if (!singleIv) {
        setStatus("Select an IV record to continue.");
        return null;
      }
      return { iv_record_no: singleIv };
    }

    const start = Number(rangeStart);
    const end = Number(rangeEnd);
    if (!start || !end) {
      setStatus("Select valid start and end records.");
      return null;
    }

    const list = [];
    for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
      list.push(i);
      if (list.length > MAX_RANGE_PRINT) {
        setStatus(`Max ${MAX_RANGE_PRINT} records allowed.`);
        return null;
      }
    }
    return { iv_record_nos: list };
  };

  const handleBackendPrint = async () => {
    setStatus("");
    const payload = buildPayload();
    if (!payload) return;

    setLoading(true);
    try {
      const blob = await generateInstLetterPDF(payload, { apiBase, headersFn: authHeadersFn });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Verification.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setStatus(e.message || "Unable to generate PDF");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- NEW: FRONTEND PRINT ---------------- */
  const docRecId = (rec = {}) =>
    typeof rec?.doc_rec === "string" ? rec.doc_rec : rec?.doc_rec?.doc_rec_id || rec?.doc_rec?.id || rec?.doc_rec || "";

  const selectedRecords =
    mode === "single"
      ? records.filter((r) => String(r.iv_record_no) === String(singleIv))
      : records.filter((r) => {
          const iv = Number(r.iv_record_no);
          return iv >= Number(rangeStart) && iv <= Number(rangeEnd);
        });

  const handleFrontendPrint = async () => {
    setStatus("");
    if (!selectedRecords.length) {
      setStatus("Select at least one record to print.");
      return;
    }

    setPrintBusy(true);
    try {
      const enriched = [];
      for (const rec of selectedRecords) {
        const docRec = docRecId(rec);
        const students = docRec
          ? await fetchInstLetterStudents({ docRec, apiBase, headersFn: authHeadersFn })
          : [];

        const sorted = [...students].sort((a, b) => (a?.sr_no || 0) - (b?.sr_no || 0));
        enriched.push({ ...rec, students: sorted });
      }

      setPrintData(enriched);

      // Wait a frame so the hidden print area renders before calling print
      await new Promise((resolve) => requestAnimationFrame(resolve));

      // Match backend template: A4 portrait, roughly 10mm/5mm/10mm/10mm margins handled in print styles
      printElement(printRef.current, { orientation: "portrait", pageSize: "A4", marginMm: 10 });
    } catch (e) {
      setStatus(e?.message || "Unable to prepare print view");
    } finally {
      setPrintBusy(false);
    }
  };

  /* ---------------- records to print ---------------- */

  const printableRecords = printData;

  /* ---------------- UI ---------------- */

  const hasRecords = recordOptions.length > 0;

  return (
    <div className="p-4 md:p-6 space-y-4 h-full bg-slate-100">
    <section className="bg-white rounded-xl border p-6 shadow space-y-6">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Inst-Letter Report</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setMode("single")}
            className={`px-3 py-1 border rounded ${mode === "single" ? "bg-indigo-600 text-white" : ""}`}
          >
            Single
          </button>
          <button
            onClick={() => setMode("multiple")}
            className={`px-3 py-1 border rounded ${mode === "multiple" ? "bg-indigo-600 text-white" : ""}`}
          >
            Multiple
          </button>
        </div>
      </div>

      {!hasRecords && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
          No records loaded. Fetch records first, then pick the IV numbers to print.
        </div>
      )}

      {/* MODE-SPECIFIC FIELDS */}
      {mode === "single" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <div className="text-sm font-medium">IV record number</div>
            <select
              value={singleIv}
              onChange={e => setSingleIv(e.target.value)}
              className="w-full border rounded px-3 py-2"
              disabled={!hasRecords}
            >
              <option value="">Select record</option>
              {recordOptions.map(opt => (
                <option key={opt.key} value={opt.ivRecordNo}>
                  {opt.label || opt.ivRecordNo || opt.key}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <div className="text-sm font-medium">Start IV record number</div>
            <select
              value={rangeStart}
              onChange={e => setRangeStart(e.target.value)}
              className="w-full border rounded px-3 py-2"
              disabled={!hasRecords}
            >
              <option value="">Select start record</option>
              {recordOptions.map(opt => (
                <option key={`${opt.key}-start`} value={opt.ivRecordNo}>
                  {opt.label || opt.ivRecordNo || opt.key}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-sm font-medium">End IV record number</div>
            <select
              value={rangeEnd}
              onChange={e => setRangeEnd(e.target.value)}
              className="w-full border rounded px-3 py-2"
              disabled={!hasRecords}
            >
              <option value="">Select end record</option>
              {recordOptions.map(opt => (
                <option key={`${opt.key}-end`} value={opt.ivRecordNo}>
                  {opt.label || opt.ivRecordNo || opt.key}
                </option>
              ))}
            </select>
          </label>

          <div className="text-xs text-slate-600 sm:col-span-2">
            Pick start and end records from the list (max {MAX_RANGE_PRINT} records per print job).
          </div>
        </div>
      )}

      {/* ACTION BUTTONS */}
      <div className="flex gap-3">
        {/* OLD BUTTON (BACKEND) */}
        <button
          onClick={handleBackendPrint}
          disabled={loading || !hasRecords}
          className="bg-indigo-600 text-white px-4 py-2 rounded"
        >
          {loading ? "Generating…" : "Print (Backend PDF)"}
        </button>

        {/* NEW BUTTON (FRONTEND PRINT.JS) */}
        <button
          onClick={handleFrontendPrint}
          disabled={!hasRecords || printBusy}
          className="bg-emerald-600 text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {printBusy ? "Preparing…" : "Print (Browser / No Setup)"}
        </button>
      </div>

      {status && (
        <div className="text-sm text-red-600">{status}</div>
      )}

      {/* ---------------- HIDDEN PRINT AREA ---------------- */}
      <div style={{ display: "none" }}>
        <div ref={printRef} className="print-area">
          <style>
            {`
              @page { size: A4; margin: 2in 5mm 10mm 10mm; }
              body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; color: #000; font-size: 11pt; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .letter { page-break-after: always; }
              .letter:last-child { page-break-after: auto; }
              .header { margin-bottom: 8px; }
              .letter-meta { display: flex; justify-content: space-between; align-items: flex-start; font-weight: bold; font-size: 13pt; }
              .meta-right { text-align: right; }
              .issuer { text-align: right; line-height: 1.4; margin-top: 10px; font-weight: bold; font-size: 10pt; }
              .recipient { margin-top: 8px; font-weight: bold; font-size: 14pt; line-height: 1.6; }
              .recipient .lines { font-weight: normal; font-size: 11pt; }
              .subject { margin: 2px 0 2px 0; font-weight: bold; }
              .ref { margin: 0 0 2px 0; font-weight: bold; }
              .text { line-height: 1.5; text-align: justify; font-size: 11pt; }
              table { width: 100%; border-collapse: collapse; margin-top: 8px; }
              th, td { border:1px solid #999; padding:5px 8px; white-space:normal; word-break:break-word; }
              th { background: #e8e8e8; text-align: center; vertical-align: middle; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              td { text-align: center; vertical-align: top; }
              thead { display: table-header-group; }
              tr { page-break-inside: avoid; }
              td.cell-label { text-align: left; }
              .cell-strong { font-weight: bold; }
              .footer { position: fixed; bottom: 10mm; left: 0; right: 0; text-align: center; font-size: 10pt; }
            `}
          </style>

          {/* Spacer to reach ~2in top margin after print host padding (10mm) */}
          <div style={{ height: "40.8mm" }} />

          {printableRecords.map((rec, idx) => {
            const refNo = rec?.inst_veri_number ? `KSV/${rec.inst_veri_number}` : "";
            const refDate = rec?.inst_veri_date ? isoToDMY(rec.inst_veri_date) : "";
            const recPin = rec?.rec_inst_pin ? rec.rec_inst_pin : "";
            const docTypes = rec?.doc_types || "Certificate";
            const docLabel = docTypes.toLowerCase().includes("certificate") ? docTypes : `${docTypes} Certificate`;
            const students = rec?.students || [];
            const credentialHeader = (() => {
              let header = "";
              for (const s of students) {
                const val = s?.type_of_credential ? String(s.type_of_credential).trim() : "";
                if (val) {
                  header = val;
                  break;
                }
              }
              if (!header && rec?.type_of_credential) {
                header = String(rec.type_of_credential).trim();
              }
              return header || "Type of Credential";
            })();

            return (
              <div className="letter" key={`${idx}-${rec?.id || refNo || idx}`}>
                <div className="header">
                  <div className="letter-meta">
                    <div className="meta-left">{refNo && <div>Ref: {refNo}</div>}</div>
                    <div className="meta-right">{refDate && <div>{refDate}</div>}</div>
                  </div>
                </div>

                <div className="issuer">
                  <div>Office of the Registrar,</div>
                  <div>Kadi Sarva Vishwavidyalaya,</div>
                  <div>Sector -15,</div>
                  <div>Gandhinagar- 382015</div>
                </div>

                <div className="recipient" style={{ lineHeight: 1.6 }}>
                  {rec?.rec_inst_name && <div style={{ fontSize: "11pt" }}>{rec.rec_inst_name}</div>}
                  <div className="lines">
                    {rec?.rec_inst_sfx_name && <div>{rec.rec_inst_sfx_name}</div>}
                    {rec?.rec_inst_address_1 && <div>{rec.rec_inst_address_1}</div>}
                    {(rec?.rec_inst_address_2 || rec?.rec_inst_location || rec?.rec_inst_city || recPin) && (
                      <div>
                        {[rec.rec_inst_address_2, rec.rec_inst_location, rec.rec_inst_city, recPin]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    )}
                  </div>
                </div>

                <div className="subject" style={{ margin: "6px 0 2px 0", marginLeft: "0.7in" }}>

                              {/* Footer contact info for all pages */}
                              <div className="footer">
                                Email: verification@ksv.ac.in&nbsp;&nbsp;&nbsp;Contact No.: 9408801690 | 079-23244690
                              </div>
                  Sub: Educational Verification of <strong>{docLabel}</strong>.
                </div>

                <div className="ref" style={{ margin: 0, marginLeft: "0.7in" }}>
                  Ref: <span>Your Ref </span>
                  {rec?.inst_ref_no ? <strong> {rec.inst_ref_no}</strong> : null}
                  {rec?.rec_by ? <strong> {rec.rec_by}</strong> : null}
                  {!rec?.inst_ref_no && !rec?.rec_by ? <strong> N/A</strong> : null}
                  {rec?.ref_date && <span> Dated on <strong>{isoToDMY(rec.ref_date)}</strong></span>}
                </div>

                <div style={{ height: "8px" }} />

                <div className="text" style={{ lineHeight: 1.5 }}>
                  Regarding the subject and reference mentioned above, I am delighted to confirm that upon thorough verification, the documents pertaining to the candidate in question have been meticulously examined and found to be in accordance with our office records. Below are the details of the provided <strong>{docLabel}</strong>:
                </div>

                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "8%" }}>No.</th>
                      <th style={{ width: "32%" }}>Candidate Name</th>
                      <th style={{ width: "22%" }}>Enrollment Number</th>
                      <th style={{ width: "20%" }}>Branch</th>
                        <th style={{ width: "18%" }}>{credentialHeader}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.length ? (
                      students.map((s, i) => (
                        <tr key={`${i}-${s?.id || s?.enrollment || s?.enrollment_no_text || ""}`}>
                          <td>{i + 1}</td>
                          <td className="cell-label cell-strong">{s?.student_name || ""}</td>
                          <td className="cell-strong">{s?.enrollment_no || s?.enrollment_no_text || s?.enrollment || ""}</td>
                          <td className="cell-strong">{s?.iv_degree_name || s?.branch || ""}</td>
                          <td className="cell-strong">{s?.month_year || s?.type_of_credential || ""}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" style={{ textAlign: "center", padding: "20px" }}>
                          No student records found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div style={{ marginTop: "10px" }}>
                  <strong>Remark:</strong> The above record has been verified and found correct as per university records.
                </div>

                <div style={{ marginTop: "15px" }}>
                  Should you require any additional information or have further inquiries, please do not hesitate to reach out to us.
                </div>

                <div style={{ marginTop: "90px", fontSize: "10pt" }}>Registrar</div>
              </div>
            );
          })}
        </div>
      </div>

    </section>
    </div>
  );
};

export default InstVerReport;
