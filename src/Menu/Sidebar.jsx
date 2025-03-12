import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";

const modules = [
  {
    id: "student", name: "Student Module", icon: "🎓",
    menu: ["📜 Transcript", "📑 Migration", "📋 Provisional", "🏅 Degree", "🏛️ Institutional Verification"]
  },
  {
    id: "office_management", name: "Office Management", icon: "🏢",
    menu: ["📥 Inward", "📤 Outward", "🏖️ Leave Management", "📦 Inventory"]
  },
  {
    id: "finance", name: "Accounts & Finance", icon: "💰",
    menu: ["📊 Daily Register", "💵 Student Fees", "🔍 Payment Track"]
  }
];

const Sidebar = ({ isOpen, setSidebarOpen, setSelectedMenuItem }) => {
  const navigate = useNavigate();
  const { isAdmin, user, profilePicture, logout, verifyPassword  } = useAuth();

  const [selectedModule, setSelectedModule] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentProfilePic, setCurrentProfilePic] = useState("/profilepic/default-profile.png");
  const [password, setPassword] = useState("");
  const [securePage, setSecurePage] = useState(null);

  useEffect(() => {
    if (user) {
      setCurrentProfilePic(profilePicture || "/profilepic/default-profile.png");
    } else {
      setCurrentProfilePic("/profilepic/default-profile.png");
    }
  }, [user, profilePicture]);

  const handleModuleSelect = (moduleId) => {
    setSelectedModule(moduleId);
    setShowDropdown(false);
  };

  const handleLogout = () => {
    logout(navigate);
    setCurrentProfilePic("/profilepic/default-profile.png");
  };

  const handleMenuClick = async (menuItem) => {
    if (menuItem === "Admin Panel" || menuItem === "Profile Settings") {
      setSecurePage(menuItem); // Store which page needs verification
      setShowPasswordModal(true); // Show password modal
    } else {
      setSelectedMenuItem(menuItem); // Open normally for other items
    }
  };
  
  const handleVerifyPassword = async () => {
    if (!securePage) return; // Prevent issues if securePage is null
    
    const isVerified = await verifyPassword(password);
    if (isVerified) {
      console.log(`✅ Password verified for: ${securePage}`);
      setShowPasswordModal(false);
      setPassword("");
  
      // ✅ Now open the page inside WorkArea
      setSelectedMenuItem(securePage);
    } else {
      alert("❌ Incorrect password! Please try again.");
      setPassword("");
    }
  };

  return (
    <div className={`h-screen bg-gray-800 text-white transition-all ${isOpen ? "w-64" : "w-20"} duration-300 p-4 relative`}>
      {/* Profile Section */}
      <div className="flex items-center pt-4">
        <div className="flex-shrink-0">
          <img src={currentProfilePic} alt="Profile" className="w-14 h-14 rounded-full object-cover" />
        </div>
        {isOpen && (
          <div className="ml-4 flex items-center">
            <span className="text-lg font-semibold">{user?.first_name || user?.username || "Guest"}</span>
            <button onClick={() => {
                  setSecurePage("Profile Settings"); 
                  setShowPasswordModal(true); 
                }}  
              className="text-white hover:text-gray-300 ml-2">
              📝
            </button>
          </div>
        )}
      </div>

      {/* Toggle Sidebar Button */}
      <button
        onClick={() => setSidebarOpen(!isOpen)}
        className="absolute top-0.5 right-4 w-[30px] h-[30px] rounded-full bg-gray-800 text-white hover:bg-gray-600 transition text-3xl flex items-center justify-center leading-none"
      >
        {isOpen ? "«" : "»"}
      </button>

      <hr className="border-gray-600 mb-2" />

      {/* Dashboard Button */}
      <button onClick={() => handleMenuClick("Dashboard")} className="w-full text-left px-4 py-2 rounded hover:bg-gray-700">
        {isOpen ? "🏠 Dashboard" : "🏠"}
      </button>

      <hr className="border-gray-600 mb-2" />

      {/* Module Selector */}
      <div className="relative">
        <button onClick={() => setShowDropdown(!showDropdown)} className="w-full text-left px-4 py-2 rounded bg-gray-700 hover:bg-gray-600">
          {isOpen ? (selectedModule ? modules.find((m) => m.id === selectedModule)?.name : "🗃️ Select Module") : "🗃️"}
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

      <hr className="border-gray-600 mb-2" />

      {/* Submenus */}
      {selectedModule && (
        <div className={`${isOpen ? "block" : "hidden"}`}>
          {modules.find((mod) => mod.id === selectedModule)?.menu.map((item) => (
            <button key={item} onClick={() => handleMenuClick(item)} className="w-full text-left px-4 py-2 hover:bg-gray-700">
              {isOpen ? item : "•"}
            </button>
          ))}
        </div>
      )}

      <hr className="border-gray-600 my-4" />

      {/* Admin Panel (For Admins Only) */}
      {isAdmin && (
       <button onClick={() => {
        setSecurePage("Admin Panel"); 
        setShowPasswordModal(true); 
      }}  className="w-full text-left px-4 py-2 rounded hover:bg-gray-700">
          {isOpen ? "🛠️ Admin Panel" : "🛠️"}
        </button>
      )}

      {/* Logout Button */}
      <div className="mt-auto">
        <hr className="border-gray-600 my-4" />
        <button onClick={handleLogout} className="w-full text-left px-4 py-2 rounded hover:bg-gray-700">
          {isOpen ? "🚪 Logout" : "🚪"}
        </button>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold mb-2">Enter Password for {securePage}</h2>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border rounded bg-gray-100 focus:ring-0 focus:outline-none"
              style={{
                color: "black", // Makes dots black
                WebkitTextSecurity: "disc", // Shows dots instead of text
                caretColor: "black", // Keeps the cursor visible in black
              }}
              placeholder="Enter Password"
            />
            <div className="flex justify-end mt-4">
              <button onClick={handleVerifyPassword} className="bg-blue-500 text-white px-4 py-2 rounded">Submit</button>
              <button onClick={() => setShowPasswordModal(false)} className="ml-2 px-4 py-2 bg-gray-300 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
