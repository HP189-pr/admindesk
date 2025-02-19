import React from "react";
import { AppBar, Toolbar, IconButton } from "@mui/material";
import menuActions from "./menuActions";

const TopMenu = ({ selectedMenuItem }) => {
  return (
    <AppBar position="static" color="default">
      <Toolbar className="flex gap-4">
        {selectedMenuItem && menuActions[selectedMenuItem]?.map((action) => (
          <IconButton key={action.key} color="primary">
            {action}
          </IconButton>
        ))}
      </Toolbar>
    </AppBar>
  );
};

export default TopMenu;
