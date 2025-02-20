import React, { useState } from "react";
import Sidebar from "../Menu/Sidebar";
import TopMenu from "../Menu/Topbar";

const Dashboard = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [selectedMenuItem, setSelectedMenuItem] = useState(null);

  return (
    <div className="flex h-screen w-screen">
      {/* Sidebar (Fixed Left) */}
      <Sidebar isOpen={isSidebarOpen} setSidebarOpen={setSidebarOpen} setSelectedMenuItem={setSelectedMenuItem} />

      {/* Right Side - Top Menu & Work Area */}
      <div className="flex flex-col flex-grow p-4"> {/* Added padding here */}
        {/* Top Menu (Fixed on Top) */}
        <div className="h-16 mb-4"> {/* Added margin-bottom for spacing */}
          <TopMenu selectedMenuItem={selectedMenuItem} />
        </div>

        {/* Work Area (Fills Remaining Space) */}
        <div className="flex-grow p-4 overflow-auto bg-gray-100 rounded-lg">
          {selectedMenuItem ? (
            <h1 className="text-xl font-bold">{selectedMenuItem} Page</h1>
          ) : (
            <h1 className="text-xl font-bold">Select a Menu Item</h1>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
