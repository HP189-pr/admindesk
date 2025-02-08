import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Cookies from "js-cookie";
import axios from "axios";

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch user data from JWT token
    const token = Cookies.get("token");

    if (!token) {
      navigate("/login");
      return;
    }

    axios
      .get("http://localhost:1337/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((response) => {
        setUser(response.data.user);
      })
      .catch(() => {
        Cookies.remove("token");
        navigate("/login");
      });
  }, [navigate]);

  const handleLogout = () => {
    Cookies.remove("token");
    navigate("/login");
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Welcome to Dashboard</h1>
      {user ? (
        <div className="mt-4">
          <p><strong>User ID:</strong> {user.userid}</p>
          <p><strong>User Code:</strong> {user.usercode}</p>
          <p><strong>Username:</strong> {user.username}</p>
          <p><strong>User Type:</strong> {user.usertype}</p>
        </div>
      ) : (
        <p>Loading user data...</p>
      )}
      <button onClick={handleLogout} className="bg-red-500 text-white p-2 mt-4 rounded">Logout</button>
    </div>
  );
};

export default Dashboard;
