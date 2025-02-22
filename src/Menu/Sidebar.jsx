import React, { useState, useEffect } from "react";

const modules = [
  { id: "student", name: "Student Module", icon: "📚", menu: ["Transcript", "Migration", "Attendance"] },
  { id: "employee", name: "Employee Module", icon: "💼", menu: ["Payroll", "Leave Management", "Projects"] },
  { id: "admin", name: "Admin Panel", icon: "👥", menu: ["User Management", "Settings"] }
];

const Sidebar = ({ isOpen, setSidebarOpen, setSelectedMenuItem }) => {
  const [selectedModule, setSelectedModule] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [user, setUser] = useState(null); // ✅ FIX: Add useState for user

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    setUser(storedUser);
  }, []);

  const handleModuleSelect = (moduleId) => {
    setSelectedModule(moduleId);
    setShowDropdown(false);
  };

  return (
    <div className={`h-screen bg-gray-800 text-white transition-all ${isOpen ? "w-64" : "w-20"} duration-300 p-4`}>
      {/* Profile Section */}
      <div className="flex items-center mb-4">
        <img 
          src={user?.profilePicture || "/default-profile.png"} 
          alt="Profile" 
          className="w-10 h-10 rounded-full mr-2" 
        />
        {isOpen && <span className="text-lg font-semibold">{user?.username || "Guest"}</span>}
        <button onClick={() => setSidebarOpen(!isOpen)} className="ml-auto">☰</button>
      </div>
      <hr className="border-gray-600 mb-4" />

      {/* Dashboard */}
      <button className="w-full text-left px-4 py-2 rounded hover:bg-gray-700">🏠 Dashboard</button>
      <hr className="border-gray-600 my-4" />

      {/* Module Dropdown Selector */}
      <div className="relative">
        <button onClick={() => setShowDropdown(!showDropdown)} className="w-full text-left px-4 py-2 rounded bg-gray-700 hover:bg-gray-600">
          {selectedModule ? modules.find(m => m.id === selectedModule).name : "Select Module"}
        </button>
        {showDropdown && (
          <div className="absolute left-0 w-full bg-gray-700 rounded shadow-lg z-10">
            {modules.map((mod) => (
              <button key={mod.id} onClick={() => handleModuleSelect(mod.id)} className="w-full text-left px-4 py-2 hover:bg-gray-600 flex items-center">
                <span className="mr-2">{mod.icon}</span> {mod.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <hr className="border-gray-600 my-4" />

      {/* Dynamic Menu Box (Based on Selected Module) */}
      {selectedModule && (
        <div>
          {modules.find((mod) => mod.id === selectedModule)?.menu.map((item) => (
            <button key={item} onClick={() => setSelectedMenuItem(item)} className="w-full text-left px-4 py-2 hover:bg-gray-700">
              {item}
            </button>
          ))}
        </div>
      )}

      <hr className="border-gray-600 my-4" />

      {/* Admin Panel Button */}
      <button onClick={() => console.log("Admin Panel Clicked!")} className="w-full text-left px-4 py-2 rounded hover:bg-gray-700">⚙️ Admin Panel</button>
      <hr className="border-gray-600 my-4" />

      {/* Logout */}
      <button className="w-full text-left px-4 py-2 rounded hover:bg-gray-700">🚪 Logout</button>
    </div>
  );
};

export default Sidebar;
