import React, { useEffect, useState } from "react";
import API from "../api/axiosInstance";

const BATCH_OPTIONS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

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
    <div className="p-4">
      <h2><b>Enrollment Summary (Subcourse × Batch)</b></h2>

      {/* FILTER PANEL */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <div>
          <b>Select Batch</b><br />
          <select
            multiple
            value={selectedBatches}
            onChange={(e) =>
              setSelectedBatches(
                Array.from(e.target.selectedOptions, o => Number(o.value))
              )
            }
            style={{ minWidth: 220, height: 140 }}
          >
            {BATCH_OPTIONS.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => setSelectedBatches([...BATCH_OPTIONS])}>Select All</button>
            <button onClick={() => setSelectedBatches([])} style={{ marginLeft: 8 }}>
              Clear
            </button>
          </div>
        </div>

        <div>
          <button onClick={downloadExcel} disabled={!columns.length}>
            Download Excel
          </button>
        </div>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}

      {/* RESULT PANEL */}
      {columns.length > 0 && (
        <table border="1" cellPadding="8">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i}>
                  {c === "subcourse_name" ? "Subcourse" : c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isTotal = row.subcourse_name === "GRAND TOTAL";
              return (
                <tr
                  key={i}
                  style={isTotal ? { fontWeight: "bold", background: "#eee" } : {}}
                >
                  {columns.map((c, j) => (
                    <td key={j}>{row[c]}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default EnrollmentState;
