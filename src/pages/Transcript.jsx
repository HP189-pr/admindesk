import React from "react";
import { FaPlus, FaEdit, FaSearch } from "react-icons/fa";

const Transcript = () => {
  const transcriptData = [{ id: 1, name: "John Doe", grade: "A" }];

  return (
    <div style={{ padding: "20px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "16px" }}>
        📜 Transcript
      </h1>
      <div style={{ marginBottom: "16px" }}>
        <button style={{ padding: "8px 12px", marginRight: "8px", cursor: "pointer", background: "#28a745", color: "white", border: "none", borderRadius: "4px" }}>
          <FaPlus /> Add
        </button>
        <button style={{ padding: "8px 12px", marginRight: "8px", cursor: "pointer", background: "#ffc107", color: "black", border: "none", borderRadius: "4px" }}>
          <FaEdit /> Edit
        </button>
        <button style={{ padding: "8px 12px", cursor: "pointer", background: "#007bff", color: "white", border: "none", borderRadius: "4px" }}>
          <FaSearch /> Search
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px" }}>
        {transcriptData.map((item) => (
          <div key={item.id} style={{ border: "1px solid #ddd", padding: "16px", borderRadius: "8px", boxShadow: "2px 2px 10px rgba(0,0,0,0.1)" }}>
            <p style={{ fontWeight: "bold" }}>Name: {item.name}</p>
            <p>Grade: {item.grade}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Transcript;
