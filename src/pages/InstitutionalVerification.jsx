import React from "react";
import { FaSearch } from "react-icons/fa";

const InstitutionalVerification = () => {
  const verificationData = [{ id: 5, name: "Company XYZ", verified: "Yes" }];

  return (
    <div style={{ padding: "20px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "16px" }}>
        🏛️ Institutional Verification
      </h1>
      <div style={{ marginBottom: "16px" }}>
        <button style={{ padding: "8px 12px", cursor: "pointer", background: "#007bff", color: "white", border: "none", borderRadius: "4px" }}>
          <FaSearch /> Search
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px" }}>
        {verificationData.map((item) => (
          <div key={item.id} style={{ border: "1px solid #ddd", padding: "16px", borderRadius: "8px", boxShadow: "2px 2px 10px rgba(0,0,0,0.1)" }}>
            <p style={{ fontWeight: "bold" }}>Institution: {item.name}</p>
            <p>Verified: {item.verified}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InstitutionalVerification;
