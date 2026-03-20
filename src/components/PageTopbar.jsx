// src/components/PageTopbar.jsx
import React from "react";
import { useNavigate } from 'react-router-dom';
import { useAuth } from "../hooks/AuthContext";

const TOPBAR_ICON_BUTTON_CLASS = "inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-800 px-3 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-slate-700";
const TOPBAR_ACTION_BUTTON_BASE_CLASS = "inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-semibold shadow-sm transition duration-200 hover:-translate-y-0.5";
const TOPBAR_SLOT_WRAPPER_CLASS = "flex items-center gap-2 [&_button]:!rounded-xl [&_button]:transition [&_button]:duration-200 [&_button]:ease-out [&_a]:!rounded-xl [&_a]:transition [&_a]:duration-200 [&_a]:ease-out";
const TOPBAR_HOME_BUTTON_CLASS = "inline-flex h-10 items-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-slate-700";

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
  showHomeButton = true,
  homePath = '/dashboard',
}) => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 z-20 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className={TOPBAR_SLOT_WRAPPER_CLASS}>
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
                type="button"
                onClick={() => onSelect && onSelect(action)}
                className={[
                  TOPBAR_ACTION_BUTTON_BASE_CLASS,
                  selected === action
                    ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                ].join(" ")}
              >
                {action}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={TOPBAR_SLOT_WRAPPER_CLASS}>
        {/* Otherwise render actions on the right side */}
        {!actionsOnLeft && actions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => onSelect && onSelect(action)}
            className={[
              TOPBAR_ACTION_BUTTON_BASE_CLASS,
              selected === action
                ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
            ].join(" ")}
          >
            {action}
          </button>
        ))}
        {showHomeButton && isAdmin && (
          <button
            type="button"
            onClick={() => {
              try {
                window.dispatchEvent(new CustomEvent('admindesk_go_home'));
              } catch (e) {
                // ignore if window/custom events unavailable
              }
              navigate(homePath);
            }}
            className={TOPBAR_HOME_BUTTON_CLASS}
          >
            🏠 Home
          </button>
        )}
        {onToggleChatbox && (
          <button
            type="button"
            onClick={() => onToggleChatbox()}
            className={TOPBAR_ICON_BUTTON_CLASS}
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
