import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import useAuth from "./hooks/useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <p>Loading...</p>; // ✅ Prevents redirect before auth check is done

  return user ? children : <Navigate to="/login" />;
};

const App = () => {
  const { user, loading } = useAuth();

  return (
    <Router>
      <Routes>
        {/* Redirect '/' based on login status */}
        <Route
          path="/"
          element={
            loading ? (
              <p>Loading...</p>
            ) : user ? (
              <Navigate to="/dashboard" />
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        {/* Login Page (Accessible to everyone) */}
        <Route path="/login" element={<Login />} />

        {/* Dashboard (Protected) */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
};

export default App;
