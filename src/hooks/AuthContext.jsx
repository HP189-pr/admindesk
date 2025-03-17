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
    const [isAdmin, setIsAdmin] = useState(false); // ✅ Fixed: Separate admin state

    // 🔹 Fetch user profile
    const fetchUserProfile = async () => {
        const token = localStorage.getItem("access_token");
        if (!token) {
            logout();
            return;
        }

        try {
            const response = await axios.get(`${API_BASE_URL}/api/profile/`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.status === 200) {
                const profileData = response.data;

                const formattedUser = {
                    username: profileData.username || "",
                    first_name: profileData.first_name || "",
                    last_name: profileData.last_name || "",
                    email: profileData.email || "",
                    phone: profileData.phone || "",
                    address: profileData.address || "",
                    city: profileData.city || "",
                    profile_picture: profileData.profile_picture || "/profilepic/default-profile.png",
                    state: profileData.state || "",
                    country: profileData.country || "",
                    bio: profileData.bio || "",
                    social_links: profileData.social_links || {},
                    is_admin: profileData.is_admin || false, // ✅ Fixed: Admin flag
                };

                setUser(formattedUser);
                setProfilePicture(formattedUser.profile_picture);
                setIsAdmin(formattedUser.is_admin); // ✅ Properly update admin state
                localStorage.setItem("user", JSON.stringify(formattedUser));
            } else {
                throw new Error("Invalid response from server");
            }
        } catch (error) {
            console.error("❌ Fetch User Error:", error.response?.data || error.message);
            if (error.response?.status === 401) {
                await refreshToken();
            }
        } finally {
            setLoading(false);
        }
    };

    // 🔹 Check if user is an admin
    const checkAdminAccess = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/check-admin-access/`, {
                headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
            });

            if (response.status === 200) {
                setIsAdmin(response.data.is_admin);
            }
        } catch (error) {
            console.error("❌ Admin Check Error:", error.response?.data || error.message);
            setIsAdmin(false);
        }
    };

    useEffect(() => {
        const token = localStorage.getItem("access_token");
        if (token) {
            fetchUserProfile().then(() => checkAdminAccess()); // ✅ Call both functions
        } else {
            setUser(null);
            setProfilePicture("/profilepic/default-profile.png");
            setLoading(false);
        }
    }, []);

    // 🔹 Login function
    const login = async (identifier, password) => {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/userlogin/`,
                { username: identifier, password },
                { headers: { "Content-Type": "application/json" } }
            );

            if (response.data.access) {
                localStorage.setItem("access_token", response.data.access);
                localStorage.setItem("refresh_token", response.data.refresh);

                await fetchUserProfile(); // ✅ Fetch updated profile data after login
                await checkAdminAccess(); // ✅ Ensure admin status is updated
                return { success: true };
            }
            return { success: false, error: "Login failed. No access token received." };
        } catch (error) {
            return { success: false, error: error.response?.data?.detail || "Invalid credentials." };
        }
    };

    // 🔹 Verify password function
    const verifyPassword = async (password) => {
        const token = localStorage.getItem("access_token");

        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/verify-password/`,
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

    // 🔹 Refresh token function
    const refreshToken = async () => {
        const refresh_token = localStorage.getItem("refresh_token");
        if (!refresh_token) {
            logout();
            return false;
        }

        try {
            const response = await axios.post(`${API_BASE_URL}/api/token/refresh/`, {
                refresh: refresh_token,
            });

            localStorage.setItem("access_token", response.data.access);
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
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");

        setUser(null);
        setProfilePicture("/profilepic/default-profile.png");
        setIsAdmin(false);

        if (navigate) navigate("/login");
    };

    const fetchUsers = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/users/`, {
                headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
            });
            return response.data; // Returns the list of users
        } catch (error) {
            console.error("❌ Fetch Users Error:", error.response?.data || error.message);
            return [];
        }
    };
    
    // 🔹 Fetch user details by ID
    const fetchUserDetail = async (userId) => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/users/${userId}/`, {
                headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
            });
            return response.data; // Returns user details
        } catch (error) {
            console.error(`❌ Fetch User Detail Error (ID: ${userId}):`, error.response?.data || error.message);
            return null;
        }
    };

    return (
        <AuthContext.Provider value={{ user, isAdmin, profilePicture, loading, login, logout, refreshToken,verifyPassword,fetchUsers,fetchUserDetail }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
