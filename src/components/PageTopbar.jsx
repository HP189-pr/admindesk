import React from "react";

const PageTopbar = ({
  title,
  titleClassName,
  titleSlot,
  actions = [],
  selected,
  onSelect,
  leftSlot,
  rightSlot,
  onToggleSidebar,
  onToggleChatbox,
  actionsOnLeft = true,
}) => {
  return (
    <div className="w-full bg-white border-b px-3 py-2 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-2">
        {onToggleSidebar && (
          <button
            onClick={() => onToggleSidebar()}
            className="px-3 py-1.5 rounded bg-gray-800 text-white hover:bg-gray-700"
            title="Toggle sidebar"
          >
            ☰
          </button>
        )}
        {leftSlot}
        {titleSlot ? (
          titleSlot
        ) : title ? (
          <h2 className={["text-base font-semibold mr-2", titleClassName || ""].join(" ")}>{title}</h2>
        ) : null}
        {/* Optional: render actions on the left side */}
        {actionsOnLeft && actions.length > 0 && (
          <div className="flex items-center gap-2 ml-2">
            {actions.map((action) => (
              <button
                key={action}
                onClick={() => onSelect && onSelect(action)}
                className={[
                  "px-3 py-1.5 rounded border text-sm",
                  selected === action
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white hover:bg-gray-50 border-gray-300",
                ].join(" ")}
              >
                {action}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Otherwise render actions on the right side */}
        {!actionsOnLeft && actions.map((action) => (
          <button
            key={action}
            onClick={() => onSelect && onSelect(action)}
            className={[
              "px-3 py-1.5 rounded border text-sm",
              selected === action
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white hover:bg-gray-50 border-gray-300",
            ].join(" ")}
          >
            {action}
          </button>
        ))}
        {onToggleChatbox && (
          <button
            onClick={() => onToggleChatbox()}
            className="px-3 py-1.5 rounded bg-gray-800 text-white hover:bg-gray-700"
            title="Toggle chat"
          >
            💬
          </button>
        )}
        {rightSlot}
      </div>
    </div>
  );
};

export default PageTopbar;
