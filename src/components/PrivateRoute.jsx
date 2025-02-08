import { Navigate } from "react-router-dom";

// Function to check if user is authenticated
const isAuthenticated = () => {
  return localStorage.getItem("token") !== null; // Check if token exists in localStorage
};

const PrivateRoute = ({ children }) => {
  return isAuthenticated() ? children : <Navigate to="/login" />;
};

export default PrivateRoute;
