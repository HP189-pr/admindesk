import React, { useState, useEffect } from "react";
import Transcript from "./Transcript";
import Migration from "./Migration";
import Provisional from "./Provisional";
import Enrollment from "./Enrollment";
import Degree from "./Degree";
import InstitutionalVerification from "./InstitutionalVerification";
import AdminDashboard from "../components/AdminDashboard";
import ProfileUpdate from "../components/ProfileUpdate";

import menuActions from "../Menu/menuActions";

const WorkArea = ({ selectedSubmenu }) => {
  const [topbarOptions, setTopbarOptions] = useState([]);
  const [selectedTopbarMenu, setSelectedTopbarMenu] = useState(null); // Store selected menu

  // Update topbar options when submenu changes
  useEffect(() => {
    if (selectedSubmenu && menuActions[selectedSubmenu]) {
      setTopbarOptions(menuActions[selectedSubmenu]());
      setSelectedTopbarMenu(null); // Reset when submenu changes
    } else {
      setTopbarOptions([]);
    }
  }, [selectedSubmenu]);

  // Function to render the selected page
  const renderPage = () => {
    switch (selectedSubmenu) {
      case "📑 Enrollment":
        return <Enrollment />  
      case "📜 Transcript":
        return <Transcript />;
      case "📑 Migration":
        return <Migration />;
      case "📋 Provisional":
        return <Provisional />;
      case "🏅 Degree":
        return <Degree />;
      case "🏛️ Institutional Verification":
        return <InstitutionalVerification />;
      case "Admin Panel":
        return <AdminDashboard selectedTopbarMenu={selectedTopbarMenu} />; // ✅ Fixed prop name
      case "Profile Settings":
        return <ProfileUpdate />;
      default:
        return (
          <h1 style={{ padding: "20px", fontSize: "20px", fontWeight: "bold" }}>
            Select a Menu Item
          </h1>
        );
    }
  };

  return (
    <div>
      {/* Topbar Menu */}
      {topbarOptions.length > 0 && (
        <div
          style={{
            background: "#ffffff",
            padding: "10px",
            display: "flex",
            gap: "10px",
          }}
        >
          {topbarOptions.map((option, index) => (
            <button
            key={index}
            className="px-4 py-2 bg-gray-800 text-white rounded hover:text-gray-300 hover:bg-gray-700"
            onClick={() => setSelectedTopbarMenu(option)}
          >
            {option}
          </button>
          ))}
        </div>
      )}

      {/* Main Work Area */}
      <div style={{ padding: "10px" }}>{renderPage()}</div>
    </div>
  );
};

export default WorkArea;
