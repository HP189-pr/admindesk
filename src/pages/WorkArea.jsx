import React, { useState, useEffect } from "react";
import Verification from "./verification";
import Migration from "./Migration";
import Provisional from "./Provisional";
import Enrollment from "./Enrollment";
import Degree from "./Degree";
import InstitutionalVerification from "./inst-verification";
import AdminDashboard from "../components/AdminDashboard";
import ProfileUpdate from "../components/ProfileUpdate";

// Pages will render their own topbars; WorkArea only decides which page to show.

const WorkArea = ({ selectedSubmenu, onToggleSidebar, onToggleChatbox, isSidebarOpen, isChatboxOpen }) => {
  // Keep a per-page ephemeral action if a page needs it
  const [selectedTopbarMenu, setSelectedTopbarMenu] = useState(null);

  // Reset the per-page selection when submenu changes
  useEffect(() => {
    setSelectedTopbarMenu(null);
  }, [selectedSubmenu]);

  // Normalize selectedSubmenu to a page key to handle label variations
  const renderPage = () => {
    const s = (selectedSubmenu || "").toString();
    const l = s.toLowerCase();
    let key = "";
  if (l.includes("enroll")) key = "enrollment";
  // Check 'institution' first so it doesn't get caught by generic 'verification'
  else if (l.includes("institution")) key = "inst_ver";
  else if (l.includes("verification") && !l.includes("institution")) key = "verification";
    else if (l.includes("migration")) key = "migration";
    else if (l.includes("provisional")) key = "provisional";
    else if (l.includes("degree")) key = "degree";
    else if (l.includes("admin panel")) key = "admin";
    else if (l.includes("profile")) key = "profile";

    switch (key) {
      case "enrollment":
        return (
          <Enrollment
            selectedTopbarMenu={selectedTopbarMenu}
            setSelectedTopbarMenu={setSelectedTopbarMenu}
            onToggleSidebar={onToggleSidebar}
            onToggleChatbox={onToggleChatbox}
          />
        );
      case "verification":
        return <Verification />;
      case "migration":
        return (
          <Migration
            onToggleSidebar={onToggleSidebar}
            onToggleChatbox={onToggleChatbox}
          />
        );
      case "provisional":
        return (
          <Provisional
            onToggleSidebar={onToggleSidebar}
            onToggleChatbox={onToggleChatbox}
          />
        );
      case "degree":
        return (
          <Degree
            onToggleSidebar={onToggleSidebar}
            onToggleChatbox={onToggleChatbox}
          />
        );
      case "inst_ver":
        return (
          <InstitutionalVerification
            onToggleSidebar={onToggleSidebar}
            onToggleChatbox={onToggleChatbox}
          />
        );
      case "admin":
        return (
          <AdminDashboard
            selectedTopbarMenu={selectedTopbarMenu}
            onToggleSidebar={onToggleSidebar}
            onToggleChatbox={onToggleChatbox}
            onSelectTopbar={(a) => setSelectedTopbarMenu(a)}
          />
        );
      case "profile":
        return <ProfileUpdate />;
      default:
        return (
          <h1 style={{ padding: "20px", fontSize: "20px", fontWeight: "bold" }}>
            Select a Menu Item
          </h1>
        );
    }
  };

  return <div className="">{renderPage()}</div>;
};

export default WorkArea;
