import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
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
      const uid = selectedUser?.id ?? selectedUser?.username ?? selectedUser?.usercode;
      fetchUserPermissions(uid).then((data) => {
        // normalize incoming menus/modules to expected keys
        setSelectedMenus(data.menus || {});
        setSelectedModules(Array.isArray(data.modules) ? data.modules.map(String) : []);
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
    const key = String(moduleId);
    setSelectedModules((prevModules) => {
      const isAlreadySelected = prevModules.includes(key);
      if (isAlreadySelected) {
        return prevModules.filter((id) => id !== key);
      } else {
        return [...prevModules, key];
      }
    });
  };

  // helper getters to support different API shapes (moduleid/module_id/id)
  const getModuleKey = (m) => String(m.moduleid ?? m.id ?? m.module_id ?? m.name ?? "");
  const getMenuKey = (mm) => String(mm.menuid ?? mm.id ?? mm.pk ?? "");
  const getMenuModuleKey = (mm) => String(mm.module ?? mm.module_id ?? mm.moduleid ?? mm.moduleid ?? mm.module);

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
    if (!selectedUser) {
      toast.error('Please select a user before saving.');
      return;
    }

    try {
      // show optimistic UI
      toast.info('Saving permissions...');
      // Enrich selectedMenus with module id so backend receives module when creating permissions
      const enrichedMenus = {};
      for (const [menuId, perms] of Object.entries(selectedMenus)) {
        // find menu object to extract module id
        const menuObj = menus.find((m) => getMenuKey(m) === menuId);
        const moduleId = menuObj ? getMenuModuleKey(menuObj) : undefined;
        enrichedMenus[menuId] = { ...perms, module: moduleId };
      }

  const userId = selectedUser?.id ?? selectedUser?.username ?? selectedUser?.usercode;
  const res = await updateUserPermission(userId, { menus: enrichedMenus, modules: selectedModules });
      if (res === false) {
        toast.error('Save failed (server returned failure).');
        return;
      }
      toast.dismiss();
      toast.success("✅ Permissions updated successfully!");
    } catch (err) {
      console.error('Save permissions error', err);
      toast.error('Failed to save permissions. See console for details.');
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">🔒 User Rights Management</h2>

      <select
        className="p-2 border rounded"
        onChange={(e) => setSelectedUser(users.find((u) => String((u.id ?? u.username ?? u.usercode)) === e.target.value))}
      >
        <option value="">Select a user</option>
        {users.map((user) => (
          <option key={(user.id ?? user.username ?? user.usercode)} value={String((user.id ?? user.username ?? user.usercode))}>
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
              {modules.map((module) => {
                const mKey = getModuleKey(module);
                return (
                  <tr key={mKey} className="border">
                    <td className="border p-2">{module.name}</td>
                    <td className="border p-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedModules.includes(mKey)}
                        onChange={() => handleModuleSelection(mKey)}
                      />
                    </td>
                  </tr>
                );
              })}
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
                .filter((menu) => selectedModules.includes(getMenuModuleKey(menu)))
                .map((menu) => {
                  const mKey = getMenuKey(menu);
                  const menuPermissions = selectedMenus[mKey] || {};
                  return (
                    <tr key={mKey} className="border">
                      <td className="border p-2">{menu.name}</td>
                      <td className="border p-2 text-center">
                        <input
                          type="checkbox"
                          checked={menuPermissions.all || false}
                          onChange={() => handlePermissionChange(mKey, "all")}
                        />
                      </td>
                      <td className="border p-2 text-center">
                        <input
                          type="checkbox"
                          checked={menuPermissions.view || false}
                          onChange={() => handlePermissionChange(mKey, "view")}
                        />
                      </td>
                      <td className="border p-2 text-center">
                        <input
                          type="checkbox"
                          checked={menuPermissions.add || false}
                          onChange={() => handlePermissionChange(mKey, "add")}
                        />
                      </td>
                      <td className="border p-2 text-center">
                        <input
                          type="checkbox"
                          checked={menuPermissions.edit || false}
                          onChange={() => handlePermissionChange(mKey, "edit")}
                        />
                      </td>
                      <td className="border p-2 text-center">
                        <input
                          type="checkbox"
                          checked={menuPermissions.delete || false}
                          onChange={() => handlePermissionChange(mKey, "delete")}
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
      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
};

export default UserRights;