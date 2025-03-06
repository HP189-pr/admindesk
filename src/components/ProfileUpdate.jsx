import React, { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../hooks/AuthContext";

const API_BASE_URL = "http://127.0.0.1:8000";

const ProfileUpdate = ({ setWorkArea }) => {
    const { user, fetchUserProfile } = useAuth();  // fetchUserProfile to refresh after update

    const [profile, setProfile] = useState({
        username: "",
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        profile_picture_url: "",  // use URL for display
        profile_picture_file: null  // file for upload
    });

    // Populate form with user data
    useEffect(() => {
        if (user) {
            setProfile({
                username: user.username || "",
                first_name: user.first_name || "",
                last_name: user.last_name || "",
                email: user.email || "",
                phone: user.phone || "",
                address: user.address || "",
                city: user.city || "",
                profile_picture_url: user.profile_picture_url || "",  // from backend
                profile_picture_file: null  // no file initially
            });
        }
    }, [user]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setProfile((prev) => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        setProfile((prev) => ({ ...prev, profile_picture_file: file }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem("access_token");

        const formData = new FormData();

        // Append fields only if they exist
        const appendIfExists = (key, value) => {
            if (value !== "" && value !== null && value !== undefined) {
                formData.append(key, value);
            }
        };

        appendIfExists("first_name", profile.first_name);
        appendIfExists("last_name", profile.last_name);
        appendIfExists("email", profile.email);
        appendIfExists("phone", profile.phone);
        appendIfExists("address", profile.address);
        appendIfExists("city", profile.city);

        // Append file if selected
        if (profile.profile_picture_file) {
            formData.append("profile_picture", profile.profile_picture_file);
        }

        try {
            const response = await axios.patch(`${API_BASE_URL}/api/profile/`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "multipart/form-data"
                },
            });

            alert("Profile updated successfully!");
            await fetchUserProfile();  // Refresh profile data after update
            setWorkArea(null);
        } catch (error) {
            console.error("❌ Error updating profile:", error.response?.data || error.message);
        }
    };

    // Choose displayed picture (uploaded file preview or backend URL)
    const displayedProfilePicture = profile.profile_picture_file
        ? URL.createObjectURL(profile.profile_picture_file)
        : profile.profile_picture_url || "/default-profile.png";  // Use profile_picture_url for display

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label>Username (cannot change)</label>
                <input type="text" name="username" value={profile.username} disabled className="border p-2 w-full" />
            </div>

            <div><label>First Name</label>
                <input type="text" name="first_name" value={profile.first_name} onChange={handleChange} className="border p-2 w-full" />
            </div>

            <div><label>Last Name</label>
                <input type="text" name="last_name" value={profile.last_name} onChange={handleChange} className="border p-2 w-full" />
            </div>

            <div><label>Email</label>
                <input type="email" name="email" value={profile.email} onChange={handleChange} className="border p-2 w-full" />
            </div>

            <div><label>Phone</label>
                <input type="text" name="phone" value={profile.phone} onChange={handleChange} className="border p-2 w-full" />
            </div>

            <div><label>Address</label>
                <input type="text" name="address" value={profile.address} onChange={handleChange} className="border p-2 w-full" />
            </div>

            <div><label>City</label>
                <input type="text" name="city" value={profile.city} onChange={handleChange} className="border p-2 w-full" />
            </div>

            <div>
                <label>Profile Picture</label>
                <input type="file" name="profile_picture" accept="image/*" onChange={handleFileChange} className="border p-2 w-full" />
                <img src={displayedProfilePicture} alt="Profile" className="w-24 h-24 object-cover mt-2" />
            </div>

            <button type="submit" className="bg-blue-500 text-white p-2 rounded">Save Changes</button>
        </form>
    );
};

export default ProfileUpdate;
