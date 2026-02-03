import React, { useState, useEffect } from "react";
import API from "../api/axiosInstance";
import { useAuth } from "./AuthContext";

const AddModule = () => {
  const [modules, setModules] = useState([]);
  const [menus, setMenus] = useState({});
  const [showModuleForm, setShowModuleForm] = useState(false);
  const [showMenuForm, setShowMenuForm] = useState(false);
  const [newModuleName, setNewModuleName] = useState("");
  const [newMenuName, setNewMenuName] = useState("");
  const [selectedModule, setSelectedModule] = useState(null);

  const { refreshToken } = useAuth();

  /* ==================== FETCH MODULES ==================== */

  const fetchModules = async () => {
    try {
      const res = await API.get("/api/modules/");
      setModules(res.data);
    } catch (error) {
      console.error(
        "❌ Error fetching modules:",
        error.response?.data || error.message
      );

      if (error.response?.status === 401) {
        const refreshed = await refreshToken();
        if (refreshed) fetchModules();
      }
    }
  };

  /* ==================== FETCH MENUS ==================== */

  const fetchMenus = async (moduleId) => {
    if (!moduleId) return;

    try {
      const res = await API.get(`/api/modules/${moduleId}/menus/`);
      setMenus((prev) => ({
        ...prev,
        [moduleId]: res.data,
      }));
    } catch (error) {
      console.error(
        "❌ Error fetching menus:",
        error.response?.data || error.message
      );
    }
  };

  /* ==================== ADD MODULE ==================== */

  const handleAddModule = async () => {
    if (!newModuleName.trim()) {
      alert("⚠️ Module name is required.");
      return;
    }

    try {
      await API.post("/api/modules/", { name: newModuleName });
      setNewModuleName("");
      fetchModules();
    } catch (error) {
      console.error(
        "❌ Error adding module:",
        error.response?.data || error.message
      );
    }
  };

  /* ==================== ADD MENU ==================== */

  const handleAddMenu = async () => {
    if (!selectedModule) {
      alert("⚠️ Please select a module.");
      return;
    }
    if (!newMenuName.trim()) {
      alert("⚠️ Menu name is required.");
      return;
    }

    try {
      await API.post("/api/menus/", {
        name: newMenuName,
        module: selectedModule,
      });

      setNewMenuName("");
      fetchMenus(selectedModule);
    } catch (error) {
      const msg =
        error?.response?.data
          ? JSON.stringify(error.response.data)
          : error.message;
      console.error("❌ Error adding menu:", msg);
      alert(`Add menu failed: ${msg}`);
    }
  };

  /* ==================== INIT ==================== */

  useEffect(() => {
    fetchModules();
  }, []);

  /* ==================== UI ==================== */

  return (
    <div className="p-4">
      {/* Top Buttons */}
      <div className="flex gap-4 mb-4">
        <button
          onClick={() => setShowModuleForm(!showModuleForm)}
          className="bg-green-500 text-white px-4 py-2 rounded"
        >
          ➕ Add Module
        </button>
        <button
          onClick={() => setShowMenuForm(!showMenuForm)}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          📌 Add Menu
        </button>
      </div>

      {/* Add Module */}
      {showModuleForm && (
        <div className="mb-4 p-4 border rounded bg-gray-100">
          <h2 className="text-lg font-semibold mb-2">➕ Add Module</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Module Name"
              value={newModuleName}
              onChange={(e) => setNewModuleName(e.target.value)}
              className="border p-2 rounded w-full"
            />
            <button
              onClick={handleAddModule}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Add Module
            </button>
          </div>
        </div>
      )}

      {/* Add Menu */}
      {showMenuForm && (
        <div className="mb-4 p-4 border rounded bg-gray-100">
          <h2 className="text-lg font-semibold mb-2">📌 Add Menu to Module</h2>
          <div className="flex gap-2">
            <select
              value={selectedModule || ""}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="border p-2 rounded w-full"
            >
              <option value="">Select Module</option>
              {modules.map((m) => (
                <option key={m.moduleid} value={m.moduleid}>
                  {m.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Menu Name"
              value={newMenuName}
              onChange={(e) => setNewMenuName(e.target.value)}
              className="border p-2 rounded w-full"
            />

            <button
              onClick={handleAddMenu}
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              Add Menu
            </button>
          </div>
        </div>
      )}

      {/* Module List */}
      <h2 className="text-xl font-semibold mb-4">📋 Module List</h2>

      <ul className="border rounded p-4">
        {modules.length ? (
          modules.map((module) => (
            <li key={module.moduleid} className="p-2 border-b">
              <div
                className="font-bold cursor-pointer"
                onClick={() => {
                  setSelectedModule(module.moduleid);
                  fetchMenus(module.moduleid);
                }}
              >
                📁 {module.name}
              </div>

              {menus[module.moduleid] && (
                <ul className="ml-6 mt-2 border-l pl-4">
                  {menus[module.moduleid].length ? (
                    menus[module.moduleid].map((menu) => (
                      <li key={menu.menuid} className="p-1">
                        📄 {menu.name}
                      </li>
                    ))
                  ) : (
                    <li className="text-gray-500">No menus found.</li>
                  )}
                </ul>
              )}
            </li>
          ))
        ) : (
          <p>No modules found.</p>
        )}
      </ul>
    </div>
  );
};

export default AddModule;
