import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import axios from "../api/axiosInstance";

const UserManagement = ({ selectedTopbarMenu }) => {
  const { fetchUsers, fetchUserDetail } = useAuth();
  const { createUser, updateUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [changeUserId, setChangeUserId] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // 🔹 Fetch Users from API
  useEffect(() => {
    async function loadUsers() {
      const userList = await fetchUsers();
      setUsers(userList);
    }
    loadUsers();
  }, [fetchUsers]); 

  // 🔹 Handle Edit User
  const handleEdit = async (userId) => {
    const userDetails = await fetchUserDetail(userId);
    setSelectedUser(userDetails);
    setIsAddingUser(true);
  };

  // 🔹 Handle Change Password
  const handleChangePassword = (userId) => {
    setChangeUserId(userId);
    setNewPassword("");
    setShowPassword(false);
    setShowChangeModal(true);
  };

  // 🔹 Handle Delete User
  const handleDelete = (userId) => {
    if (window.confirm("Are you sure you want to delete this user?")) {
      setUsers(users.filter((user) => user.userid !== userId));
      alert(`User deleted: ${userId}`);
    }
  };

  // 🔹 Handle Form Submit (Add/Edit User)
  const handleSubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const payload = {
      username: form.get('username'),
      first_name: form.get('first_name'),
      last_name: form.get('last_name'),
      email: form.get('email') || '',
      usr_birth_date: form.get('usr_birth_date') || null,
    };
    if (selectedUser) {
      const res = await updateUser(selectedUser.id, payload);
      if (!res.success) {
        alert('Update failed: ' + JSON.stringify(res.error));
        return;
      }
      alert('User updated successfully!');
    } else {
      // create
      const res = await createUser(payload);
      if (!res.success) {
        alert('Create failed: ' + JSON.stringify(res.error));
        return;
      }
      alert('New user added!');
    }
    // refresh list
    const userList = await fetchUsers();
    setUsers(userList);
    setIsAddingUser(false);
    setSelectedUser(null);
  };

  // 🔹 Function to render content based on `selectedTopbarMenu`
          return (
          <div>
            <h2 className="text-xl font-semibold mb-4">User Management</h2>
            {!isAddingUser && (
              <button
                className="bg-green-500 text-white px-4 py-2 rounded mb-4"
                onClick={() => setIsAddingUser(true)}
              >
                ➕ Add User
              </button>
            )}

            {!isAddingUser ? (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-300">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="px-4 py-2 border">Profile</th>
                      <th className="px-4 py-2 border">Username</th>
                      <th className="px-4 py-2 border">First Name</th>
                      <th className="px-4 py-2 border">Last Name</th>
                      <th className="px-4 py-2 border">Edit</th>
                      <th className="px-4 py-2 border">Password</th>
                      <th className="px-4 py-2 border">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={(user.id ?? user.userid)} className="text-center">
                        <td className="px-4 py-2 border">
                          <img
                            src={user.profile_picture || "/profilepic/default-profile.png"}
                            alt="Profile"
                            className="w-14 h-14 rounded-full object-cover"
                            onError={(e) => (e.target.src = "/profilepic/default-profile.png")}
                          />
                        </td>
                          <td className="px-4 py-2 border">{user.username}</td>
                        <td className="px-4 py-2 border">{user.first_name}</td>
                        <td className="px-4 py-2 border">{user.last_name}</td>
                        <td className="px-4 py-2 border">
                          <button
                            onClick={() => handleEdit(user.id ?? user.userid)}
                            className="bg-yellow-500 text-white px-3 py-1 rounded"
                          >
                            Edit
                          </button>
                        </td>
                        <td className="px-4 py-2 border">
                          <button
                            onClick={() => handleChangePassword(user.id ?? user.userid)}
                            className="bg-blue-500 text-white px-3 py-1 rounded"
                          >
                            Change
                          </button>
                        </td>
                        <td className="px-4 py-2 border">
                          <button
                            onClick={() => handleDelete(user.id ?? user.userid)}
                            className="bg-red-500 text-white px-3 py-1 rounded"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white p-6 shadow-md rounded">
                <h3 className="text-lg font-semibold mb-4">
                  {selectedUser ? "Edit User" : "Add New User"}
                </h3>
                <form onSubmit={handleSubmit}>
                  <input name="username"
                    type="text"
                    placeholder="Username"
                    defaultValue={selectedUser?.username || ""}
                    className="block w-full p-2 border rounded mb-3"
                    required
                  />
                  <input name="first_name"
                    type="text"
                    placeholder="First Name"
                    defaultValue={selectedUser?.first_name || ""}
                    className="block w-full p-2 border rounded mb-3"
                    required
                  />
                  <input name="last_name"
                    type="text"
                    placeholder="Last Name"
                    defaultValue={selectedUser?.last_name || ""}
                    className="block w-full p-2 border rounded mb-3"
                    required
                  />
                  <input name="email"
                    type="email"
                    placeholder="Email"
                    defaultValue={selectedUser?.email || ""}
                    className="block w-full p-2 border rounded mb-3"
                  />
                  <label className="block text-sm mb-1">Birth Date</label>
                  <input name="usr_birth_date"
                    type="date"
                    defaultValue={selectedUser?.usr_birth_date ? selectedUser.usr_birth_date.split('T')[0] : ""}
                    className="block w-full p-2 border rounded mb-3"
                  />
                  <button
                    type="submit"
                    className="bg-green-500 text-white px-4 py-2 rounded"
                  >
                    {selectedUser ? "Update User" : "Create User"}
                  </button>
                  <button
                    type="button"
                    className="bg-gray-500 text-white px-4 py-2 rounded ml-3"
                    onClick={() => {
                      setIsAddingUser(false);
                      setSelectedUser(null);
                    }}
                  >
                    Cancel
                  </button>
                </form>
              </div>
            )}

        {/* Change Password Modal */}
        {showChangeModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white p-6 rounded shadow-md w-96">
              <h3 className="text-lg font-semibold mb-4">Change Password</h3>
              <p className="mb-2">Change password for user: {changeUserId}</p>
              <div className="mb-3">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-2 border rounded"
                  placeholder="Enter new password"
                />
              </div>
              <div className="mb-3 flex items-center">
                <input id="showpw" type="checkbox" checked={showPassword} onChange={() => setShowPassword(!showPassword)} />
                <label htmlFor="showpw" className="ml-2">Show password</label>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={async () => {
                    if (!newPassword || newPassword.length < 6) {
                      alert('Password must be at least 6 characters');
                      return;
                    }
                    try {
                      const res = await axios.post(`/api/users/${changeUserId}/change-password/`, { new_password: newPassword });
                      if (res.status === 200) {
                        alert('Password changed successfully');
                        setShowChangeModal(false);
                      } else {
                        alert('Failed to change password');
                      }
                    } catch (err) {
                      console.error('Change password error', err.response || err.message || err);
                      alert('Error: ' + (err.response?.data?.detail || JSON.stringify(err.response?.data) || err.message));
                    }
                  }}
                  className="bg-blue-500 text-white px-3 py-1 rounded mr-2"
                >
                  OK
                </button>
                <button onClick={() => setShowChangeModal(false)} className="bg-gray-400 px-3 py-1 rounded">Cancel</button>
              </div>
            </div>
          </div>
        )}
          </div>
        );

      
      
};

export default UserManagement;
