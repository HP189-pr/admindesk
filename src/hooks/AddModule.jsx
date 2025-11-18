import React, { useState, useEffect } from "react";
import axios from "axios";
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


  // 🔹 Fetch Modules
  const fetchModules = async () => {
    try {
      let token = localStorage.getItem("access_token");
  
      if (!token) {
        console.error("❌ No access token. Redirecting to login.");
        return;
      }
  
      const response = await axios.get("http://127.0.0.1:8000/api/modules/", {
        headers: { Authorization: `Bearer ${token}` },
      });
  
      setModules(response.data);
    } catch (error) {
      console.error("❌ Error fetching modules:", error.response?.data || error.message);
  
      if (error.response?.status === 401) {
        console.error("🔄 Trying to refresh token...");
        token = await refreshToken();
  
        if (token) {
          fetchModules(); // Retry fetching modules with new token
        } else {
          console.error("❌ Unable to refresh token. Redirecting to login.");
        }
      }
    }
  };
  

  // 🔹 Fetch Menus for a Specific Module
  const fetchMenus = async (moduleId) => {
    const apiUrl = `http://127.0.0.1:8000/api/modules/${moduleId}/menus/`;
    let token = localStorage.getItem("access_token");

    if (!token) {
        console.error("❌ No access token found.");
        return;
    }

    try {
        const response = await axios.get(apiUrl, {
            headers: {
                "Authorization": `Bearer ${token}`, // ✅ Ensure token is included
                "Content-Type": "application/json",
            },
        });

        // Store menus under moduleId to prevent overwriting other menus
        setMenus((prevMenus) => ({
            ...prevMenus,
            [moduleId]: response.data, 
        }));
    } catch (error) {
        console.error("❌ Error fetching menus:", error.response?.data || error.message);
    }
};


  // 🔹 Add New Module
  const handleAddModule = async () => {
    if (!newModuleName.trim()) return alert("⚠️ Module name is required.");

    try {
      let token = localStorage.getItem("access_token") || await refreshToken();
      if (!token) return;

      const response = await axios.post(
        "http://127.0.0.1:8000/api/modules/",
        { name: newModuleName },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setNewModuleName("");
      fetchModules(); // Refresh the module list
    } catch (error) {
      console.error("❌ Error adding module:", error.response?.data || error.message);
    }
  };

  // 🔹 Add New Menu
  const handleAddMenu = async () => {
    if (!selectedModule) return alert("⚠️ Please select a module.");
    if (!newMenuName.trim()) return alert("⚠️ Menu name is required.");

    try {
      let token = localStorage.getItem("access_token") || await refreshToken();
      if (!token) return;

      // The API exposes menus as a top-level resource; create via /api/menus/ and pass module id
      const response = await axios.post(
        "http://127.0.0.1:8000/api/menus/",
        { name: newMenuName, module: selectedModule },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setNewMenuName("");
      fetchMenus(selectedModule); // Refresh the menu list for the module
    } catch (error) {
      const serverMsg = error?.response?.data ? JSON.stringify(error.response.data) : (error.message || 'Error adding menu');
      console.error("❌ Error adding menu:", serverMsg);
      alert(`Add menu failed: ${serverMsg}`);
    }
  };

  // 🔹 Fetch Modules on Page Load
  useEffect(() => {
    fetchModules();
  }, []);

  return (
    <div className="p-4">
      {/* 🔹 Top Buttons */}
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

      {/* 🔹 Add Module Form */}
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

      {/* 🔹 Add Menu Form */}
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
              {modules.map((module) => (
                <option key={module.moduleid} value={module.moduleid}>
                  {module.name}
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

      {/* 🔹 Display Module List & Menus */}
      <h2 className="text-xl font-semibold mb-4">📋 Module List</h2>
      <ul className="border rounded p-4">
        {modules.length > 0 ? (
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

              {/* 📄 Menus */}
              {menus[module.moduleid] && (
                <ul className="ml-6 mt-2 border-l pl-4">
                  {menus[module.moduleid].length > 0 ? (
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
