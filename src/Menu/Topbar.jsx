import React from "react";
import menuActions from "./menuActions.jsx";

const TopMenu = ({ selectedMenuItem }) => {
  return (
    <div className="bg-gray-800 text-white p-4 flex gap-4">
      {selectedMenuItem && menuActions[selectedMenuItem]?.()?.map((action, index) => (
        <button key={index} className="p-2 bg-gray-700 rounded">
          {action}
        </button>
      ))}
    </div>
  );
};

export default TopMenu;
