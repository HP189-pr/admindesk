import React, { useEffect, useState } from "react";
import UserManagement from "../hooks/UserManagement";
import UserRights from "../hooks/UserRights";
import AddModule from "../hooks/AddModule";

const AdminDashboard = ({ selectedTopbarMenu, fetchUsers, fetchUserPermissions, updateUserPermission }) => {
  const [users, setUsers] = useState([]);

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
      
      default:
        return <h2 className="text-xl font-semibold">Please select an option.</h2>;
    }
  };

  return (
    <div className="flex h-full p-3 bg-gray-100">
      <div className="bg-white shadow rounded p-6 w-full">{renderContent()}</div>
    </div>
  );
};

export default AdminDashboard;
