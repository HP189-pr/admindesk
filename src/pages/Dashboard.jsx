import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../Menu/Sidebar";
import TopMenu from "../Menu/Topbar";
import ProfileUpdate from "../components/ProfileUpdate";
import useAuth from "../hooks/useAuth";

const Dashboard = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isSidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [workArea, setWorkArea] = useState(null);

  useEffect(() => {
    console.log("🔍 Checking user state in Dashboard:", { user, loading });

    if (!loading) {
      if (!user) {
        console.log("❌ No user found, redirecting to login");
        navigate("/login");
      } else {
        console.log("✅ User is authenticated:", user);
      }
    }
  }, [user, loading, navigate]);

  if (loading) {
    return <div className="flex h-screen w-screen items-center justify-center text-lg">Loading...</div>;
  }

  return (
    <div className="flex h-screen w-screen">
      <Sidebar isOpen={isSidebarOpen} setSidebarOpen={setSidebarOpen} setWorkArea={setWorkArea} />

      <div className="flex flex-col flex-grow p-4">
        <div className="h-16 mb-4">
          <TopMenu />
        </div>

        <div className="flex-grow p-4 overflow-auto bg-gray-100 rounded-lg">
          {workArea === "profile" ? (
            <ProfileUpdate setWorkArea={setWorkArea} />
          ) : (
            <h1 className="text-xl font-bold text-center text-gray-700">Welcome to the Dashboard</h1>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
