import { createContext, useContext, useState, useEffect } from "react";
import API from "../api/axiosInstance";

const AuthContext = createContext({
    user: null,
    token: null,
    isAdmin: false,
    profilePicture: "/profilepic/default-profile.png",
    loading: true,
    login: async () => ({ success: false, error: "Auth not initialized" }),
    logout: () => {},
    refreshToken: async () => false,
    verifyPassword: async () => ({ success: false }),
    verifyAdminPanelPassword: async () => ({ success: false }),
    isAdminPanelVerified: false,
    fetchUsers: async () => [],
    fetchUserDetail: async () => null,
    createUser: async () => ({ success: false }),
    updateUser: async () => ({ success: false }),
});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        const storedUser = localStorage.getItem("user");
        return storedUser ? JSON.parse(storedUser) : null;
    });

    const [token, setToken] = useState(() =>
        localStorage.getItem("access_token")
    );

    const [profilePicture, setProfilePicture] = useState(
        "/profilepic/default-profile.png"
    );

    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    /* ==================== HELPERS ==================== */

    const normalizeMediaUrl = (value) => {
        if (!value) return value;
        try {
            const url = new URL(value, window.location.origin);
            // If backend returned absolute URL with localhost/127.0.0.1, strip origin
            if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
                return url.pathname + url.search + url.hash;
            }
        } catch {
            // if value is already a relative path, just return it
        }
        return value;
    };

    const authHeader = () => ({
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
    });

    /* ==================== FETCH USER PROFILE ==================== */

    const fetchUserProfile = async () => {
        const storedToken = localStorage.getItem("access_token");
        if (!storedToken) {
            setLoading(false);
            return;
        }

        // 1️⃣ Verify token
        try {
            await API.post("/api/token/verify/", { token: storedToken });
        } catch (err) {
            console.error(
                "❌ Token Verification Failed:",
                err.response?.data || err.message
            );
            const refreshed = await refreshToken();
            if (!refreshed) {
                setLoading(false);
            }
            return;
        }

        setToken(storedToken);

        // 2️⃣ Fetch profile
        try {
            const { data } = await API.get("/api/profile/", {
                headers: authHeader(),
            });

            setUser({
                username: data.username || "",
                first_name: data.first_name || "",
                last_name: data.last_name || "",
                email: data.email || "",
                phone: data.phone || "",
                address: data.address || "",
                city: data.city || "",
                state: data.state || "",
                country: data.country || "",
                bio: data.bio || "",
                social_links: data.social_links || {},
                profile_picture:
                    normalizeMediaUrl(data.profile_picture) || "/profilepic/default-profile.png",
                is_admin: !!data.is_admin,
            });

            setProfilePicture(
                normalizeMediaUrl(data.profile_picture) || "/profilepic/default-profile.png"
            );

            // 3️⃣ Admin check (server-authoritative)
            let adminFlag = !!data.is_admin;
            try {
                const checkRes = await API.get(
                    "/api/check-admin-access/",
                    { headers: authHeader(), validateStatus: () => true }
                );
                if (
                    checkRes.status === 200 &&
                    typeof checkRes.data?.is_admin !== "undefined"
                ) {
                    adminFlag = !!checkRes.data.is_admin;
                }
            } catch {
                /* ignore */
            }

            setIsAdmin(adminFlag);
            localStorage.setItem("user", JSON.stringify(data));
        } catch (err) {
            console.error(
                "❌ Fetch User Error:",
                err.response?.data || err.message
            );
            if (err.response?.status === 401) {
                await refreshToken();
            }
        } finally {
            setLoading(false);
        }
    };

    /* ==================== INIT ==================== */

    useEffect(() => {
        const initAuth = async () => {
            if (localStorage.getItem("access_token")) {
                await fetchUserProfile();
            } else {
                setUser(null);
                setProfilePicture("/profilepic/default-profile.png");
                setLoading(false);
            }
        };
        initAuth();
    }, []);

    /* ==================== LOGIN ==================== */

    const login = async (identifier, password) => {
        try {
            const { data } = await API.post("/api/backlogin/", {
                username: identifier,
                password,
            });

            if (data.access) {
                localStorage.setItem("access_token", data.access);
                localStorage.setItem("refresh_token", data.refresh);
                setToken(data.access);
                await fetchUserProfile();
                return { success: true };
            }

            return {
                success: false,
                error: "Login failed. No access token received.",
            };
        } catch (err) {
            return {
                success: false,
                error:
                    err.response?.data?.detail ||
                    "Invalid credentials.",
            };
        }
    };

    /* ==================== TOKEN REFRESH ==================== */

    const refreshToken = async () => {
        const refresh = localStorage.getItem("refresh_token");
        if (!refresh) {
            logout();
            return false;
        }

        try {
            const { data } = await API.post("/api/token/refresh/", {
                refresh,
            });
            localStorage.setItem("access_token", data.access);
            setToken(data.access);
            return true;
        } catch (err) {
            console.error(
                "❌ Token Refresh Error:",
                err.response?.data || err.message
            );
            logout();
            return false;
        }
    };

    /* ==================== PASSWORD / ADMIN ==================== */

    const verifyPassword = async (password) => {
        try {
            const res = await API.post(
                "/api/verify-password/",
                { password },
                { headers: authHeader() }
            );
            return res.status === 200;
        } catch {
            return false;
        }
    };

    const verifyAdminPanelPassword = async (password) => {
        try {
            const res = await API.post(
                "/api/verify-admin-panel-password/",
                { password },
                { headers: authHeader(), validateStatus: () => true }
            );
            if (res.status === 200)
                return {
                    success: true,
                    message: res.data?.message || "Access granted",
                };
            return {
                success: false,
                message:
                    res.data?.detail ||
                    res.data?.message ||
                    "Invalid password",
            };
        } catch (err) {
            return {
                success: false,
                message:
                    err.response?.data?.detail ||
                    "Verification failed",
            };
        }
    };

    const isAdminPanelVerified = async () => {
        try {
            const { data } = await API.get(
                "/api/verify-admin-panel-password/",
                { headers: authHeader() }
            );
            return !!data?.verified;
        } catch {
            return false;
        }
    };

    /* ==================== USERS ==================== */

    const fetchUsers = async () => {
        try {
            const { data } = await API.get("/api/users/", {
                headers: authHeader(),
            });
            return data;
        } catch {
            return [];
        }
    };

    const fetchUserDetail = async (id) => {
        try {
            const { data } = await API.get(`/api/users/${id}/`, {
                headers: authHeader(),
            });
            return data;
        } catch {
            return null;
        }
    };

    const createUser = async (payload) => {
        try {
            const { data } = await API.post("/api/users/", payload, {
                headers: authHeader(),
            });
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.response?.data };
        }
    };

    const updateUser = async (id, payload) => {
        try {
            const { data } = await API.put(
                `/api/users/${id}/`,
                payload,
                { headers: authHeader() }
            );
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.response?.data };
        }
    };

    /* ==================== LOGOUT ==================== */

    const logout = (navigate) => {
        localStorage.clear();
        setUser(null);
        setToken(null);
        setIsAdmin(false);
        setProfilePicture("/profilepic/default-profile.png");
        if (navigate) navigate("/login");
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                isAdmin,
                profilePicture,
                loading,
                login,
                logout,
                refreshToken,
                verifyPassword,
                verifyAdminPanelPassword,
                isAdminPanelVerified,
                fetchUsers,
                fetchUserDetail,
                createUser,
                updateUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
