import React, { useEffect, useState } from "react";
import PageTopbar from "./PageTopbar";
import UserManagement from "../hooks/UserManagement";
import UserRights from "../hooks/UserRights";
import AddModule from "../hooks/AddModule";
import Addcourse from "../hooks/Addcourse";
import { useAuth } from "../hooks/AuthContext";
import AuthUpload from "../hooks/AuthUpload.jsx";
import DataAnalysis from "../hooks/DataAnalysis.jsx";

const AdminDashboard = ({ selectedTopbarMenu, onToggleSidebar, onToggleChatbox, onSelectTopbar }) => {
  const [users, setUsers] = useState([]);
  const { fetchUsers } = useAuth();

  // Minimal placeholders for permissions until backend endpoints are wired
  const fetchUserPermissions = async (userId) => {
    // TODO: Wire to /api/userpermissions/ aggregated view
    return { menus: {}, modules: [] };
  };
  const updateUserPermission = async (userId, payload) => {
    // TODO: Persist to backend by creating/updating rows in api_userpermissions
    return true;
  };

  // 🔹 Fetch users when the component mounts
  useEffect(() => {
    async function loadUsers() {
      const userList = await fetchUsers();
      setUsers(userList);
    }
    loadUsers();
  }, []);

  // 🔹 Render Content Based on Selected Menu
  const renderContent = () => {
    switch (selectedTopbarMenu) {
      case "User Management":
        return <UserManagement selectedTopbarMenu={selectedTopbarMenu} />;
      
      case "User Rights":
        return (
          <UserRights
            users={users}  // Pass users list
            fetchUserPermissions={fetchUserPermissions} 
            updateUserPermission={updateUserPermission} 
          />
        );

      case "Add Module":
        return <AddModule selectedTopbarMenu={selectedTopbarMenu} />;
      case "Add Course":
        return <Addcourse />;
      case "Upload":
        return <AuthUpload />;
      case "Data Analysis":
        return <DataAnalysis />;
      
      default:
        return <h2 className="text-xl font-semibold">Please select an option.</h2>;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageTopbar
        title="Admin Panel"
        actions={["User Management", "User Rights", "Add Module", "Add Course", "Upload", "Data Analysis"]}
        selected={selectedTopbarMenu}
        onSelect={onSelectTopbar}
        onToggleSidebar={onToggleSidebar}
        onToggleChatbox={onToggleChatbox}
        actionsOnLeft
      />
      <div className="p-3 bg-gray-100 flex-1">
        <div className="bg-white shadow rounded p-6 w-full">{renderContent()}</div>
      </div>
    </div>
  );
};

export default AdminDashboard;
