// src/components/ProfileUpdate.jsx
import React, { useState, useEffect } from "react";
import API from "../api/axiosInstance";
import { useAuth } from "../hooks/AuthContext";
import { normalizeMediaUrl, resolveProfilePicture } from "../utils/mediaUrl";

const ProfileUpdate = ({ setWorkArea }) => {
    const { user, fetchUserProfile } = useAuth();  // fetchUserProfile to refresh after update
    const [imgBroken, setImgBroken] = useState(false);

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
            // be permissive about where the profile picture URL may live in the user object
            const picUrl = resolveProfilePicture(user);
            setProfile({
                username: user.username || "",
                first_name: user.first_name || "",
                last_name: user.last_name || "",
                email: user.email || "",
                phone: user.phone || "",
                address: user.address || "",
                city: user.city || "",
                profile_picture_url: picUrl,  // from backend (could be relative)
                profile_picture_file: null  // no file initially
            });
            setImgBroken(false);
        }
    }, [user]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setProfile((prev) => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        setProfile((prev) => ({ ...prev, profile_picture_file: file }));
        setImgBroken(false);
    };

    const getInitials = () => {
        const first = String(profile.first_name || "").trim();
        const last = String(profile.last_name || "").trim();
        const full = `${first} ${last}`.trim() || String(profile.username || "").trim();
        if (!full) return "U";
        const words = full.split(/\s+/).filter(Boolean);
        if (words.length >= 2) return `${words[0][0] || ""}${words[words.length - 1][0] || ""}`.toUpperCase();
        return words[0].slice(0, 2).toUpperCase();
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

        // Append file if selected. Django backend expects 'profile_picture' (see UserProfileView).
        if (profile.profile_picture_file) {
            formData.append("profile_picture", profile.profile_picture_file);
        }

        try {
            // IMPORTANT: do NOT set the Content-Type header manually for multipart/form-data.
            // Let axios/browser set the proper Content-Type with boundary.
            const response = await API.patch(`/api/profile/`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                timeout: 30000,
            });

            alert("Profile updated successfully!");
            await fetchUserProfile();  // Refresh profile data after update
            if (typeof setWorkArea === "function") {
                setWorkArea(null);
            }
        } catch (error) {
            console.error("❌ Error updating profile:", error.response?.data || error.message);
        }
    };

    // Choose displayed picture (uploaded file preview or backend URL)
    const displayedProfilePicture = profile.profile_picture_file
        ? URL.createObjectURL(profile.profile_picture_file)
        : (normalizeMediaUrl(profile.profile_picture_url) || null);

    return (
        <div className="flex justify-center items-center min-h-screen bg-gray-100 p-4">
            <form
                onSubmit={handleSubmit}
                className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-3xl space-y-6"
            >
                <h2 className="text-2xl font-bold text-center text-gray-800">
                    Update Profile
                </h2>

                <div className="flex flex-col items-center space-y-4">
                    <div className="relative">
                        {displayedProfilePicture && !imgBroken ? (
                            <img
                                src={displayedProfilePicture}
                                alt="Profile"
                                className="w-32 h-32 rounded-full object-cover border-4 border-blue-500 shadow-md"
                                onError={() => setImgBroken(true)}
                            />
                        ) : (
                            <div className="w-32 h-32 rounded-full border-4 border-blue-500 shadow-md bg-blue-100 text-blue-700 flex items-center justify-center text-3xl font-bold">
                                {getInitials()}
                            </div>
                        )}
                    </div>

                    <input
                        type="file"
                        name="profile_picture"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="text-sm text-gray-600"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="text-sm font-medium text-gray-600">
                            Username (cannot change)
                        </label>
                        <input
                            type="text"
                            name="username"
                            value={profile.username}
                            disabled
                            className="mt-1 border bg-gray-100 p-2 w-full rounded-lg"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-600">First Name</label>
                        <input
                            type="text"
                            name="first_name"
                            value={profile.first_name}
                            onChange={handleChange}
                            className="mt-1 border p-2 w-full rounded-lg focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-600">Last Name</label>
                        <input
                            type="text"
                            name="last_name"
                            value={profile.last_name}
                            onChange={handleChange}
                            className="mt-1 border p-2 w-full rounded-lg focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-600">Email</label>
                        <input
                            type="email"
                            name="email"
                            value={profile.email}
                            onChange={handleChange}
                            className="mt-1 border p-2 w-full rounded-lg focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-600">Phone</label>
                        <input
                            type="text"
                            name="phone"
                            value={profile.phone}
                            onChange={handleChange}
                            className="mt-1 border p-2 w-full rounded-lg focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                    </div>

                    <div className="col-span-2">
                        <label className="text-sm font-medium text-gray-600">Address</label>
                        <input
                            type="text"
                            name="address"
                            value={profile.address}
                            onChange={handleChange}
                            className="mt-1 border p-2 w-full rounded-lg focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                    </div>

                    <div className="col-span-2">
                        <label className="text-sm font-medium text-gray-600">City</label>
                        <input
                            type="text"
                            name="city"
                            value={profile.city}
                            onChange={handleChange}
                            className="mt-1 border p-2 w-full rounded-lg focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                    </div>
                </div>

                <div className="flex justify-center pt-4">
                    <button
                        type="submit"
                        className="save-button"
                    >
                        Save Changes
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ProfileUpdate;
