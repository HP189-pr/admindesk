import React from "react";
import menuActions from "./menuActions.jsx";

const TopMenu = ({ selectedMenuItem }) => {
  return (
    <div className="bg-gray-100 shadow-md p-3 flex gap-4">
      {selectedMenuItem &&
        menuActions[selectedMenuItem]?.map((action) => (
          <button
            key={action.key}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            {action.label}
          </button>
        ))}
    </div>
  );
};

export default TopMenu;
