import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/AuthContext.jsx";
import Login from "./pages/Login";
import Sidebar from "./Menu/Sidebar";
import WorkArea from "./pages/WorkArea";
import ChatBox from "./components/ChatBox";

const ProtectedRoute = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) return <p>Loading...</p>;

    return user ? children : <Navigate to="/login" />;
};

// ✅ Layout component with Sidebar & WorkArea
const Layout = () => {
    const [selectedMenuItem, setSelectedMenuItem] = useState(null);
    const [isSidebarOpen, setSidebarOpen] = useState(true);
    const [isChatboxOpen, setChatboxOpen] = useState(false);

    return (
        <div className="flex items-stretch gap-[1px]">
            {/* Left rail */}
            <Sidebar isOpen={isSidebarOpen} setSidebarOpen={setSidebarOpen} setSelectedMenuItem={setSelectedMenuItem} />

            {/* Work area (no side padding; gap is handled by parent flex gap + spacer) */}
            <div className="flex-1 min-h-screen relative transition-all duration-300">
                <WorkArea
                  selectedSubmenu={selectedMenuItem}
                  onToggleSidebar={() => setSidebarOpen((v) => !v)}
                  onToggleChatbox={() => setChatboxOpen((v) => !v)}
                  isSidebarOpen={isSidebarOpen}
                  isChatboxOpen={isChatboxOpen}
                />
            </div>

            {/* Right spacer to maintain a constant gap to the chat (collapsed/expanded) */}
                        <div
                            aria-hidden
                            className="shrink-0 transition-all duration-300"
                            style={{ width: isChatboxOpen ? 261 : 61 }}
                        />

            {/* Chat rail fixed to the right edge */}
            <ChatBox isOpen={isChatboxOpen} onToggle={(v) => setChatboxOpen(typeof v === 'boolean' ? v : !isChatboxOpen)} />
        </div>
    );
};

const App = () => {
    return (
        <AuthProvider>
            <Router>
                <Routes>
                    <Route path="/" element={<Navigate to="/login" />} />
                    <Route path="/login" element={<Login />} />
                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute>
                                <Layout /> {/* ✅ Replacing Dashboard with Layout */}
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </Router>
        </AuthProvider>
    );
};

export default App;
