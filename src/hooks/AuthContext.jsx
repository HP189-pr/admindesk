import { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const API_BASE_URL = "http://127.0.0.1:8000"; // Make sure this matches your Django backend

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        const storedUser = localStorage.getItem("user");
        return storedUser ? JSON.parse(storedUser) : null;
    });

    const [loading, setLoading] = useState(true);

    // Fetch user profile on load
    useEffect(() => {
        const fetchUserProfile = async () => {
            const token = localStorage.getItem("access_token");
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
                    const profileData = response.data;
    
                    const formattedUser = {
                        username: profileData.username || "",
                        first_name: profileData.first_name || "",
                        last_name: profileData.last_name || "",
                        email: profileData.email || "",
                        phone: profileData.phone || "",
                        address: profileData.address || "",
                        city: profileData.city || "",
                        profile_picture: profileData.profile_picture || null,  // Full URL from backend
                        state: profileData.state || "",
                        country: profileData.country || "",
                        bio: profileData.bio || "",
                        social_links: profileData.social_links || {},
                    };
    
                    setUser(formattedUser);
                    localStorage.setItem("user", JSON.stringify(formattedUser));
                    console.log("✅ Fetched User Profile:", formattedUser);
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
    
        const fetchProfilePicture = async () => {
            const token = localStorage.getItem("access_token");
            if (!token) return;
    
            try {
                const response = await axios.get(`${API_BASE_URL}/api/profile-picture/`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (response.status === 200) {
                    setProfilePicture(response.data.profile_picture);
                    console.log("✅ Fetched Profile Picture:", response.data.profile_picture);
                }
            } catch (error) {
                console.error("❌ Failed to fetch profile picture:", error);
            }
        };
    
        fetchUserProfile();
        fetchProfilePicture();
    
    }, []);  // Or add [token] if you want it to refetch after login
    
    const login = async (identifier, password) => {
        try {
            const loginPayload = { username: identifier, password };
    
            const response = await axios.post(
                `${API_BASE_URL}/api/userlogin/`, 
                loginPayload,
                { headers: { "Content-Type": "application/json" } }
            );
    
            // ✅ Match Django's response structure
            if (response.data.access) {   // ✅ Correct check
                localStorage.setItem("access_token", response.data.access);   // ✅ Use 'access'
                localStorage.setItem("refresh_token", response.data.refresh); // ✅ Use 'refresh'
                localStorage.setItem("user", JSON.stringify(response.data.user));
                setUser(response.data.user);
                return { success: true };
            }
    
            return { success: false, error: "Login failed. No access token received." };
        } catch (error) {
            return { success: false, error: error.response?.data?.detail || "Invalid credentials." };
        }
    };

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

    const refreshToken = async () => {
        const refresh_token = localStorage.getItem("refresh_token");
        if (!refresh_token) {
            logout();
            return;
        }

        try {
            const response = await axios.post(`${API_BASE_URL}/api/token/refresh/`, {
                refresh: refresh_token,
            });

            localStorage.setItem("access_token", response.data.access);
            return true;
        } catch (error) {
            console.error("❌ Token Refresh Error:", error.response?.data || error.message);
            logout();
            return false;
        }
    };

    const logout = (navigate) => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
        setUser(null);
        if (navigate) navigate("/login");
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, verifyPassword }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
