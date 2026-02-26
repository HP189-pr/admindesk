import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import API from '../api/axiosInstance';
import { DEFAULT_PROFILE_PIC, normalizeMediaUrl } from '../utils/mediaUrl';

// Styled Sidebar with static modules, adapted to labels used in this app
const staticModules = [
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
      '🏛️ Inst-Letter',
    ],
  },
  {
    id: 'office_management',
    name: 'Office Management',
    icon: '🏢',
    menu: [
      '📥 Document Receive',
      '📧 Official Mail Status',
      '📜 Transcript Requests',
      '📋 Doc Register',
      '🏖️ Leave Management',
      '📦 Inventory',
      '📹 CCTV Monitoring',
      '📊 Record',
    ],
  },
  {
    id: 'finance',
    name: 'Accounts & Finance',
    icon: '💰',
    menu: ['📊 Cash Register', '🧾 Fee Type Master', '💵 Student Fees', '🔍 Payment Track'],
  },
];

const Sidebar = ({ isOpen, setSidebarOpen, setSelectedMenuItem }) => {
  const navigate = useNavigate();
  const { user, profilePicture, logout, verifyPassword, verifyAdminPanelPassword, isAdminPanelVerified, isAdmin } = useAuth();

  const [selectedModule, setSelectedModule] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [profilePic, setProfilePic] = useState(DEFAULT_PROFILE_PIC);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [securePage, setSecurePage] = useState(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isAdminPanelFlow, setIsAdminPanelFlow] = useState(false);
  const [navModules, setNavModules] = useState([]);
  const [navLoading, setNavLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setProfilePic(normalizeMediaUrl(profilePicture) || DEFAULT_PROFILE_PIC);
    } else {
      setProfilePic(DEFAULT_PROFILE_PIC);
    }
  }, [user, profilePicture]);

  const normalizeList = (data) =>
    Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];

  const normalizeModules = (data) =>
    Array.isArray(data?.modules) ? data.modules : Array.isArray(data) ? data : [];

  const ensureModulesAndMenus = async () => {
    try {
      const [modulesRes, menusRes] = await Promise.all([
        API.get('/api/modules/'),
        API.get('/api/menus/'),
      ]);

      const dbModules = normalizeList(modulesRes.data);
      const dbMenus = normalizeList(menusRes.data);

      const moduleByName = new Map(
        dbModules.map((m) => [String(m.name || '').toLowerCase(), m])
      );

      const menusByModuleId = new Map();
      dbMenus.forEach((m) => {
        const moduleId = m.module ?? m.moduleid ?? m.module_id;
        const key = String(moduleId || '');
        if (!menusByModuleId.has(key)) menusByModuleId.set(key, new Set());
        menusByModuleId.get(key).add(String(m.name || '').toLowerCase());
      });

      for (const mod of staticModules) {
        const key = String(mod.name || '').toLowerCase();
        let dbModule = moduleByName.get(key);

        if (!dbModule) {
          const created = await API.post('/api/modules/', { name: mod.name });
          dbModule = created.data;
          moduleByName.set(key, dbModule);
        }

        const moduleId = dbModule?.moduleid ?? dbModule?.id ?? dbModule?.pk;
        const moduleKey = String(moduleId || '');
        if (!menusByModuleId.has(moduleKey)) {
          menusByModuleId.set(moduleKey, new Set());
        }

        for (const menuName of mod.menu || []) {
          const menuKey = String(menuName || '').toLowerCase();
          const set = menusByModuleId.get(moduleKey);
          if (!set.has(menuKey)) {
            await API.post('/api/menus/', { name: menuName, module: moduleId });
            set.add(menuKey);
          }
        }
      }
    } catch (error) {
      console.error('Sidebar: failed to sync modules/menus', error);
    }
  };

  const fetchNavigation = async () => {
    try {
      const res = await API.get('/api/my-navigation/');
      setNavModules(normalizeModules(res.data));
    } catch (error) {
      console.error('Sidebar: failed to fetch navigation', error);
      setNavModules([]);
    }
  };

  useEffect(() => {
    let active = true;

    const loadNavigation = async () => {
      if (!user) {
        setNavModules([]);
        setNavLoading(false);
        return;
      }

      setNavLoading(true);
      await ensureModulesAndMenus();
      if (!active) return;
      await fetchNavigation();
      if (active) setNavLoading(false);
    };

    loadNavigation();
    return () => {
      active = false;
    };
  }, [user]);

  const displayModules = useMemo(() => {
    if (!user) return staticModules;

    const navByName = new Map(
      navModules.map((m) => [String(m.name || '').toLowerCase(), m])
    );

    return staticModules
      .map((mod) => {
        const navMod = navByName.get(String(mod.name || '').toLowerCase());
        if (!navMod) {
          return { ...mod, menu: [] };
        }

        const rightsByName = new Map(
          (navMod.menus || []).map((m) => [String(m.name || '').toLowerCase(), m.rights || {}])
        );

        const visibleMenus = (mod.menu || []).filter((name) => {
          const rights = rightsByName.get(String(name || '').toLowerCase());
          return rights ? !!rights.can_view : false;
        });

        return { ...mod, menu: visibleMenus };
      })
      .filter((mod) => mod.menu && mod.menu.length > 0);
  }, [navModules, user]);

  useEffect(() => {
    if (!selectedModule) return;
    const exists = displayModules.some((mod) => mod.id === selectedModule);
    if (!exists) setSelectedModule(null);
  }, [displayModules, selectedModule]);

  const handleModuleSelect = (moduleId) => {
    setSelectedModule(moduleId);
    setShowDropdown(false);
  };

  const handleLogout = () => {
    logout(navigate);
    setProfilePic(DEFAULT_PROFILE_PIC);
  };

  const handleSecurePageAccess = async (menuItem) => {
    setSecurePage(menuItem);
    if (menuItem === 'Admin Panel') {
      setIsAdminPanelFlow(true);
      // If already verified this session, skip prompt
      const ok = await isAdminPanelVerified();
      if (ok) {
        setSelectedMenuItem(menuItem);
        return;
      }
    } else {
      setIsAdminPanelFlow(false);
    }
    setShowPasswordModal(true);
  };

  const handleVerifyPassword = async () => {
    setPasswordError('');
    if (isAdminPanelFlow) {
      const result = await verifyAdminPanelPassword(password);
      if (result && result.success) {
        setShowPasswordModal(false);
        setPassword('');
        setSelectedMenuItem(securePage);
      } else {
        setPasswordError(result?.message || 'Incorrect admin password');
        setPassword('');
      }
    } else {
      const ok = await verifyPassword(password);
      if (ok) {
        setShowPasswordModal(false);
        setPassword('');
        setSelectedMenuItem(securePage);
      } else {
        setPasswordError('Incorrect password');
        setPassword('');
      }
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
          disabled={navLoading}
        >
          {isOpen
            ? navLoading
              ? '🗃️ Loading Modules...'
              : selectedModule
              ? displayModules.find((m) => m.id === selectedModule)?.name
              : '🗃️ Select Module'
            : '🗃️'}
        </button>
        {showDropdown && (
          <div className="absolute left-0 w-full bg-gray-700 rounded shadow-lg z-10">
            {displayModules.map((mod) => (
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
          {displayModules
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
      {(isAdmin || (user && user.is_admin)) && (
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 pointer-events-auto">
          <div className="relative z-[10000] bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold mb-2">
              {isAdminPanelFlow ? 'Enter Admin Panel Password' : `Enter Password for ${securePage}`}
            </h2>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="w-full p-2 border rounded bg-gray-100 text-black focus:ring-0 focus:outline-none"
              placeholder={isAdminPanelFlow ? 'Admin panel password' : 'Your account password'}
            />
            {passwordError && (
              <div className="text-sm text-red-600 mt-2">{passwordError}</div>
            )}
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
