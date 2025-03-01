import React, { useState } from "react";
import Sidebar from "../Menu/Sidebar.jsx";
import TopMenu from "../Menu/Topbar.jsx";
import WorkArea from "./WorkArea.jsx"; 
const Dashboard = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [selectedMenuItem, setSelectedMenuItem] = useState(null);

  return (
    <div className="flex h-screen w-screen">
      {/* Sidebar */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        setSidebarOpen={setSidebarOpen} 
        setSelectedMenuItem={setSelectedMenuItem} 
      />

      {/* Main Content Area */}
      <div className="flex flex-col flex-grow">
        {/* Top Menu */}
        <div className="min-h-[4rem] bg-white shadow-md">
          <TopMenu selectedMenuItem={selectedMenuItem} />
        </div>

        {/* Work Area - Load Content */}
        <div className="flex-grow p-4 overflow-auto bg-gray-100">
          <WorkArea selectedMenuItem={selectedMenuItem} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
