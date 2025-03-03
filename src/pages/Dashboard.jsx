import React, { useState } from "react";
import Sidebar from "../Menu/Sidebar.jsx";
import TopMenu from "../Menu/Topbar.jsx";
import WorkArea from "./WorkArea.jsx";
import ChatBox from "../components/ChatBox.jsx";
import Topbar from "../Menu/Topbar.jsx";

const Dashboard = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isChatboxOpen, setChatboxOpen] = useState(false); // Toggle for chatbox open/close
  const [selectedMenuItem, setSelectedMenuItem] = useState(null);
  const [chatNotificationCount, setChatNotificationCount] = useState(0); // New message count

  return (
    <div className="flex h-screen w-screen">
      {/* Sidebar (left) */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        setSidebarOpen={setSidebarOpen} 
        setSelectedMenuItem={setSelectedMenuItem} 
      />

      {/* Main content area (center) with left margin to create the space */}
      <div className="flex-grow flex flex-col bg-white ml-[1rem]">
        {/* Top menu */}
        <Topbar
            selectedMenuItem={selectedMenuItem} 
        />
        <div className="h-[1rem] bg-white"></div> 
        {/* Work area */}
        <div className="flex-grow p-4 overflow-auto bg-gray-100">
          <WorkArea selectedMenuItem={selectedMenuItem} />
        </div>
      </div>

      {/* Chatbox (right side) - Self-contained */}
      <ChatBox />
    </div>
  );
};

export default Dashboard;
