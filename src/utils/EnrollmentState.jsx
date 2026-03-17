import React, { useEffect, useState } from "react";
import API from "../api/axiosInstance";

const BASE_BATCH_START = 2007;
const BASE_BATCH_END = 2025;

const getBatchOptions = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const isJuneOrLater = now.getMonth() >= 5;
  const endYear = isJuneOrLater ? Math.max(BASE_BATCH_END, currentYear) : BASE_BATCH_END;

  return Array.from(
    { length: endYear - BASE_BATCH_START + 1 },
    (_, index) => BASE_BATCH_START + index
  );
};

const BATCH_OPTIONS = getBatchOptions();

const EnrollmentState = () => {
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedBatches, setSelectedBatches] = useState(() => [...BATCH_OPTIONS]);

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatches]);

  const fetchReport = async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      selectedBatches.forEach((b) => params.append("batch", b));

      const res = await API.get("/api/enrollment-stats/", { params });

      setColumns(res.data?.columns || []);
      setRows(res.data?.data || []);
    } catch (err) {
      setColumns([]);
      setRows([]);
      setError("Failed to load enrollment report");
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = async () => {
    try {
      const params = new URLSearchParams();
      params.append("export", "excel");
      selectedBatches.forEach((b) => params.append("batch", b));

      const res = await API.get("/api/enrollment-stats/", {
        params,
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "Enrollment_By_Subcourse_Batch.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Excel download failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="action-panel-shell">
        <div className="action-panel-header">
          <div className="action-panel-title">Enrollment Summary (Subcourse × Batch)</div>
          <button
            type="button"
            onClick={downloadExcel}
            disabled={!columns.length}
            className="save-button-compact"
          >
            Download Excel
          </button>
        </div>

        <div className="action-panel-body">
          <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] gap-4 items-start">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Select Batch</label>
              <select
                multiple
                value={selectedBatches}
                onChange={(e) =>
                  setSelectedBatches(Array.from(e.target.selectedOptions, (option) => Number(option.value)))
                }
                className="min-h-[180px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {BATCH_OPTIONS.map((batch) => (
                  <option key={batch} value={batch}>
                    {batch}
                  </option>
                ))}
              </select>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="edit-button-compact"
                  onClick={() => setSelectedBatches([...BATCH_OPTIONS])}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="reset-button-compact"
                  onClick={() => setSelectedBatches([])}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <div className="font-semibold text-slate-700">Selected batches</div>
              <div className="mt-1">
                {selectedBatches.length ? selectedBatches.join(', ') : 'No batch selected'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">Loading…</div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && columns.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  {columns.map((column, index) => (
                    <th
                      key={column}
                      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700 ${
                        index === 0 ? 'text-left' : 'text-center whitespace-nowrap'
                      }`}
                    >
                      {column === 'subcourse_name' ? 'Subcourse' : column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                {rows.map((row, rowIndex) => {
                  const isTotal = row.subcourse_name === 'GRAND TOTAL';
                  return (
                    <tr
                      key={rowIndex}
                      className={`border-t border-slate-200 ${isTotal ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'}`}
                    >
                      {columns.map((column, colIndex) => (
                        <td
                          key={`${rowIndex}-${column}`}
                          className={`px-4 py-2.5 text-slate-700 ${
                            colIndex === 0 ? 'text-left' : 'text-center whitespace-nowrap'
                          }`}
                        >
                          {row[column] ?? '-'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && columns.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          No records found for the selected batches.
        </div>
      )}
    </div>
  );
};

export default EnrollmentState;
