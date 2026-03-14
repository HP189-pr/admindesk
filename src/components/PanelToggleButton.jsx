import React from "react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";

const PanelToggleButton = ({
  open,
  onClick,
  className = "",
  collapsedLabel = "Expand",
  expandedLabel = "Collapse",
}) => {
  const label = open ? expandedLabel : collapsedLabel;

  return (
    <button
      type="button"
      onClick={onClick}
      className={["panel-toggle-button", className].filter(Boolean).join(" ")}
      aria-expanded={open}
      aria-label={label}
      title={label}
    >
      {open ? <FaChevronUp className="text-[11px]" /> : <FaChevronDown className="text-[11px]" />}
      <span>{label}</span>
    </button>
  );
};

export default PanelToggleButton;