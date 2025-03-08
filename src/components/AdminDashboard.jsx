import React, { useState, useEffect } from "react";

// Dynamic sidebar items based on topbar selection
const sidebarMenus = {
    "User Management": ["User List", "Add User", "User Rights", "User Logs"],
    "User Rights": ["Role Permissions", "Department Rights"],
    "Add College": ["Add New College", "Manage Colleges"],
    "Add Course": ["Add New Course", "Manage Courses"],
};

const AdminDashboard = ({ selectedTopbarItem }) => {
    const [currentSidebarItem, setCurrentSidebarItem] = useState("");

    useEffect(() => {
        // Reset inner sidebar selection when topbar item changes
        setCurrentSidebarItem("");
    }, [selectedTopbarItem]);

    const sidebarItems = sidebarMenus[selectedTopbarItem] || [];

    return (
        <div className="flex h-full">
            {/* Inner Sidebar (Admin Dashboard level) */}
            <aside className="w-60 bg-gray-200 text-black flex flex-col space-y-2 p-4">
                {sidebarItems.map((item) => (
                    <button
                        key={item}
                        className={`w-full text-left py-2 px-4 rounded transition ${
                            currentSidebarItem === item ? "bg-blue-500 text-white" : "hover:bg-gray-300"
                        }`}
                        onClick={() => setCurrentSidebarItem(item)}
                    >
                        {item}
                    </button>
                ))}
            </aside>

            {/* Main Content Area (changes based on sidebar item selection) */}
            <main className="flex-1 p-6 bg-gray-100">
                <div className="bg-white shadow rounded p-6">
                    <h2 className="text-xl font-semibold mb-4">
                        {selectedTopbarItem} - {currentSidebarItem || "Please select an option"}
                    </h2>

                    {/* Content placeholder */}
                    {currentSidebarItem && (
                        <p>✅ Content for <strong>{currentSidebarItem}</strong> will appear here.</p>
                    )}

                    {!currentSidebarItem && (
                        <p className="text-gray-500">Select an option from the sidebar to begin.</p>
                    )}
                </div>
            </main>
        </div>
    );
};

export default AdminDashboard;
