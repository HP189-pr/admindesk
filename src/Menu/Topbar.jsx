import React from "react";
import menuActions from "./menuActions.jsx";

const Topbar = ({ selectedMenuItem }) => {
    const actions = menuActions[selectedMenuItem]?.() || [];  // Call the function to get array, fallback to empty array if missing.

    return (
        <div className="bg-gray-100 shadow-md p-3 flex items-center gap-4 min-h-[5rem]">
            {selectedMenuItem && actions.map((action, index) => (
                <button
                    key={index}  // Since actions are just emojis, index is safe to use.
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                    {action}
                </button>
            ))}
        </div>
    );
};

export default Topbar;
