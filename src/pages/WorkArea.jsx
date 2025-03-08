import React from "react";
import AdminDashboard from "../components/AdminDashboard.jsx";
import ProfileUpdate from "../components/ProfileUpdate.jsx";
import HomeDashboard from "./HomeDashboard.jsx"

const WorkArea = ({ selectedMenuItem, selectedAdminMenuItem }) => {
  if (!selectedMenuItem) {
      return <h1 className="text-xl font-bold">🏠 Welcome to the Dashboard</h1>;
  }

  switch (selectedMenuItem) {
      case "Dashboard":
          return <HomeDashboard />;
      case "Profile Settings":
          return <ProfileUpdate />;
      case "Transcript":
          return <div>📄 Transcript Page</div>;
      case "Migration":
          return <div>🚀 Migration Page</div>;
      case "Attendance":
          return <div>📅 Attendance Page</div>;
      case "Payroll":
          return <div>💰 Payroll Page</div>;
      case "Admin Panel":
          // 🔥 Pass selectedAdminMenuItem to AdminDashboard
          return <AdminDashboard selectedTopbarItem={selectedAdminMenuItem} />;
      default:
          console.warn(`Unhandled menu item: ${selectedMenuItem}`);
          return <h1 className="text-xl font-bold">Select a Menu Item</h1>;
  }
};

export default WorkArea;
