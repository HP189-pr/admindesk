import React, { useState } from "react";
import menuActions from "../Menu/menuActions.jsx"; // Import your existing menuActions file

const AdminDashboard = () => {
    const [currentSection, setCurrentSection] = useState("Admin Panel");
    const [viewMode, setViewMode] = useState("list"); // "list", "add", "search"
    const [searchQuery, setSearchQuery] = useState("");

    // Get buttons for current section from imported menuActions
    const topMenuButtons = menuActions[currentSection]?.() || [];

    const handleTopButtonClick = (icon) => {
        if (icon === "➕") {
            setViewMode("add");
        } else if (icon === "🔍") {
            setViewMode("search");
        }
    };

    return (
        <div className="flex h-screen bg-gray-100">
            {/* Sidebar */}
            <aside className="w-60 bg-blue-800 text-white flex flex-col space-y-2 p-4">
                <button 
                    className="w-full text-left py-2 px-4 bg-blue-700 hover:bg-blue-600 rounded transition"
                    onClick={() => {
                        setCurrentSection("Admin Panel");
                        setViewMode("list");
                    }}
                >
                    Admin Panel
                </button>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 p-6 bg-gray-50 overflow-y-auto">
                {/* Top Menu Buttons */}
                <div className="flex space-x-2 mb-4">
                    {topMenuButtons.map((icon, index) => (
                        <button
                            key={index}
                            className="text-xl p-2 bg-white shadow rounded hover:bg-gray-200 transition"
                            onClick={() => handleTopButtonClick(icon)}
                        >
                            {icon}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="bg-white shadow rounded p-6">
                    <h2 className="text-xl font-semibold mb-4">
                        Admin Panel - {viewMode === "list" ? "User List" : viewMode === "add" ? "Add User" : "Search User"}
                    </h2>

                    {/* Placeholder for view sections */}
                    {viewMode === "list" && (
                        <p>✅ User List will go here.</p>
                    )}
                    {viewMode === "add" && (
                        <p>✅ Add User Form will go here.</p>
                    )}
                    {viewMode === "search" && (
                        <p>✅ Search User Section will go here.</p>
                    )}
                </div>
            </main>
        </div>
    );
};

export default AdminDashboard;
