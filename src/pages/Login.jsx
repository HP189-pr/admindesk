import React, { useState, useEffect } from "react";
import axios from "axios";
import Clock from "../components/Clock";
import MenuIcon from "@mui/icons-material/Menu";

const API_BASE_URL = "http://127.0.0.1:8000";

const Login = () => {
  const [form, setForm] = useState({ identifier: "", usrpassword: "" });
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHolidays, setShowHolidays] = useState(false);
  const [holidays, setHolidays] = useState([]);
  const [holidaysLoading, setHolidaysLoading] = useState(false);

  // Fetch holidays from API
  useEffect(() => {
    const fetchHolidays = async () => {
      setHolidaysLoading(true);
      try {
        const response = await axios.get(`${API_BASE_URL}/holidays/`);
        setHolidays(response.data);
      } catch (error) {
        console.error("Error fetching holidays:", error);
      } finally {
        setHolidaysLoading(false);
      }
    };
    fetchHolidays();
  }, []);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replace(" ", "-");
  };

  const handleChange = (e) => {
    const { id, value } = e.target;
    setForm((prev) => ({ ...prev, [id]: value }));
  };

  const handleLogin = async () => {
    console.log("Logging in with:", form);
    if (!form.identifier || !form.usrpassword) {
      setLoginError("Both fields are required.");
      return;
    }

    setLoginError("");
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/userlogin/`, form);
      console.log("Login successful:", response.data);

      // Save token and user data
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));

      // Redirect to dashboard
      window.location.href = "/dashboard";
    } catch (error) {
      console.error("Login error:", error);
      setLoginError(
        error.response?.data?.detail || "Invalid username or password."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center 
    bg-gradient-to-r from-dashboardDark to-dashboardPrimary 
    animate-gradient">

      {/* Clock (Top Right Corner) */}
      <div className="absolute top-1 right-2 ">
        <Clock className="text-[#4b0082] text-xl" />
      </div>

      {/* Holiday Toggle (Top Left Corner) */}
      <div className="absolute top-4 left-4">
        <button
          className="flex items-center gap-2 bg-gradient-to-r from-peacockPurple via-peacockGreen to-peacockTeal 
                    text-white px-4 py-2 rounded-lg shadow-lg hover:opacity-90 transition font-semibold"
          onClick={() => setShowHolidays(!showHolidays)}
        >
          Show Holidays
          <MenuIcon />
        </button>

        {/* Holiday List */}
        {showHolidays && (
          <div className="mt-2 bg-white p-4 rounded-lg shadow-lg border border-gray-300 w-64">
            <h3 className="text-center text-lg font-semibold text-gray-800 mb-2">
              Upcoming Holidays
            </h3>
            {holidaysLoading ? (
              <p className="text-center text-peacockPurple">Loading...</p>
            ) : (
              <div className="space-y-2">
                {holidays.map((holiday, index) => (
                  <div
                    key={holiday.id || index}
                    className="bg-gradient-to-r from-peacockTeal to-peacockGreen 
                             text-white p-2 rounded-md text-center shadow-md"
                  >
                    {formatDate(holiday.holiday_date)}, {holiday.holiday_day.slice(0, 3)} - {holiday.holiday_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Login Form */}
      <div className="flex flex-col md:flex-row bg-gradient-to-b from-[#fefefe] to-[#ecf8ff] rounded-xl opacity-85 shadow-lg w-full max-w-3xl border-4 border-[#4b0082]">
        {/* Left Side - Login Form */}
        <div className="w-full md:w-1/2 p-8 flex flex-col justify-center">
          <h2 className="text-3xl font-bold text-gray-800 text-center mb-4">
            Welcome
          </h2>
          <p className="text-gray-600 text-center mb-6">
            Please log in to continue.
          </p>

          {/* Username Input */}
          <input
            id="identifier"
            type="text"
            placeholder="Username or ID"
            value={form.identifier}
            onChange={handleChange}
            className="w-full p-3 border rounded-md mb-3 focus:ring-4 focus:ring-[#009966] transition outline-none"
          />

          {/* Password Input */}
          <input
            id="usrpassword"
            type="password"
            placeholder="Password"
            value={form.usrpassword}
            onChange={handleChange}
            className="w-full p-3 border rounded-md mb-3 focus:ring-4 focus:ring-[#009966] transition outline-none"
          />

          {/* Login Error Message */}
          {loginError && (
            <p className="text-red-500 text-sm text-center">{loginError}</p>
          )}

          {/* Login Button */}
          <button
            onClick={handleLogin}
            className="w-full bg-gradient-to-r from-[#4b0082] to-[#009966] hover:opacity-80 text-white py-2 rounded-md mt-4 transition font-semibold"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </div>

        {/* Right Side - Logo & University Name */}
        <div className="w-full md:w-1/2 bg-[#2d90d300] bg-opacity-90 p-8 flex flex-col justify-center items-center text-[#008dc2]">
          <img src="/logo.png" alt="KSV Logo" className="h-30 w-30 mb-4" />
          <h3 className="text-3xl font-bold text-center">
            Kadi Sarva Vishwavidyalaya
          </h3>
        </div>
      </div>
    </div>
  );
};

export default Login;
