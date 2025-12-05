import React, { useEffect, useState } from "react";
import PageTopbar from "./PageTopbar";
import UserManagement from "../hooks/UserManagement";
import UserRights from "../hooks/UserRights";
import AddModule from "../hooks/AddModule";
import Addcourse from "../hooks/Addcourse";
import { useAuth } from "../hooks/AuthContext";
import axios from "../api/axiosInstance";
import AuthUpload from "../hooks/AuthUpload.jsx";
import AdminBulkUpload from "./AdminBulkUpload.jsx";
import DataAnalysis from "../hooks/DataAnalysis.jsx";
import AuthEmp from "../hooks/AuthEmp.jsx";
import AuthLeave from "../hooks/AuthLeave.jsx";
import HolidayManager from "../hooks/HolidayManager.jsx";

const AdminDashboard = ({ selectedTopbarMenu, onToggleSidebar, onToggleChatbox, onSelectTopbar }) => {
  const [users, setUsers] = useState([]);
  const { fetchUsers } = useAuth();

  // Real implementations wired to backend userpermissions endpoints
  const fetchUserPermissions = async (userId) => {
    try {
      const res = await axios.get(`/api/userpermissions/`);
      const all = res.data || [];
      // filter rows for this user
      const rows = all.filter((r) => String(r.user) === String(userId) || (r.user && r.user.id && String(r.user.id) === String(userId)));

      const menus = {};
      const modules = new Set();
      rows.forEach((r) => {
        const menuId = r.menu ?? r.menuid ?? r.menu_id ?? r.id;
        const moduleId = r.module ?? r.moduleid ?? r.module_id;
        modules.add(String(moduleId));
        menus[String(menuId)] = {
          view: !!r.can_view,
          add: !!r.can_create,
          edit: !!r.can_edit,
          delete: !!r.can_delete,
          all: !!(r.can_view && r.can_create && r.can_edit && r.can_delete),
          _pk: r.id ?? r.permitid ?? r.pk,
        };
      });

      return { menus, modules: Array.from(modules) };
    } catch (e) {
      console.error('Fetch user permissions error', e);
      return { menus: {}, modules: [] };
    }
  };

  const updateUserPermission = async (userId, payload) => {
    // payload: { menus: {menuId: {view,add,edit,delete}}, modules: [moduleIds] }
    try {
      const res = await axios.get(`/api/userpermissions/`);
      const all = res.data || [];
      const existing = all.filter((r) => String(r.user) === String(userId) || (r.user && r.user.id && String(r.user.id) === String(userId)));

      // Map existing by menu id
      const existingByMenu = {};
      existing.forEach((r) => {
        const menuId = String(r.menu ?? r.menuid ?? r.menu_id ?? r.id);
        existingByMenu[menuId] = r;
      });

      // Desired menus
      const desired = payload.menus || {};

      // Update or create
      for (const [menuId, perms] of Object.entries(desired)) {
        const ex = existingByMenu[menuId];
        const uid = Number(userId);
        const body = {
          user: uid,
          module: Number(perms.module) || perms.module_id || undefined,
          menu: Number(menuId),
          can_view: !!perms.view,
          can_create: !!perms.add,
          can_edit: !!perms.edit,
          can_delete: !!perms.delete,
        };
        // Debugging: print the body that will be sent so we can confirm 'user' is present
        try {
          // eslint-disable-next-line no-console
          console.debug('DEBUG: updateUserPermission call body=', body, 'existing=', !!ex);
        } catch (e) {}

        if (ex) {
          // update
          const pk = ex.id ?? ex.permitid ?? ex.pk;
          await axios.put(`/api/userpermissions/${pk}/`, body);
        } else {
          // create
          await axios.post(`/api/userpermissions/`, body);
        }
      }

      // Delete any existing that are no longer desired
      for (const ex of existing) {
        const menuId = String(ex.menu ?? ex.menuid ?? ex.menu_id ?? ex.id);
        if (!desired[menuId]) {
          const pk = ex.id ?? ex.permitid ?? ex.pk;
          if (pk) await axios.delete(`/api/userpermissions/${pk}/`);
        }
      }

      return true;
    } catch (e) {
      console.error('Update permissions error', e);
      return false;
    }
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
        // Provide the admin upload area — AuthUpload contains the service
        // dropdown and will render the correct AdminBulkUpload based on
        // the selected service. Do not render a second, always-visible
        // AdminBulkUpload here (it caused duplicate UI/filename display).
        return (
          <div>
            <AuthUpload />
          </div>
        );
      case "Data Analysis":
        return <DataAnalysis />;
      case "Employee Profiles":
        return <AuthEmp />;
      case "Leave Allocations":
        return <AuthLeave />;
      case "Holidays":
        return <HolidayManager />;

      default:
        return <h2 className="text-xl font-semibold">Please select an option.</h2>;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageTopbar
        title="Admin Panel"
        actions={["User Management", "User Rights", "Add Module", "Add Course", "Upload", "Data Analysis", "Employee Profiles", "Leave Allocations", "Holidays"]}
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
