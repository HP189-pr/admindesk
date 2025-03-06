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
    const [chatNotificationCount, setChatNotificationCount] = useState(0);

    const handleSecureNavigation = async (menuItem) => {
      console.log(`Secure navigation triggered for ${menuItem}`);
      const password = prompt("Please confirm your password to access this section:");
  
      if (password) {
        const isVerified = await verifyPassword(password);

          if (isVerified) {
              console.log(`Password verified, navigating to ${menuItem}`);
              setSelectedMenuItem(menuItem);
          } else {
              alert("Password verification failed.");
          }
      } else {
          console.log("Password prompt cancelled");
      }
  };

    return (
        <div className="flex h-screen w-screen">
            {/* Sidebar (left) */}
            <Sidebar
                isOpen={isSidebarOpen}
                setSidebarOpen={setSidebarOpen}
                setSelectedMenuItem={setSelectedMenuItem}
                handleSecureNavigation={handleSecureNavigation} 
            />

            {/* Main content area (center) */}
            <div className="flex-grow flex flex-col bg-white ml-[1rem]">
                <Topbar selectedMenuItem={selectedMenuItem} />
                <div className="h-[1rem] bg-white"></div>
                <div className="flex-grow p-4 overflow-auto bg-gray-100">
                    <WorkArea selectedMenuItem={selectedMenuItem} />
                </div>
            </div>

            {/* Chatbox (right side) */}
            <ChatBox />
        </div>
    );
};

export default Dashboard;
