import React from "react";
import AdminDashboard from "../components/AdminDashboard.jsx"
import ProfileUpdate from "../components/ProfileUpdate.jsx";



const WorkArea = ({ selectedMenuItem }) => {
 
  switch (selectedMenuItem) {
    case "Profile":
      return <ProfileUpdate />;
    case "Transcript":
      return <div>📄 Transcript Page</div>;
    case "Migration":
      return <div>🚀 Migration Page</div>;
    case "Attendance":
      return <div>📅 Attendance Page</div>;
    case "Payroll":
      return <div>💰 Payroll Page</div>;
    case "AdminPanel":
        return <AdminDashboard />;
    default:
      return <h1 className="text-xl font-bold">Select a Menu Item</h1>;
  }
};

export default WorkArea;
