import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth.jsx";

const modules = [
    { id: "student", name: "Student Module", icon: "📚", menu: ["Transcript", "Migration", "Attendance"] },
    { id: "employee", name: "Employee Module", icon: "💼", menu: ["Payroll", "Leave Management", "Projects"] },
    { id: "admin", name: "Admin Panel", icon: "👥", menu: ["User Management", "Settings"] },
];

const Sidebar = ({ isOpen, setSidebarOpen, setSelectedMenuItem }) => {
    const navigate = useNavigate();
    const [selectedModule, setSelectedModule] = useState(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const { user, logout, verifyPassword } = useAuth();

    const handleModuleSelect = (moduleId) => {
        setSelectedModule(moduleId);
        setShowDropdown(false);
    };
    const handleLogout = () => {
      logout(navigate);  // Pass navigate function to logout
  };
    const handleSecureNavigation = async (menuItem) => {
        const password = prompt("Please confirm your password:");
        if (password) {
            const isVerified = await verifyPassword(password);
            if (isVerified) {
                setSelectedMenuItem(menuItem);
            } else {
                alert("Password verification failed.");
            }
        }
    };

    return (
        <div className={`h-screen bg-gray-800 text-white transition-all ${isOpen ? "w-64" : "w-20"} duration-300 p-4`}>
            <div className="flex items-center mb-4">
                <img
                    src={user?.profilePicture || "/default-profile.png"}
                    alt="Profile"
                    className="w-10 h-10 rounded-full mr-2"
                />
                {isOpen && (
                    <div className="flex-1">
                        <span className="text-lg font-semibold">{user?.username || "Guest"}</span>
                    </div>
                )}

                <div className="relative">
                    <button
                        onClick={() => handleSecureNavigation("Profile Settings")}
                        className="text-white hover:text-gray-300"
                    >
                        ⚙️
                    </button>
                </div>

                <button onClick={() => setSidebarOpen(!isOpen)} className="ml-2">
                    ☰
                </button>
            </div>

            <hr className="border-gray-600 mb-4" />

            <button
                onClick={() => setSelectedMenuItem("Dashboard")}
                className="w-full text-left px-4 py-2 rounded hover:bg-gray-700"
            >
                🏠 Dashboard
            </button>

            <hr className="border-gray-600 my-4" />

            <div className="relative">
                <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="w-full text-left px-4 py-2 rounded bg-gray-700 hover:bg-gray-600"
                >
                    {selectedModule ? modules.find(m => m.id === selectedModule).name : "Select Module"}
                </button>
                {showDropdown && (
                    <div className="absolute left-0 w-full bg-gray-700 rounded shadow-lg z-10">
                        {modules.map((mod) => (
                            <button
                                key={mod.id}
                                onClick={() => handleModuleSelect(mod.id)}
                                className="w-full text-left px-4 py-2 hover:bg-gray-600 flex items-center"
                            >
                                <span className="mr-2">{mod.icon}</span> {mod.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <hr className="border-gray-600 my-4" />

            {selectedModule && (
                <div>
                    {modules
                        .find((mod) => mod.id === selectedModule)
                        ?.menu.map((item) => (
                            <button
                                key={item}
                                onClick={() => setSelectedMenuItem(item)}
                                className="w-full text-left px-4 py-2 hover:bg-gray-700"
                            >
                                {item}
                            </button>
                        ))}
                </div>
            )}

            <hr className="border-gray-600 my-4" />

            <button
                onClick={() => handleSecureNavigation("Admin Panel")}
                className="w-full text-left px-4 py-2 rounded hover:bg-gray-700"
            >
                ⚙️ Admin Panel
            </button>

            <hr className="border-gray-600 my-4" />

            <button
                onClick={() => handleLogout()}
                className="w-full text-left px-4 py-2 rounded hover:bg-gray-700"
            >
                🚪 Logout
            </button>
        </div>
    );
};

export default Sidebar;
