import React, { useState, useEffect } from "react";
import Verification from "./verification";
import Migration from "./Migration";
import Provisional from "./Provisional";
import Enrollment from "./Enrollment";
import Degree from "./Degree";
import InstitutionalVerification from "./Inst-Verification";
import CustomDashboard from './CustomDashboardClean';
import DocReceive from "./doc-receive";
import AdminDashboard from "../components/AdminDashboard";
import ProfileUpdate from "../components/ProfileUpdate";
import EmpLeavePage from "./emp-leave.jsx";
import MailRequestPage from "./mail_request";
import TranscriptRequestPage from "./transcript_request";
import StudentSearch from "./student-search";
import Inventory from "./Inventory";
import InOutRegister from "./inout_register";



// Pages will render their own topbars; WorkArea only decides which page to show.

const WorkArea = ({ selectedSubmenu, onToggleSidebar, onToggleChatbox, isSidebarOpen, isChatboxOpen, setSelectedMenuItem, selectedMenuItem, setSidebarOpen }) => {
  // Keep a per-page ephemeral action if a page needs it
  const [selectedTopbarMenu, setSelectedTopbarMenu] = useState(null);

  // Reset the per-page selection when submenu changes
  useEffect(() => {
    setSelectedTopbarMenu(null);
  }, [selectedSubmenu]);

  // Small navigation handoff: if other pages set admindesk_navigate and admindesk_docrec in localStorage,
  // consume them to switch to the appropriate page and clear the keys.
  useEffect(() => {
    try {
      const nav = localStorage.getItem('admindesk_navigate');
      const docrec = localStorage.getItem('admindesk_docrec');
      if (nav) {
        localStorage.removeItem('admindesk_navigate');
        if (docrec) localStorage.removeItem('admindesk_docrec');
        // rely on selectedSubmenu mapping below by passing explicit keys
        // we use window.location to force a re-eval of selectedSubmenu from Sidebar if needed
        // but instead, when nav exists, programmatically set key mapping by temporarily using selectedSubmenu
        // Set window.selected_for_nav to be consumed by pages
        window.__admindesk_initial_nav = { nav, docrec };
      }
    } catch (e) {}
  }, []);

  // Normalize selectedSubmenu to a page key to handle label variations
  const renderPage = () => {
    // Check both selectedSubmenu and selectedMenuItem for routing
    const s = (selectedSubmenu || selectedMenuItem || "").toString();
    const l = s.toLowerCase();
    console.log('WorkArea render:', { selectedSubmenu, selectedMenuItem, s, l });
    let key = "";
  if (l.includes("dash")) key = "dashboard";
  if (l.includes("enroll")) key = "enrollment";
  // Prefer explicit 'inst' / 'inst-verification' labels so they don't fall through to the generic 'verification' page
  else if (l.includes("inst") || l.includes("inst-") || l.includes("institution")) key = "inst_ver";
  else if (l.includes("verification") && !l.includes("inst") && !l.includes("institution")) key = "verification";
  else if (l.includes("migration")) key = "migration";
  else if (l.includes("provisional")) key = "provisional";
  else if (l.includes("degree")) key = "degree";
  else if ((l.includes("document") || l.includes("doc")) && l.includes("receive")) key = "doc_receive";
  else if ((l.includes("mail") && l.includes("status")) || l.includes("mail request")) key = "mail_request";
  else if (l.includes("transcript")) key = "transcript_request";
  else if (l.includes("student") && l.includes("search")) key = "student_search";
  else if (l.includes("doc") && l.includes("register")) key = "doc_register";
  else if (l.includes("inventory")) key = "inventory";
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
      case "dashboard":
        return (
          <CustomDashboard selectedMenuItem={selectedMenuItem} setSelectedMenuItem={setSelectedMenuItem} isSidebarOpen={isSidebarOpen} setSidebarOpen={setSidebarOpen} />
        );
      case "doc_receive":
        return (
          <DocReceive
            onToggleSidebar={onToggleSidebar}
            onToggleChatbox={onToggleChatbox}
          />
        );
      case "mail_request":
        return (
          <MailRequestPage
            onToggleSidebar={onToggleSidebar}
            onToggleChatbox={onToggleChatbox}
          />
        );
      case "transcript_request":
        return (
          <TranscriptRequestPage
            onToggleSidebar={onToggleSidebar}
            onToggleChatbox={onToggleChatbox}
          />
        );
      case "student_search":
        return <StudentSearch />;
      case "doc_register":
        return (
          <InOutRegister
            onToggleSidebar={onToggleSidebar}
            onToggleChatbox={onToggleChatbox}
          />
        );
      case "inventory":
        return (
          <Inventory
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
