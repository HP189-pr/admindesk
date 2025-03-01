import { useState, useEffect } from "react";
import axios from "axios";

const API_BASE_URL = "http://127.0.0.1:8000";

const useAuth = () => {
    const [user, setUser] = useState(() => {
        const storedUser = localStorage.getItem("user");
        return storedUser ? JSON.parse(storedUser) : null;
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            const token = localStorage.getItem("token");
            if (!token) {
                setUser(null);
                setLoading(false);
                return;
            }

            try {
                const response = await axios.get(`${API_BASE_URL}/api/profile/`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (response.status === 200) {
                    setUser(response.data);
                    localStorage.setItem("user", JSON.stringify(response.data));
                } else {
                    throw new Error("Invalid response from server");
                }
            } catch (error) {
                console.error("❌ Fetch User Error:", error.response?.data || error.message);
                if (error.response?.status === 401) {
                    console.warn("⚠ Token invalid. Logging out...");
                    logout();
                }
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
    }, []);

    const login = async (identifier, password) => {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/userlogin/`,
                { identifier, usrpassword: password },
                { headers: { "Content-Type": "application/json" } }
            );

            if (response.data.token) {
                localStorage.setItem("token", response.data.token);
                localStorage.setItem("user", JSON.stringify(response.data.user));
                setUser(response.data.user);
                return { success: true };
            }

            return { success: false, error: "Login failed. No token received." };
        } catch (error) {
            return { success: false, error: error.response?.data?.detail || "Invalid credentials." };
        }
    };

    const verifyPassword = async (password) => {
        const token = localStorage.getItem("token");
        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/verify-password`,
                { password },
                {
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                }
            );
            return response.status === 200;
        } catch (error) {
            console.error("❌ Password Verification Error:", error.response?.data || error.message);
            return false;
        }
    };

    const logout = (navigate) => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setUser(null);
        if (navigate) navigate("/login");  // Optional navigation if passed
    };

    return { user, loading, login, logout, verifyPassword };
};

export default useAuth;
