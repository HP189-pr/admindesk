import React from "react";
import { useNavigate } from "react-router-dom";

const HomeDashboard = ({ setSelectedMenuItem }) => {
    const navigate = useNavigate();

    const openModule = (menuItem) => {
        setSelectedMenuItem(menuItem);
        navigate("/dashboard"); // Switch to workarea dashboard
    };

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold">Welcome to Your Dashboard</h1>
            <div className="mt-4 grid grid-cols-3 gap-4">
                <button
                    onClick={() => openModule("Transcript")}
                    className="p-4 bg-blue-500 text-white rounded"
                >
                    📚 Verification
                </button>
                <button
                    onClick={() => openModule("Migration")}
                    className="p-4 bg-green-500 text-white rounded"
                >
                    🚀 Migration
                </button>
                <button
                    onClick={() => openModule("Attendance")}
                    className="p-4 bg-yellow-500 text-white rounded"
                >
                    📅 Attendance
                </button>
            </div>
        </div>
    );
};

export default HomeDashboard;
