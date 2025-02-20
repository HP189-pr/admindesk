import React, { useState } from "react";
import {
  Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Avatar, Divider, Collapse
} from "@mui/material";
import {
  Dashboard, People, Payment, CalendarToday, Settings, ExitToApp, School, Work, ExpandMore, ExpandLess
} from "@mui/icons-material";

const modules = [
  { id: "student", name: "Student Module", icon: <School />, menu: ["Transcript", "Migration", "Attendance"] },
  { id: "employee", name: "Employee Module", icon: <Work />, menu: ["Payroll", "Leave Management", "Projects"] },
];

const Sidebar = ({ isOpen }) => {
  const [active, setActive] = useState("dashboard");
  const [selectedModule, setSelectedModule] = useState(null);
  const [moduleOpen, setModuleOpen] = useState(false);

  return (
    <Drawer
      variant="permanent"
      open={isOpen}
      className="h-screen w-64 bg-gray-600 p-5 rounded-tl-[37px] rounded-bl-[37px]"
    >
      {/* Profile Section */}
      <div className="flex flex-col items-center mb-6">
        <Avatar sx={{ width: 50, height: 50, bgcolor: "white" }} />
        <span className="text-white mt-2 text-lg font-semibold">John Doe</span>
        <ListItemButton className="text-white text-sm opacity-70">
          <Settings className="mr-2" fontSize="small" /> Settings
        </ListItemButton>
      </div>

      <Divider className="bg-gray-500 my-3" />

      {/* Dashboard */}
      <ListItem disablePadding>
        <ListItemButton
          onClick={() => {
            setActive("dashboard");
            setSelectedModule(null);
          }}
          className={`p-3 rounded-md ${
            active === "dashboard" ? "bg-white text-gray-600" : "text-white hover:bg-gray-500"
          }`}
        >
          <ListItemIcon className={active === "dashboard" ? "text-gray-600" : "text-white"}>
            <Dashboard />
          </ListItemIcon>
          <ListItemText primary="Dashboard" />
        </ListItemButton>
      </ListItem>

      <Divider className="bg-gray-500 my-3" />

      {/* Module Selection (Dropdown Toggle) */}
      <ListItem disablePadding>
        <ListItemButton onClick={() => setModuleOpen(!moduleOpen)} className="text-white">
          <ListItemText primary="Select Module" />
          {moduleOpen ? <ExpandLess className="text-white" /> : <ExpandMore className="text-white" />}
        </ListItemButton>
      </ListItem>

      {/* Module Options (Dropdown List) */}
      <Collapse in={moduleOpen} timeout="auto" unmountOnExit>
        <List className="ml-4">
          {modules.map((mod) => (
            <ListItem key={mod.id} disablePadding>
              <ListItemButton
                onClick={() => {
                  setSelectedModule(selectedModule === mod.id ? null : mod.id);
                  setActive(mod.id);
                  setModuleOpen(false);
                }}
                className={`p-3 rounded-md ${
                  active === mod.id ? "bg-white text-gray-600" : "text-white hover:bg-gray-500"
                }`}
              >
                <ListItemIcon className={active === mod.id ? "text-gray-600" : "text-white"}>
                  {mod.icon}
                </ListItemIcon>
                <ListItemText primary={mod.name} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Collapse>

      <Divider className="bg-gray-500 my-3" />

      {/* Dynamic Menu Box (Based on Selected Module) */}
      {selectedModule && (
        <List className="ml-4">
          {modules
            .find((mod) => mod.id === selectedModule)
            ?.menu.map((item) => (
              <ListItem key={item} disablePadding>
                <ListItemButton
                  onClick={() => setActive(item)}
                  className={`p-3 rounded-md ${
                    active === item ? "bg-white text-gray-600" : "text-white hover:bg-gray-500"
                  }`}
                >
                  <ListItemText primary={item} />
                </ListItemButton>
              </ListItem>
            ))}
        </List>
      )}

      <Divider className="bg-gray-500 my-3" />

      {/* Admin Panel */}
      <ListItem disablePadding>
        <ListItemButton
          onClick={() => setActive("admin")}
          className={`p-3 rounded-md ${
            active === "admin" ? "bg-white text-gray-600" : "text-white hover:bg-gray-500"
          }`}
        >
          <ListItemIcon className={active === "admin" ? "text-gray-600" : "text-white"}>
            <People />
          </ListItemIcon>
          <ListItemText primary="Admin Panel" />
        </ListItemButton>
      </ListItem>

      {/* Logout Button */}
      <div className="absolute bottom-5 w-full px-5">
        <button className="w-full bg-white text-gray-600 font-medium py-3 rounded-lg flex items-center justify-center">
          <ExitToApp className="mr-2" /> Logout
        </button>
      </div>
    </Drawer>
  );
};

export default Sidebar;
