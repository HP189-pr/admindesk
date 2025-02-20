import React from "react";
import { AppBar, Toolbar, IconButton } from "@mui/material";
import menuActions from "./menuActions.jsx";

const TopMenu = ({ selectedMenuItem }) => {
  console.log("Selected Menu Item:", selectedMenuItem);
  console.log("Raw Menu Actions:", menuActions[selectedMenuItem]);

  // Call the function to get the actions array
  const actions =
    typeof menuActions[selectedMenuItem] === "function"
      ? menuActions[selectedMenuItem]() // CALL the function
      : [];

  console.log("Resolved Menu Actions:", actions);

  return (
    <AppBar position="static" color="default">
      <Toolbar className="flex gap-4">
        {actions.length > 0 ? (
          actions.map((action) => (
            <IconButton key={action.key} color="primary">
              {action.icon} {/* Make sure action.icon exists */}
            </IconButton>
          ))
        ) : (
          <p>No actions available</p>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default TopMenu;
