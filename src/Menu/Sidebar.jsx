import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';

// Styled Sidebar with static modules, adapted to labels used in this app
const modules = [
  {
    id: 'student',
    name: 'Student Module',
    icon: '🎓',
    menu: [
      '📑 Enrollment',
      '📜 Verification',
      '📑 Migration',
      '📋 Provisional',
      '🏅 Degree',
      '🏛️ Institutional Verification',
    ],
  },
  {
    id: 'office_management',
    name: 'Office Management',
    icon: '🏢',
    menu: ['📥 Document Receive', '📥 Inward', '📤 Outward', '🏖️ Leave Management', '📦 Inventory'],
  },
  {
    id: 'finance',
    name: 'Accounts & Finance',
    icon: '💰',
    menu: ['📊 Daily Register', '💵 Student Fees', '🔍 Payment Track'],
  },
];

const Sidebar = ({ isOpen, setSidebarOpen, setSelectedMenuItem }) => {
  const navigate = useNavigate();
  const { user, profilePicture, logout, verifyPassword, isAdmin } = useAuth();

  const [selectedModule, setSelectedModule] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [profilePic, setProfilePic] = useState('/profilepic/default-profile.png');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [securePage, setSecurePage] = useState(null);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (user) {
      setProfilePic(profilePicture || '/profilepic/default-profile.png');
    } else {
      setProfilePic('/profilepic/default-profile.png');
    }
  }, [user, profilePicture]);

  const handleModuleSelect = (moduleId) => {
    setSelectedModule(moduleId);
    setShowDropdown(false);
  };

  const handleLogout = () => {
    logout(navigate);
    setProfilePic('/profilepic/default-profile.png');
  };

  const handleSecurePageAccess = (menuItem) => {
    setSecurePage(menuItem);
    setShowPasswordModal(true);
  };

  const handleVerifyPassword = async () => {
    const ok = await verifyPassword(password);
    if (ok) {
      setShowPasswordModal(false);
      setPassword('');
      setSelectedMenuItem(securePage);
    } else {
      alert('Incorrect password');
      setPassword('');
    }
  };

  const handleMenuClick = (menuItem) => {
    if (menuItem === 'Admin Panel' || menuItem === 'Profile Settings') {
      handleSecurePageAccess(menuItem);
    } else {
      setSelectedMenuItem(menuItem);
    }
  };

  return (
    <div
      className={`h-screen bg-gray-800 text-white transition-all ${
        isOpen ? 'w-64' : 'w-20'
      } duration-300 p-4 relative flex flex-col`}
    >
      {/* Profile Section */}
      <div className="flex items-center pt-4">
        <img
          src={profilePic}
          alt="Profile"
          className="w-14 h-14 rounded-full object-cover border-2 border-white"
        />

        {isOpen && (
          <div className="ml-4 flex items-center">
            <span className="text-lg font-semibold">
              {user?.first_name || user?.username || 'Guest'}
            </span>
            <button
              onClick={() => handleMenuClick('Profile Settings')}
              className="text-white hover:text-gray-300 ml-2"
            >
              📝
            </button>
          </div>
        )}
      </div>

      {/* Sidebar Toggle Button */}
      <button
        onClick={() => setSidebarOpen(!isOpen)}
        className="absolute top-0.5 right-4 w-[30px] h-[30px] rounded-full bg-gray-800 text-white hover:bg-gray-600 transition text-3xl flex items-center justify-center leading-none"
      >
        {isOpen ? '«' : '»'}
      </button>

      <hr className="border-gray-600 my-2" />

      {/* Dashboard Button */}
      <button
        onClick={() => handleMenuClick('Dashboard')}
        className="w-full text-left px-4 py-2 rounded hover:bg-gray-700"
      >
        {isOpen ? '🏠 Dashboard' : '🏠'}
      </button>

      <hr className="border-gray-600 my-2" />

      {/* Module Selection */}
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="w-full text-left px-4 py-2 rounded bg-gray-700 hover:bg-gray-600"
        >
          {isOpen
            ? selectedModule
              ? modules.find((m) => m.id === selectedModule)?.name
              : '🗃️ Select Module'
            : '🗃️'}
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

      <hr className="border-gray-600 my-2" />

      {/* Module Menus */}
      {selectedModule && (
        <div className={`${isOpen ? 'block' : 'hidden'}`}>
          {modules
            .find((mod) => mod.id === selectedModule)
            ?.menu.map((item) => (
              <button
                key={item}
                onClick={() => handleMenuClick(item)}
                className="w-full text-left px-4 py-2 hover:bg-gray-700"
              >
                {isOpen ? item : '•'}
              </button>
            ))}
        </div>
      )}

      <hr className="border-gray-600 my-4" />

      {/* Admin Panel Button */}
      {isAdmin && (
        <button
          onClick={() => handleMenuClick('Admin Panel')}
          className="w-full text-left px-4 py-2 rounded hover:bg-gray-700"
        >
          {isOpen ? '🛠️ Admin Panel' : '🛠️'}
        </button>
      )}

      {/* Logout Button */}
      <div className="mt-auto">
        <hr className="border-gray-600 my-4" />
        <button
          onClick={handleLogout}
          className="w-full text-left px-4 py-2 rounded hover:bg-gray-700"
        >
          {isOpen ? '🚪 Logout' : '🚪'}
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
              style={{ color: 'black', WebkitTextSecurity: 'disc', caretColor: 'black' }}
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

Sidebar.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  setSidebarOpen: PropTypes.func.isRequired,
  setSelectedMenuItem: PropTypes.func.isRequired,
};

export default Sidebar;
