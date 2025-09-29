import React, { useState } from "react";
import PageTopbar from "../components/PageTopbar";

const Provisional = ({ onToggleSidebar, onToggleChatbox }) => {
  const [selectedTopbarMenu, setSelectedTopbarMenu] = useState("🔍");
  const [panelOpen, setPanelOpen] = useState(true);
  const provisionalData = [{ id: 3, name: "Robert Brown", status: "Pending" }];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageTopbar
        title="Provisional"
        actions={["➕", "🔍", "📄 Report"]}
        selected={selectedTopbarMenu}
        onSelect={setSelectedTopbarMenu}
        actionsOnLeft
        rightSlot={
          <a href="/" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-white ml-2">
            🏠 Home
          </a>
        }
      />

      {/* Collapsible Action Box */}
      <div className="border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
          <div className="font-semibold">
            {selectedTopbarMenu === "➕" ? "ADD" : selectedTopbarMenu === "🔍" ? "SEARCH" : "REPORT"} Panel
          </div>
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
          >
            {panelOpen ? "Collapse" : "Expand"}
          </button>
        </div>
        {panelOpen && (
          <div className="p-4 text-sm text-gray-700">Action panel content…</div>
        )}
      </div>

      {/* Records Section */}
      <div className="bg-white shadow rounded-2xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {provisionalData.map((item) => (
            <div key={item.id} className="border rounded-xl p-4 shadow-sm">
              <p className="font-semibold">Name: {item.name}</p>
              <p>Status: {item.status}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Provisional;
