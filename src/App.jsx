import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/AuthContext.jsx";
import Login from "./pages/Login";
import Sidebar from "./Menu/Sidebar";
import WorkArea from "./pages/WorkArea";

const ProtectedRoute = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) return <p>Loading...</p>;

    return user ? children : <Navigate to="/login" />;
};

// ✅ Layout component with Sidebar & WorkArea
const Layout = () => {
    const [selectedMenuItem, setSelectedMenuItem] = useState(null);
    const [isSidebarOpen, setSidebarOpen] = useState(true);

    return (
        <div className="flex">
            <Sidebar isOpen={isSidebarOpen} setSidebarOpen={setSidebarOpen} setSelectedMenuItem={setSelectedMenuItem} />
            <div className="flex-1">
                <WorkArea selectedSubmenu={selectedMenuItem} />
            </div>
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
