import axios from "axios";
import Cookies from "js-cookie";

// This file is deprecated - authentication is handled in AuthContext.jsx
// Kept for backwards compatibility only

const API_URL = "/api/auth";  // Relative URL for proxy

export const login = async (username, usrpassword) => {
  try {
    const response = await axios.post(`${API_URL}/login`, { username, usrpassword });
    Cookies.set("token", response.data.token, { expires: 7 });
    return response.data;
  } catch (error) {
    return null;
  }
};

export const logout = () => {
  Cookies.remove("token");
};
