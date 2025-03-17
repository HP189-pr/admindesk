import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";

const UserManagement = ({ selectedTopbarMenu }) => {
  const { fetchUsers, fetchUserDetail } = useAuth();
  const [users, setUsers] = useState([]);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

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
    alert(`Change password for user: ${userId}`);
  };

  // 🔹 Handle Delete User
  const handleDelete = (userId) => {
    if (window.confirm("Are you sure you want to delete this user?")) {
      setUsers(users.filter((user) => user.userid !== userId));
      alert(`User deleted: ${userId}`);
    }
  };

  // 🔹 Handle Form Submit (Add/Edit User)
  const handleSubmit = (event) => {
    event.preventDefault();
    alert(selectedUser ? "User updated successfully!" : "New user added!");
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
                      <tr key={user.userid} className="text-center">
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
                            onClick={() => handleEdit(user.userid)}
                            className="bg-yellow-500 text-white px-3 py-1 rounded"
                          >
                            Edit
                          </button>
                        </td>
                        <td className="px-4 py-2 border">
                          <button
                            onClick={() => handleChangePassword(user.userid)}
                            className="bg-blue-500 text-white px-3 py-1 rounded"
                          >
                            Change
                          </button>
                        </td>
                        <td className="px-4 py-2 border">
                          <button
                            onClick={() => handleDelete(user.userid)}
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
                  <input
                    type="text"
                    placeholder="Username"
                    defaultValue={selectedUser?.username || ""}
                    className="block w-full p-2 border rounded mb-3"
                    required
                  />
                  <input
                    type="text"
                    placeholder="First Name"
                    defaultValue={selectedUser?.first_name || ""}
                    className="block w-full p-2 border rounded mb-3"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Last Name"
                    defaultValue={selectedUser?.last_name || ""}
                    className="block w-full p-2 border rounded mb-3"
                    required
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
          </div>
        );

      
      
};

export default UserManagement;
