import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const UserRights = ({ fetchUserPermissions, updateUserPermission }) => {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [modules, setModules] = useState([]);
  const [menus, setMenus] = useState([]);
  const [selectedModules, setSelectedModules] = useState([]);
  const [selectedMenus, setSelectedMenus] = useState({});

  useEffect(() => {
    fetchUsers();
    fetchModules();
    fetchMenus();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchUserPermissions(selectedUser.userid).then((data) => {
        setSelectedMenus(data.menus || {});
        setSelectedModules(data.modules || []);
      });
    }
  }, [selectedUser]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("access_token");
      if (!token) return;
      const response = await axios.get("http://127.0.0.1:8000/api/users/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(response.data || []);
    } catch (error) {
      console.error("❌ Fetch Users Error:", error);
    }
  };

  const fetchModules = async () => {
    try {
      const token = localStorage.getItem("access_token");
      if (!token) return;
      const response = await axios.get("http://127.0.0.1:8000/api/modules/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setModules(response.data || []);
    } catch (error) {
      console.error("Error fetching modules:", error);
    }
  };

  const fetchMenus = async () => {
    try {
      const token = localStorage.getItem("access_token");
      if (!token) return;
      const response = await axios.get("http://127.0.0.1:8000/api/menus/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMenus(response.data || []);
    } catch (error) {
      console.error("Error fetching menus:", error);
    }
  };

  const handleModuleSelection = (moduleId) => {
    setSelectedModules((prevModules) => {
      const isAlreadySelected = prevModules.includes(moduleId);
      if (isAlreadySelected) {
        return prevModules.filter((id) => id !== moduleId);
      } else {
        return [...prevModules, moduleId];
      }
    });
  };

  const handlePermissionChange = (menuId, permissionType) => {
    setSelectedMenus((prevMenus) => {
      const updatedMenu = { ...(prevMenus[menuId] || {}) };

      if (permissionType === "all") {
        const newValue = !updatedMenu.all;
        updatedMenu.view = newValue;
        updatedMenu.add = newValue;
        updatedMenu.edit = newValue;
        updatedMenu.delete = newValue;
        updatedMenu.all = newValue;
      } else {
        updatedMenu[permissionType] = !updatedMenu[permissionType];
        updatedMenu.all = updatedMenu.view && updatedMenu.add && updatedMenu.edit && updatedMenu.delete;
      }

      return { ...prevMenus, [menuId]: updatedMenu };
    });
  };

  const savePermissions = async () => {
    await updateUserPermission(selectedUser.userid, { menus: selectedMenus, modules: selectedModules });
    toast.success("✅ Permissions updated successfully!");
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">🔒 User Rights Management</h2>

      <select
        className="p-2 border rounded"
        onChange={(e) => setSelectedUser(users.find((u) => u.userid === Number(e.target.value)))}
      >
        <option value="">Select a user</option>
        {users.map((user) => (
          <option key={user.userid} value={user.userid}>
            {user.username}
          </option>
        ))}
      </select>

      <div className="mt-4 flex">
        <div className="w-1/3 border-r p-4">
          <h3 className="font-semibold mb-2">📌 Modules</h3>
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-200">
                <th className="border p-2 text-left">Module Name</th>
                <th className="border p-2 text-center">Select</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((module) => (
                <tr key={module.id} className="border">
                  <td className="border p-2">{module.name}</td>
                  <td className="border p-2 text-center">
                    <input
                      type="checkbox"
                      checked={selectedModules.includes(module.id)}
                      onChange={() => handleModuleSelection(module.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="w-2/3 p-4">
          <h3 className="font-semibold mb-2">📜 Menu Permissions</h3>
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-200">
                <th className="border p-2 text-left">Menu Name</th>
                <th className="border p-2 text-center">All</th>
                <th className="border p-2 text-center">View</th>
                <th className="border p-2 text-center">Add</th>
                <th className="border p-2 text-center">Edit</th>
                <th className="border p-2 text-center">Delete</th>
              </tr>
            </thead>
            <tbody>
              {menus
                .filter((menu) => selectedModules.includes(menu.module_id))
                .map((menu) => {
                  const menuPermissions = selectedMenus[menu.id] || {};
                  return (
                    <tr key={menu.id} className="border">
                      <td className="border p-2">{menu.name}</td>
                      <td className="border p-2 text-center">
                        <input
                          type="checkbox"
                          checked={menuPermissions.all || false}
                          onChange={() => handlePermissionChange(menu.id, "all")}
                        />
                      </td>
                      <td className="border p-2 text-center">
                        <input
                          type="checkbox"
                          checked={menuPermissions.view || false}
                          onChange={() => handlePermissionChange(menu.id, "view")}
                        />
                      </td>
                      <td className="border p-2 text-center">
                        <input
                          type="checkbox"
                          checked={menuPermissions.add || false}
                          onChange={() => handlePermissionChange(menu.id, "add")}
                        />
                      </td>
                      <td className="border p-2 text-center">
                        <input
                          type="checkbox"
                          checked={menuPermissions.edit || false}
                          onChange={() => handlePermissionChange(menu.id, "edit")}
                        />
                      </td>
                      <td className="border p-2 text-center">
                        <input
                          type="checkbox"
                          checked={menuPermissions.delete || false}
                          onChange={() => handlePermissionChange(menu.id, "delete")}
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <button onClick={savePermissions} className="bg-blue-500 text-white px-4 py-2 rounded mt-4">
        Save Permissions
      </button>
    </div>
  );
};

export default UserRights;