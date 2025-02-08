import axios from "axios";
import Cookies from "js-cookie";

const API_URL = "http://localhost:1337/api/auth";

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
