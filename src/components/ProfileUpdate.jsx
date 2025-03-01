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
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    const token = localStorage.getItem("token");
    try {
      const response = await axios.get(`${API_BASE_URL}/profile/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProfile((prev) => ({
        ...prev,
        ...response.data,
      }));
    } catch (error) {
      console.error("Error fetching profile:", error.response?.data || error.message);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    setProfile((prev) => ({
      ...prev,
      profile_picture: e.target.files[0],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    const formData = new FormData();
    formData.append("email", profile.email);
    formData.append("phone", profile.phone);
    formData.append("address", profile.address);
    formData.append("city", profile.city);
    formData.append("state", profile.state);
    formData.append("country", profile.country);
    formData.append("bio", profile.bio);

    if (profile.profile_picture) {
      formData.append("profile_picture", profile.profile_picture);
    }

    try {
      await axios.patch(`${API_BASE_URL}/profile/`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
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
      <input type="email" name="email" value={profile.email} onChange={handleChange} />
      <input type="text" name="phone" value={profile.phone} onChange={handleChange} />
      <input type="text" name="address" value={profile.address} onChange={handleChange} />
      <input type="text" name="city" value={profile.city} onChange={handleChange} />
      <input type="text" name="state" value={profile.state} onChange={handleChange} />
      <input type="text" name="country" value={profile.country} onChange={handleChange} />
      <textarea name="bio" value={profile.bio} onChange={handleChange}></textarea>

      <input type="file" name="profile_picture" accept="image/*" onChange={handleFileChange} />
      {profile.profile_picture && (
        <img
          src={
            profile.profile_picture instanceof File
              ? URL.createObjectURL(profile.profile_picture)
              : `${API_BASE_URL}${profile.profile_picture}`
          }
          alt="Profile"
          className="w-24 h-24 object-cover"
        />
      )}

      <button type="submit">Save</button>
    </form>
  );
};

export default ProfileUpdate;
