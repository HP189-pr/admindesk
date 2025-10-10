import React, { useState, useEffect } from "react";
import Verification from "./verification";
import Migration from "./Migration";
import Provisional from "./Provisional";
import Enrollment from "./Enrollment";
import Degree from "./Degree";
import InstitutionalVerification from "./inst-verification";
import DocReceive from "./doc-receive";
import AdminDashboard from "../components/AdminDashboard";
import ProfileUpdate from "../components/ProfileUpdate";
import EmpLeavePage from "./emp-leave.jsx";



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
  else if ((l.includes("document") || l.includes("doc")) && l.includes("receive")) key = "doc_receive";
  else if (l.includes("leave management")) key = "emp_leave";
  else if (l.includes("leave report")) key = "emp_leave_report";
  else if (l.includes("balance certificate")) key = "emp_balance_certificate";
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
      case "doc_receive":
        return (
          <DocReceive
            onToggleSidebar={onToggleSidebar}
            onToggleChatbox={onToggleChatbox}
          />
        );
      case "emp_leave":
        return <EmpLeavePage />;
      case "emp_leave_report":
  // EmpLeaveReport file does not exist; fallback to EmpLeavePage
  return <EmpLeavePage />;
      case "emp_balance_certificate":
        return <EmpBalanceCertificate />;
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

  // Make the work area a column with internal scrolling only
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page content (each page already renders its own topbar and panels). */}
      <div className="flex-1 overflow-auto">
        {renderPage()}
      </div>
    </div>
  );
};

export default WorkArea;
