import React, { useEffect, useState } from "react";
import axios from "../api/axiosInstance";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const UserRights = ({ fetchUserPermissions, updateUserPermission }) => {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [modules, setModules] = useState([]);
  const [menus, setMenus] = useState([]);
  const [selectedModules, setSelectedModules] = useState([]);
  const [selectedMenus, setSelectedMenus] = useState({});

  /* ===================== LOAD INITIAL DATA ===================== */

  useEffect(() => {
    fetchUsers();
    fetchModules();
    fetchMenus();
  }, []);

  useEffect(() => {
    if (!selectedUser) return;

    const userKey =
      selectedUser?.id ??
      selectedUser?.username ??
      selectedUser?.usercode;

    fetchUserPermissions(userKey).then((data = {}) => {
      setSelectedMenus(data.menus || {});
      setSelectedModules(
        Array.isArray(data.modules) ? data.modules.map(String) : []
      );
    });
  }, [selectedUser]);

  /* ===================== API LOADERS ===================== */

  const fetchUsers = async () => {
    try {
      const res = await axios.get("/api/users/");
      setUsers(Array.isArray(res.data) ? res.data : res.data?.results || []);
    } catch (err) {
      console.error("❌ Fetch Users Error:", err);
    }
  };

  const fetchModules = async () => {
    try {
      const res = await axios.get("/api/modules/");
      setModules(Array.isArray(res.data) ? res.data : res.data?.results || []);
    } catch (err) {
      console.error("❌ Fetch Modules Error:", err);
    }
  };

  const fetchMenus = async () => {
    try {
      const res = await axios.get("/api/menus/");
      setMenus(Array.isArray(res.data) ? res.data : res.data?.results || []);
    } catch (err) {
      console.error("❌ Fetch Menus Error:", err);
    }
  };

  /* ===================== HELPERS ===================== */

  const getUserKey = (u) =>
    String(u?.id ?? u?.username ?? u?.usercode ?? "");

  const getModuleKey = (m) =>
    String(m?.moduleid ?? m?.id ?? m?.module_id ?? "");

  const getMenuKey = (m) =>
    String(m?.menuid ?? m?.id ?? m?.pk ?? "");

  const getMenuModuleKey = (m) =>
    String(m?.module ?? m?.module_id ?? m?.moduleid ?? "");

  /* ===================== MODULE SELECTION ===================== */

  const handleModuleSelection = (moduleId) => {
    const key = String(moduleId);
    setSelectedModules((prev) =>
      prev.includes(key)
        ? prev.filter((id) => id !== key)
        : [...prev, key]
    );
  };

  /* ===================== MENU PERMISSIONS ===================== */

  const handlePermissionChange = (menuId, permissionType) => {
    setSelectedMenus((prev) => {
      const current = { ...(prev[menuId] || {}) };

      if (permissionType === "all") {
        const val = !current.all;
        current.view = val;
        current.add = val;
        current.edit = val;
        current.delete = val;
        current.all = val;
      } else {
        current[permissionType] = !current[permissionType];
        current.all =
          current.view &&
          current.add &&
          current.edit &&
          current.delete;
      }

      return { ...prev, [menuId]: current };
    });
  };

  /* ===================== SAVE ===================== */

  const savePermissions = async () => {
    if (!selectedUser) {
      toast.error("Please select a user before saving.");
      return;
    }

    try {
      toast.info("Saving permissions...");

      const enrichedMenus = {};

      for (const [menuId, perms] of Object.entries(selectedMenus)) {
        const menuObj = menus.find(
          (m) => getMenuKey(m) === String(menuId)
        );
        const moduleId = menuObj ? getMenuModuleKey(menuObj) : undefined;

        enrichedMenus[menuId] = {
          ...perms,
          module: moduleId,
        };
      }

      const userKey = getUserKey(selectedUser);

      const res = await updateUserPermission(userKey, {
        modules: selectedModules,
        menus: enrichedMenus,
      });

      toast.dismiss();

      if (res === false) {
        toast.error("Save failed (server returned failure).");
        return;
      }

      toast.success("✅ Permissions updated successfully!");
    } catch (err) {
      console.error("❌ Save permissions error:", err);
      toast.dismiss();
      toast.error("Failed to save permissions.");
    }
  };

  /* ===================== RENDER ===================== */

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">
        🔒 User Rights Management
      </h2>

      <select
        className="p-2 border rounded"
        onChange={(e) =>
          setSelectedUser(
            users.find(
              (u) => getUserKey(u) === e.target.value
            ) || null
          )
        }
      >
        <option value="">Select a user</option>
        {users.map((user) => (
          <option key={getUserKey(user)} value={getUserKey(user)}>
            {user.username}
          </option>
        ))}
      </select>

      <div className="mt-4 flex">
        {/* MODULES */}
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
                const key = getModuleKey(module);
                return (
                  <tr key={key}>
                    <td className="border p-2">{module.name}</td>
                    <td className="border p-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedModules.includes(key)}
                        onChange={() => handleModuleSelection(key)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* MENUS */}
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
                .filter((m) =>
                  selectedModules.includes(getMenuModuleKey(m))
                )
                .map((menu) => {
                  const key = getMenuKey(menu);
                  const perms = selectedMenus[key] || {};
                  return (
                    <tr key={key}>
                      <td className="border p-2">{menu.name}</td>
                      {["all", "view", "add", "edit", "delete"].map((p) => (
                        <td key={p} className="border p-2 text-center">
                          <input
                            type="checkbox"
                            checked={!!perms[p]}
                            onChange={() =>
                              handlePermissionChange(key, p)
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <button
        onClick={savePermissions}
        className="bg-blue-500 text-white px-4 py-2 rounded mt-4"
      >
        Save Permissions
      </button>

      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
};

export default UserRights;
