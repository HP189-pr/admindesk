import { createContext, useContext, useState, useEffect } from "react";
import axios from "../api/axiosInstance";
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        const storedUser = localStorage.getItem("user");
        return storedUser ? JSON.parse(storedUser) : null;
    });
    const [token, setToken] = useState(() => localStorage.getItem("access_token"));

    const [profilePicture, setProfilePicture] = useState("/profilepic/default-profile.png");
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    // 🔹 Fetch user profile
    const fetchUserProfile = async () => {
        const storedToken = localStorage.getItem("access_token");
        if (!storedToken) {
            setLoading(false);
            return;
        }
        // Validate token before making API request
        try {
            await axios.post(`/token/verify/`, 
                { token: storedToken },
                { headers: { "Content-Type": "application/json" } }
            );
        } catch (error) {
            console.error("❌ Token Verification Failed:", error.response?.data || error.message);
            const refreshed = await refreshToken();
            if (!refreshed) {
                setLoading(false);
            }
            return;
        }
        setToken(storedToken);
        // Fetch user profile
        try {
            const { data } = await axios.get(`/profile/`, {
                headers: { Authorization: `Bearer ${storedToken}` },
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
            // Initially set isAdmin from profile payload
            let adminFlag = !!(data.is_admin);
            try {
                // Fallback/confirmation: call server to check admin access via flags/groups
                const checkRes = await axios.get(`/check-admin-access/`, {
                    headers: { Authorization: `Bearer ${storedToken}` },
                    validateStatus: () => true,
                });
                if (checkRes.status === 200 && checkRes.data && typeof checkRes.data.is_admin !== 'undefined') {
                    adminFlag = !!checkRes.data.is_admin;
                }
            } catch (e) {
                // ignore, keep profile flag
            }
            setIsAdmin(adminFlag);
            localStorage.setItem("user", JSON.stringify(data));
        } catch (error) {
            console.error("❌ Fetch User Error:", error.response?.data || error.message);
            if (error.response?.status === 401) await refreshToken();
        } finally {
            setLoading(false);
        }
    };
    

    useEffect(() => {
        const storedToken = localStorage.getItem("access_token");
        const initAuth = async () => {
            if (storedToken) {
                await fetchUserProfile();
            } else {
                setUser(null);
                setProfilePicture("/profilepic/default-profile.png");
                setLoading(false);
            }
        };
        initAuth();
    }, []);

    // 🔹 Login function
    const login = async (identifier, password) => {
        try {
            const { data } = await axios.post(
                `/userlogin/`,
                { username: identifier, password },
                { headers: { "Content-Type": "application/json" } }
            );
            if (data.access) {
                localStorage.setItem("access_token", data.access);
                localStorage.setItem("refresh_token", data.refresh);
                setToken(data.access);
                await fetchUserProfile();
                return { success: true };
            }
            return { success: false, error: "Login failed. No access token received." };
        } catch (error) {
            return { success: false, error: error.response?.data?.detail || "Invalid credentials." };
        }
    };

    // 🔹 Verify user password (for general secure pages)
    const verifyPassword = async (password) => {
        try {
            const { status } = await axios.post(
                `/verify-password/`,
                { password },
                { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } }
            );
            return status === 200;
        } catch (error) {
            console.error("❌ Password Verification Error:", error.response?.data || error.message);
            return false;
        }
    };

    // 🔹 Admin Panel special password verification (server-configured)
    const verifyAdminPanelPassword = async (password) => {
        try {
            const res = await axios.post(
                `/verify-admin-panel-password/`,
                { password },
                {
                    headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
                    withCredentials: true,
                    validateStatus: () => true,
                }
            );
            if (res.status === 200) return { success: true, message: res.data?.message || "Admin panel access granted." };
            // surface message from server when available
            return { success: false, message: res.data?.detail || res.data?.message || "Invalid admin panel password." };
        } catch (error) {
            console.error('❌ Admin Panel Verify Error:', error.response?.data || error.message);
            return { success: false, message: error.response?.data?.detail || "Failed to verify admin password." };
        }
    };

    // 🔹 Check if admin panel already verified in this session
    const isAdminPanelVerified = async () => {
        try {
            const { data } = await axios.get(`/verify-admin-panel-password/`, {
                headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
                withCredentials: true,
            });
            return !!data?.verified;
        } catch (e) {
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
            const { data } = await axios.post(`/token/refresh/`, { refresh: refresh_token });
            localStorage.setItem("access_token", data.access);
            setToken(data.access);
            // Don't call fetchUserProfile here to avoid loop
            setLoading(false);
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
        setToken(null);
        if (navigate) navigate("/login");
    };

    // 🔹 Fetch all users
    const fetchUsers = async () => {
        try {
            const { data } = await axios.get(`/users/`, {
                headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
            });
            return data;
        } catch (error) {
            console.error("❌ Fetch Users Error:", error.response?.data || error.message);
            return [];
        }
    };

    // 🔹 Create a new user (calls backend)
    const createUser = async (payload) => {
        try {
            const { data } = await axios.post(`/users/`, payload, {
                headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}`, 'Content-Type': 'application/json' }
            });
            return { success: true, data };
        } catch (error) {
            console.error('❌ Create User Error:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    };

    // 🔹 Update existing user
    const updateUser = async (userId, payload) => {
        try {
            const { data } = await axios.put(`/users/${userId}/`, payload, {
                headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}`, 'Content-Type': 'application/json' }
            });
            return { success: true, data };
        } catch (error) {
            console.error('❌ Update User Error:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    };
    
    // 🔹 Fetch user details by ID
    const fetchUserDetail = async (userId) => {
        try {
            const { data } = await axios.get(`/users/${userId}/`, {
                headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
            });
            return data;
        } catch (error) {
            console.error(`❌ Fetch User Detail Error (ID: ${userId}):`, error.response?.data || error.message);
            return null;
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, isAdmin, profilePicture, loading, login, logout, refreshToken, verifyPassword, verifyAdminPanelPassword, isAdminPanelVerified, fetchUsers, fetchUserDetail, createUser, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
