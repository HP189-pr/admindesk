// src/App.jsx
import React, { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/AuthContext.jsx";
import API from "./api/axiosInstance";

const Login = lazy(() => import("./pages/Login"));
const Sidebar = lazy(() => import("./Menu/Sidebar"));
const WorkArea = lazy(() => import("./pages/WorkArea"));
const CustomDashboard = lazy(() =>
    import("./pages/Dashboard").then((module) => ({ default: module.CustomDashboard }))
);
const ChatBox = lazy(() => import("./components/ChatBox"));
const PopupSearch = lazy(() => import("./components/popupsearch"));

const FullScreenLoader = ({ message = "Loading..." }) => (
    <div className="flex h-screen items-center justify-center bg-gray-100 text-sm font-medium text-gray-600">
        {message}
    </div>
);

const ProtectedRoute = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) return <FullScreenLoader message="Checking session..." />;

    return user ? children : <Navigate to="/login" replace />;
};

// ✅ Layout component with Sidebar & WorkArea
const Layout = () => {
    const { isAdmin, user } = useAuth();
    const [selectedMenuItem, setSelectedMenuItem] = useState('Dashboard');
    const [isSidebarOpen, setSidebarOpen] = useState(true);
    const [isChatboxOpen, setChatboxOpen] = useState(false);
    const [canUsePopupSearch, setCanUsePopupSearch] = useState(isAdmin);

    useEffect(() => {
        let active = true;

        const loadPopupAccess = async () => {
            if (isAdmin) {
                if (active) setCanUsePopupSearch(true);
                return;
            }

            if (!user) {
                if (active) setCanUsePopupSearch(false);
                return;
            }

            try {
                const response = await API.get("/api/my-navigation/");
                const modules = Array.isArray(response.data?.modules) ? response.data.modules : [];
                const studentModule = modules.find(
                    (module) => String(module?.name || "").toLowerCase() === "student module"
                );
                const hasStudentAccess = (studentModule?.menus || []).some(
                    (menu) => !!menu?.rights?.can_view
                );
                if (active) setCanUsePopupSearch(hasStudentAccess);
            } catch {
                if (active) setCanUsePopupSearch(false);
            }
        };

        loadPopupAccess();
        return () => {
            active = false;
        };
    }, [isAdmin, user]);

    useEffect(() => {
        if (!selectedMenuItem) {
            setSelectedMenuItem('Dashboard');
        }
    }, [selectedMenuItem]);

    return (
        <div className="h-screen overflow-hidden flex items-stretch gap-1">
            <Suspense fallback={<FullScreenLoader message="Loading workspace..." />}>
                {/* Left rail */}
                <div className="bg-gray-800 pl-4 pr-0 py-4 h-screen shrink-0">
                    <Sidebar
                        isOpen={isSidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        setSelectedMenuItem={setSelectedMenuItem}
                        selectedMenuItem={selectedMenuItem}
                    />
                </div>

                {/* Work area (no side padding; gap is handled by parent flex gap + spacer) */}
                <div className="flex-1 h-screen relative transition-all duration-300 overflow-hidden">
                    <WorkArea
                        selectedSubmenu={selectedMenuItem}
                        selectedMenuItem={selectedMenuItem}
                        setSelectedMenuItem={setSelectedMenuItem}
                        onToggleSidebar={() => setSidebarOpen((v) => !v)}
                        onToggleChatbox={() => setChatboxOpen((v) => !v)}
                        isSidebarOpen={isSidebarOpen}
                        isChatboxOpen={isChatboxOpen}
                        setSidebarOpen={setSidebarOpen}
                        DashboardComponent={CustomDashboard}
                    />
                    {canUsePopupSearch && <PopupSearch />}
                </div>

                {/* Right spacer to maintain a constant gap to the chat (collapsed/expanded) */}
                <div
                    aria-hidden
                    className="shrink-0 transition-all duration-300"
                    style={{ width: isChatboxOpen ? 261 : 61 }}
                />

                {/* Chat rail fixed to the right edge */}
                <ChatBox isOpen={isChatboxOpen} onToggle={(v) => setChatboxOpen(typeof v === "boolean" ? v : !isChatboxOpen)} />
            </Suspense>
        </div>
    );
};

const App = () => {
    return (
        <AuthProvider>
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Routes>
                    <Route path="/" element={<Navigate to="/login" replace />} />
                    <Route
                        path="/login"
                        element={
                            <Suspense fallback={<FullScreenLoader message="Loading login..." />}>
                                <Login />
                            </Suspense>
                        }
                    />
                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute>
                                <Layout />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </Router>
        </AuthProvider>
    );
};

export default App;
