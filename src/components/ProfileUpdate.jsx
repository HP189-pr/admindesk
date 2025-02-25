import React, { useState, useEffect } from "react";
import axios from "axios";
import useAuth from "../hooks/useAuth";

const API_BASE_URL = "http://127.0.0.1:8000";

const ProfileUpdate = ({ setWorkArea }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState({
    username: user?.username || "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    country: "",
    bio: "",
    profile_picture: null,
  });

  useEffect(() => {
    if (user) {
      setProfile((prev) => ({ ...prev, username: user.username }));
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      await axios.patch(`${API_BASE_URL}/api/profile/update/`, profile, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert("Profile updated successfully!");
      setWorkArea(null);
    } catch (error) {
      console.error("Error updating profile:", error.response?.data || error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" name="username" value={profile.username} disabled />
      <button type="submit">Save</button>
    </form>
  );
};

export default ProfileUpdate;
