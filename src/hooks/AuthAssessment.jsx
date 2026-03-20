// src/hooks/AuthAssessment.jsx
import React, { useEffect, useMemo, useState } from "react";
import API from "../api/axiosInstance";
import AssessmentPage from "../pages/assessment";
import { useAuth } from "./AuthContext";

const DEFAULT_RIGHTS = {
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
};

const FULL_RIGHTS = {
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
};

const MENU_KEYWORDS = [
  "assessment",
  "assessment entry",
  "assessment outward",
  "assessment receiver",
];

const AccessDenied = ({ message }) => (
  <div className="flex min-h-screen items-center justify-center bg-gray-50">
    <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-lg">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <span className="text-3xl">⚠️</span>
      </div>
      <h2 className="mb-2 text-2xl font-semibold text-gray-800">Access Denied</h2>
      <p className="mb-6 text-gray-600">{message}</p>
      <button
        type="button"
        onClick={() => (window.location.href = "/dashboard")}
        className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Back to Dashboard
      </button>
    </div>
  </div>
);

const LoadingState = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="text-center">
      <div className="mx-auto mb-4 h-14 w-14 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      <p className="text-gray-600">Checking permissions...</p>
    </div>
  </div>
);

const AuthAssessment = ({ onToggleSidebar, onToggleChatbox }) => {
  const { isAdmin } = useAuth();
  const [rights, setRights] = useState(DEFAULT_RIGHTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState("entry");

  const keywords = useMemo(() => MENU_KEYWORDS, []);

  useEffect(() => {
    const checkPermissions = async () => {
      setLoading(true);
      setError("");

      try {
        const token = localStorage.getItem("access_token");
        if (!token) {
          setError("Please login to continue.");
          setRights(DEFAULT_RIGHTS);
          return;
        }

        const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
        if (storedUser?.is_admin || storedUser?.is_superuser || isAdmin) {
          setRights(FULL_RIGHTS);
          setRole("controller");
          return;
        }

        const response = await API.get("/api/my-navigation/");
        const modules = response.data?.modules || [];

        const targetModule = modules.find((mod) =>
          (mod.name || "").toLowerCase().includes("exam")
        );

        if (!targetModule) {
          setError("Exam module permissions are not configured.");
          setRights(DEFAULT_RIGHTS);
          return;
        }

        let resolvedRights = DEFAULT_RIGHTS;

        for (const menu of targetModule.menus || []) {
          const menuName = (menu.name || "").toLowerCase();
          if (keywords.some((keyword) => menuName.includes(keyword))) {
            resolvedRights = {
              can_view: !!(menu.rights?.can_view ?? menu.rights?.view),
              can_create: !!(menu.rights?.can_create ?? menu.rights?.add),
              can_edit: !!(menu.rights?.can_edit ?? menu.rights?.edit),
              can_delete: !!(menu.rights?.can_delete ?? menu.rights?.delete),
            };
            break;
          }
        }

        setRights(resolvedRights);

        if (!resolvedRights.can_view) {
          setError("You do not have permission to access Assessment.");
        } else {
          // Ask the backend for the authoritative role.
          // Falls back through two levels so receiver users are always
          // identified correctly even on older server builds.
          let detectedRole = "entry";
          try {
            const roleRes = await API.get("/api/assessment-outward/my-role/");
            detectedRole = roleRes.data?.role || "entry";
          } catch {
            // my-role not available on this server build; try the older
            // receiver-assigned-outwards endpoint as a second signal.
            try {
              const myRes = await API.get("/api/assessment-outward/my/");
              // If the user has outwards assigned, they are definitely a receiver.
              // An empty array means no outwards assigned yet; fall back to the
              // can_create heuristic for that edge case.
              if (Array.isArray(myRes.data) && myRes.data.length > 0) {
                detectedRole = "receiver";
              } else {
                detectedRole = resolvedRights.can_create ? "entry" : "receiver";
              }
            } catch {
              // Final fallback: view-only permission → receiver; otherwise entry.
              detectedRole = resolvedRights.can_create ? "entry" : "receiver";
            }
          }
          setRole(detectedRole);
        }
      } catch (err) {
        console.error("AuthAssessment permission error:", err);
        setRights(DEFAULT_RIGHTS);
        setRole("entry");
        setError("Failed to verify permissions. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    checkPermissions();
  }, [keywords, isAdmin]);

  if (loading) return <LoadingState />;
  if (!rights.can_view) {
    return (
      <AccessDenied
        message={error || "You do not have permission to view this page."}
      />
    );
  }

  return (
    <AssessmentPage
      rights={rights}
      role={role}
      isAdmin={isAdmin}
      onToggleSidebar={onToggleSidebar}
      onToggleChatbox={onToggleChatbox}
    />
  );
};

export default AuthAssessment;
