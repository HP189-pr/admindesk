import { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const API_BASE_URL = "http://127.0.0.1:8000";
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        const storedUser = localStorage.getItem("user");
        return storedUser ? JSON.parse(storedUser) : null;
    });

    const [profilePicture, setProfilePicture] = useState("/profilepic/default-profile.png");
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    // 🔹 Fetch user profile
    const fetchUserProfile = async () => {
        const token = localStorage.getItem("access_token");
    
        if (!token) {
            logout();
            return;
        }
    
        // Validate token before making API request
        try {
            await axios.post(`${API_BASE_URL}/api/token/verify/`, 
                { token },
                { headers: { "Content-Type": "application/json" } }
            );
        } catch (error) {
            console.error("❌ Token Verification Failed:", error.response?.data || error.message);
            await refreshToken();
            return;
        }
    
        // Fetch user profile
        try {
            const { data } = await axios.get(`${API_BASE_URL}/api/profile/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
    
            setUser({
                username: data.username || "",
                first_name: data.first_name || "",
                last_name: data.last_name || "",
                email: data.email || "",
                phone: data.phone || "",
                address: data.address || "",
                city: data.city || "",
                profile_picture: data.profile_picture || "/profilepic/default-profile.png",
                state: data.state || "",
                country: data.country || "",
                bio: data.bio || "",
                social_links: data.social_links || {},
                is_admin: data.is_admin || false,
            });
    
            setProfilePicture(data.profile_picture || "/profilepic/default-profile.png");
            setIsAdmin(data.is_admin || false);
            localStorage.setItem("user", JSON.stringify(data));
        } catch (error) {
            console.error("❌ Fetch User Error:", error.response?.data || error.message);
            if (error.response?.status === 401) await refreshToken();
        } finally {
            setLoading(false);
        }
    };
    

    useEffect(() => {
        const token = localStorage.getItem("access_token");
        if (token) {
            fetchUserProfile();
        } else {
            setUser(null);
            setProfilePicture("/profilepic/default-profile.png");
            setLoading(false);
        }
    }, []);

    // 🔹 Login function
    const login = async (identifier, password) => {
        try {
            const { data } = await axios.post(
                `${API_BASE_URL}/api/userlogin/`,
                { username: identifier, password },
                { headers: { "Content-Type": "application/json" } }
            );

            if (data.access) {
                localStorage.setItem("access_token", data.access);
                localStorage.setItem("refresh_token", data.refresh);
                await fetchUserProfile();
                return { success: true };
            }
            return { success: false, error: "Login failed. No access token received." };
        } catch (error) {
            return { success: false, error: error.response?.data?.detail || "Invalid credentials." };
        }
    };

    // 🔹 Verify password function
    const verifyPassword = async (password) => {
        try {
            const { status } = await axios.post(
                `${API_BASE_URL}/api/verify-password/`,
                { password },
                { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } }
            );
            return status === 200;
        } catch (error) {
            console.error("❌ Password Verification Error:", error.response?.data || error.message);
            return false;
        }
    };

    // 🔹 Refresh token function
    const refreshToken = async () => {
        const refresh_token = localStorage.getItem("refresh_token");
        if (!refresh_token) {
            logout();
            return false;
        }

        try {
            const { data } = await axios.post(`${API_BASE_URL}/api/token/refresh/`, { refresh: refresh_token });
            localStorage.setItem("access_token", data.access);
            await fetchUserProfile();
            return true;
        } catch (error) {
            console.error("❌ Token Refresh Error:", error.response?.data || error.message);
            logout();
            return false;
        }
    };

    // 🔹 Logout function
    const logout = (navigate) => {
        localStorage.clear();
        setUser(null);
        setProfilePicture("/profilepic/default-profile.png");
        setIsAdmin(false);
        if (navigate) navigate("/login");
    };

    // 🔹 Fetch all users
    const fetchUsers = async () => {
        try {
            const { data } = await axios.get(`${API_BASE_URL}/api/users/`, {
                headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
            });
            return data;
        } catch (error) {
            console.error("❌ Fetch Users Error:", error.response?.data || error.message);
            return [];
        }
    };
    
    // 🔹 Fetch user details by ID
    const fetchUserDetail = async (userId) => {
        try {
            const { data } = await axios.get(`${API_BASE_URL}/api/users/${userId}/`, {
                headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
            });
            return data;
        } catch (error) {
            console.error(`❌ Fetch User Detail Error (ID: ${userId}):`, error.response?.data || error.message);
            return null;
        }
    };

    return (
        <AuthContext.Provider value={{ user, isAdmin, profilePicture, loading, login, logout, refreshToken, verifyPassword, fetchUsers, fetchUserDetail }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
