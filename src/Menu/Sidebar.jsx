import React, { useState } from "react";
import {
  Drawer, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Divider, Avatar, MenuItem, Menu, Button
} from "@mui/material";
import { 
  Menu as MenuIcon, Dashboard, ExitToApp, School, Work, People, 
  AdminPanelSettings, KeyboardArrowDown
} from "@mui/icons-material";

const modules = [
  { id: "student", name: "Student Module", icon: <School />, menu: ["Transcript", "Migration", "Attendance"] },
  { id: "employee", name: "Employee Module", icon: <Work />, menu: ["Payroll", "Leave Management", "Projects"] },
  { id: "admin", name: "Admin Panel", icon: <People />, menu: ["User Management", "Settings"] }
];

const Sidebar = ({ isOpen, setSidebarOpen, setSelectedMenuItem }) => {
  const [selectedModule, setSelectedModule] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null); // For module dropdown

  const handleModuleSelect = (moduleId) => {
    setSelectedModule(moduleId);
    setAnchorEl(null); // Close dropdown
  };

  return (
    <Drawer
      variant="permanent"
      open={isOpen}
      className={`transition-all ${isOpen ? "w-64" : "w-20"} duration-300`}
    >
      {/* Profile Section */}
      <div className="flex items-center p-4">
        <Avatar src="/profile.jpg" className="mr-2" />
        {isOpen && <span className="text-lg font-semibold">John Doe</span>}
        <IconButton onClick={() => setSidebarOpen(!isOpen)}>
          <MenuIcon />
        </IconButton>
      </div>
      <Divider />

      {/* Dashboard */}
      <List>
        <ListItem disablePadding>
          <ListItemButton>
            <ListItemIcon><Dashboard /></ListItemIcon>
            {isOpen && <ListItemText primary="Dashboard" />}
          </ListItemButton>
        </ListItem>
      </List>

      <Divider />

      {/* Module Dropdown Selector */}
      <div className="p-3">
        <Button
          fullWidth
          variant="outlined"
          endIcon={<KeyboardArrowDown />}
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          {selectedModule ? modules.find(m => m.id === selectedModule).name : "Select Module"}
        </Button>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
        >
          {modules.map((mod) => (
            <MenuItem key={mod.id} onClick={() => handleModuleSelect(mod.id)}>
              {mod.icon} <span className="ml-2">{mod.name}</span>
            </MenuItem>
          ))}
        </Menu>
      </div>

      <Divider />

      {/* Dynamic Menu Box (Based on Selected Module) */}
      {selectedModule && (
        <List>
          {modules.find((mod) => mod.id === selectedModule)?.menu.map((item) => (
            <ListItem key={item} disablePadding>
              <ListItemButton onClick={() => setSelectedMenuItem(item)}>
                {isOpen && <ListItemText primary={item} />}
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}

      <Divider />

      {/* Admin Panel Button */}
      <List>
        <ListItem disablePadding>
          <ListItemButton onClick={() => console.log("Admin Panel Clicked!")}>
            <ListItemIcon><AdminPanelSettings /></ListItemIcon>
            {isOpen && <ListItemText primary="Admin Panel" />}
          </ListItemButton>
        </ListItem>
      </List>

      <Divider />

      {/* Logout */}
      <List>
        <ListItem disablePadding>
          <ListItemButton>
            <ListItemIcon><ExitToApp /></ListItemIcon>
            {isOpen && <ListItemText primary="Logout" />}
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  );
};

export default Sidebar;
