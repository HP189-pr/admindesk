import React, { useState } from "react";
import Sidebar from "../Menu/Sidebar.jsx";
import Topbar from "../Menu/Topbar.jsx";
import WorkArea from "./WorkArea.jsx";
import ChatBox from "../components/ChatBox.jsx";
import { useAuth } from "../hooks/AuthContext";

const Dashboard = () => {
  const { verifyPassword } = useAuth();
    const [isSidebarOpen, setSidebarOpen] = useState(true);
    const [isChatboxOpen, setChatboxOpen] = useState(false);
    const [selectedMenuItem, setSelectedMenuItem] = useState(null);
    const [selectedSubmenu, setSelectedSubmenu] = useState(null);
    const [chatNotificationCount, setChatNotificationCount] = useState(0);

    const handleSecureNavigation = async (menuItem) => {
      const password = prompt("Please confirm your password to access this section:");
  
      if (password) {
        const isVerified = await verifyPassword(password);

          if (isVerified) {
              setSelectedMenuItem(menuItem);
          } else {
              alert("Password verification failed.");
          }
      } else {
          // Password prompt cancelled
      }
  };

    return (
        <div className={`flex h-screen w-screen transition-all duration-300 ${isSidebarOpen ? "pl-0" : "pl-1"}`}>
            {/* Sidebar (left) */}
            <Sidebar
                isOpen={isSidebarOpen}
                setSidebarOpen={setSidebarOpen}
                setSelectedMenuItem={setSelectedMenuItem}
                handleSecureNavigation={handleSecureNavigation} 
            />

            {/* Main content area (center) */}
            <div className="flex-grow flex flex-col bg-white ml-[1rem]">
            <Topbar selectedMenuItem={selectedMenuItem} onSubmenuSelect={setSelectedSubmenu} />

                <div className="h-[1rem] bg-white"></div>
                <div className="flex-grow p-4 overflow-auto bg-gray-100">
                <WorkArea selectedMenuItem={selectedMenuItem} setSelectedMenuItem={setSelectedMenuItem} selectedSubmenu={selectedSubmenu} isSidebarOpen={isSidebarOpen} setSidebarOpen={setSidebarOpen} />

                </div>
            </div>

            {/* Chatbox (right side) */}
            <ChatBox />
        </div>
    );
};

export default Dashboard;
