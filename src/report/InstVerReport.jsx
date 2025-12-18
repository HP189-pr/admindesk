import React, { useEffect, useMemo, useState } from "react";

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
  const [instVerNo, setInstVerNo] = useState(defaultInstVeriNumber || "");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState("");
  const [rangeStartIdx, setRangeStartIdx] = useState("");
  const [rangeEndIdx, setRangeEndIdx] = useState("");

  const recordOptions = useMemo(() => {
    if (!Array.isArray(records)) return [];
    return records
      .map((rec, idx) => {
        const ivNoRaw = rec?.iv_record_no;
        const ivRecordNo = ivNoRaw === null || ivNoRaw === undefined ? "" : String(ivNoRaw).replace(/[^0-9]/g, "");
        const instNo = rec?.inst_veri_number || rec?.inst_veri_no || "";
        const fallback = rec?.doc_rec || `Record ${idx + 1}`;
        const labelParts = [];
        if (ivRecordNo) labelParts.push(ivRecordNo);
        if (instNo) labelParts.push(instNo);
        const label = labelParts.length ? labelParts.join(" / ") : fallback;
        const sortVal = ivRecordNo ? parseInt(ivRecordNo, 10) : 0;
        const createdAt = rec?.inst_veri_date || rec?.doc_rec_date || rec?.createdat || rec?.created_at || null;
        const createdAtTime = createdAt ? new Date(createdAt).getTime() : 0;
        return {
          key: `${ivRecordNo || fallback}-${idx}`,
          label,
          ivRecordNo,
          instVeriNumber: instNo,
          sortVal: Number.isFinite(sortVal) ? sortVal : 0,
          createdAtTime,
        };
      })
      .sort((a, b) => {
        if (a.sortVal !== b.sortVal) return b.sortVal - a.sortVal;
        if (a.createdAtTime !== b.createdAtTime) return b.createdAtTime - a.createdAtTime;
        return b.label.localeCompare(a.label);
      });
  }, [records]);

  useEffect(() => {
    if (defaultIvRecordNo) {
      setSingleIv((prev) => prev || defaultIvRecordNo);
    }
  }, [defaultIvRecordNo]);

  useEffect(() => {
    if (defaultInstVeriNumber) {
      setInstVerNo((prev) => prev || defaultInstVeriNumber);
    }
  }, [defaultInstVeriNumber]);

  useEffect(() => {
    if (!singleIv) {
      if (selectedOptionIdx !== "") {
        setSelectedOptionIdx("");
      }
      return;
    }
    const idx = recordOptions.findIndex((opt) => opt.ivRecordNo === singleIv);
    if (idx >= 0) {
      const idxString = String(idx);
      if (selectedOptionIdx !== idxString) {
        setSelectedOptionIdx(idxString);
      }
      const option = recordOptions[idx];
      if (option?.instVeriNumber && option.instVeriNumber !== instVerNo) {
        setInstVerNo(option.instVeriNumber);
      }
    }
  }, [recordOptions, singleIv, instVerNo, selectedOptionIdx]);

  useEffect(() => {
    if (!rangeStart) {
      if (rangeStartIdx !== "") setRangeStartIdx("");
    } else {
      const idx = recordOptions.findIndex((opt) => opt.ivRecordNo === rangeStart);
      if (idx >= 0) {
        const idxString = String(idx);
        if (rangeStartIdx !== idxString) setRangeStartIdx(idxString);
      }
    }
  }, [rangeStart, rangeStartIdx, recordOptions]);

  useEffect(() => {
    if (!rangeEnd) {
      if (rangeEndIdx !== "") setRangeEndIdx("");
    } else {
      const idx = recordOptions.findIndex((opt) => opt.ivRecordNo === rangeEnd);
      if (idx >= 0) {
        const idxString = String(idx);
        if (rangeEndIdx !== idxString) setRangeEndIdx(idxString);
      }
    }
  }, [rangeEnd, rangeEndIdx, recordOptions]);

  const buildPayload = () => {
    if (mode === "single") {
      const trimmed = (singleIv || "").trim();
      if (!trimmed) {
        setStatus("Select an IV record to continue.");
        return null;
      }
      return { iv_record_no: trimmed };
    }

    const startNum = parseInt(rangeStart, 10);
    const endNum = parseInt(rangeEnd, 10);
    if (!Number.isFinite(startNum) || !Number.isFinite(endNum)) {
      setStatus("Provide numeric values for both start and end record numbers.");
      return null;
    }

    const low = Math.min(startNum, endNum);
    const high = Math.max(startNum, endNum);
    const range = [];
    for (let current = low; current <= high; current += 1) {
      range.push(current);
      if (range.length > MAX_RANGE_PRINT) {
        setStatus(`Please limit batch prints to ${MAX_RANGE_PRINT} records or fewer.`);
        return null;
      }
    }

    if (!range.length) {
      setStatus("Unable to compute record range.");
      return null;
    }

    return { iv_record_nos: range };
  };

  const handleDropdownChange = (event) => {
    const idx = event.target.value;
    if (!idx) {
      setSelectedOptionIdx("");
      setSingleIv("");
      setInstVerNo("");
      return;
    }
    setSelectedOptionIdx(idx);
    const selected = recordOptions[Number(idx)] || null;
    if (!selected) {
      setSingleIv("");
      setInstVerNo("");
      return;
    }
    setSingleIv(selected.ivRecordNo || "");
    setInstVerNo(selected.instVeriNumber || "");
  };

  const handleRangeDropdownChange = (which, idx) => {
    if (which === "start") {
      if (!idx) {
        setRangeStartIdx("");
        setRangeStart("");
        return;
      }
      setRangeStartIdx(idx);
      const selected = recordOptions[Number(idx)];
      setRangeStart(selected?.ivRecordNo || "");
    } else {
      if (!idx) {
        setRangeEndIdx("");
        setRangeEnd("");
        return;
      }
      setRangeEndIdx(idx);
      const selected = recordOptions[Number(idx)];
      setRangeEnd(selected?.ivRecordNo || "");
    }
  };

  const handlePrint = async () => {
    setStatus("");
    const payload = buildPayload();
    if (!payload) return;

    setLoading(true);
    try {
      const headers = {
        ...(typeof authHeadersFn === "function"
          ? authHeadersFn()
          : { "Content-Type": "application/json" }),
        Accept: "application/pdf, application/json;q=0.9, */*;q=0.8",
      };
      const res = await fetch(`${apiBase}/inst-verification/generate-pdf/`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok) {
        if (contentType.includes("application/json")) {
          const errJson = await res.json();
          throw new Error(errJson?.detail || errJson?.error || "Unable to generate PDF");
        }
        const errText = await res.text();
        throw new Error(errText || "Unable to generate PDF");
      }
      if (contentType.includes("application/json")) {
        const errJson = await res.json();
        throw new Error(errJson?.detail || errJson?.error || "Unable to generate PDF");
      }
      const blob = await res.blob();
      if (!blob || blob.size === 0) {
        throw new Error("Received an empty PDF from the server.");
      }
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const fileLabel =
        "iv_record_no" in payload
          ? payload.iv_record_no
          : `${payload.iv_record_nos[0]}_${payload.iv_record_nos[payload.iv_record_nos.length - 1]}`;
      link.href = blobUrl;
      link.download = `Verification_${fileLabel || "Batch"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 4000);
      setStatus("PDF generated. Check your downloads.");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Unable to generate PDF.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border p-6 shadow space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Inst-Verification Report</h3>
          <p className="text-sm text-slate-500">
            Choose single or multiple IV record printing without leaving this tab.
          </p>
        </div>
        <div className="flex gap-2">
          {(["single", "multiple"]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setMode(opt)}
              className={[
                "px-4 py-2 rounded-lg border text-sm font-medium transition",
                mode === opt
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50",
              ].join(" ")}
            >
              {opt === "single" ? "Single Print" : "Multiple Print"}
            </button>
          ))}
        </div>
      </div>

      {mode === "single" ? (
        <div className="space-y-4">
          <div className="space-y-3">
            <label className="label">Select Record (IV Record No / Inst Veri Number)</label>
            <select
              className="input"
              value={selectedOptionIdx}
              onChange={handleDropdownChange}
            >
              <option value="">Choose a record…</option>
              {recordOptions.map((opt, idx) => (
                <option key={opt.key} value={idx}>
                  {opt.label}
                </option>
              ))}
            </select>
            {singleIv && (
              <p className="text-xs text-slate-500">
                Selected: {singleIv}
                {instVerNo ? ` / ${instVerNo}` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handlePrint}
            disabled={loading}
            className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-semibold disabled:opacity-60"
          >
            {loading ? "Preparing PDF…" : "Print"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label">From (Start Record)</label>
              <select
                className="input"
                value={rangeStartIdx}
                onChange={(e) => handleRangeDropdownChange("start", e.target.value)}
              >
                <option value="">Choose start…</option>
                {recordOptions.map((opt, idx) => (
                  <option key={`start-${opt.key}`} value={idx}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {rangeStart && (
                <p className="text-xs text-slate-500">Start record: {rangeStart}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="label">To (End Record)</label>
              <select
                className="input"
                value={rangeEndIdx}
                onChange={(e) => handleRangeDropdownChange("end", e.target.value)}
              >
                <option value="">Choose end…</option>
                {recordOptions.map((opt, idx) => (
                  <option key={`end-${opt.key}`} value={idx}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {rangeEnd && (
                <p className="text-xs text-slate-500">End record: {rangeEnd}</p>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            The backend prints the entire sequence between From and To (max {MAX_RANGE_PRINT} records per batch).
          </p>
          <button
            type="button"
            onClick={handlePrint}
            disabled={loading}
            className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-semibold disabled:opacity-60"
          >
            {loading ? "Preparing PDF…" : "Print Range"}
          </button>
        </div>
      )}

      {status && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {status}
        </div>
      )}
    </section>
  );
};

export default InstVerReport;
