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

    const fetchUserProfile = async () => {
        const token = localStorage.getItem("access_token");
        if (!token) {
            setUser(null);
            setProfilePicture("/profilepic/default-profile.png");
            setLoading(false);
            return;
        }

        try {
            const response = await axios.get(`${API_BASE_URL}/api/profile/`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.status === 200) {
                const profileData = response.data;
                console.log("Profile Data:", profileData); // Debugging

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
                };

                setUser(formattedUser);
                localStorage.setItem("user", JSON.stringify(formattedUser));
                console.log("✅ Fetched User Profile:", formattedUser);

                // Update profile picture
                setProfilePicture(profileData.profile_picture || "/profilepic/default-profile.png");
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
                localStorage.setItem("user", JSON.stringify(response.data.user));
                setUser(response.data.user);

                // Fetch the user's profile data after login
                await fetchUserProfile();

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

    const logout = (navigate) => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
        setUser(null);
        setProfilePicture("/profilepic/default-profile.png"); // Set default profile picture
        if (navigate) navigate("/login");
    };

    return (
        <AuthContext.Provider value={{ user, profilePicture, loading, login, logout, verifyPassword }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);