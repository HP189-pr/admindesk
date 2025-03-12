import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/AuthContext"; 

const AdminDashboard = () => {
  const { user, profilePicture, fetchUsers, fetchUserDetail } = useAuth();
  const [users, setUsers] = useState([]);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentProfilePic, setCurrentProfilePic] = useState("/profilepic/default-profile.png");

  // 🔹 Fetch Users from API
  useEffect(() => {
    async function loadUsers() {
      const userList = await fetchUsers();
      console.log("Fetched Users:", userList);
      setUsers(userList);
    }
    loadUsers();
  }, []);
  
  // 🔹 Update Profile Picture when user or profilePicture changes
  useEffect(() => {
    if (user) {
      setCurrentProfilePic(profilePicture || "/profilepic/default-profile.png");
    } else {
      setCurrentProfilePic("/profilepic/default-profile.png");
    }
  }, [user, profilePicture]);
  

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
      alert(`User deleted: ${userId}`);
      setUsers(users.filter((user) => user.userid !== userId));
    }
  };

  return (
    <div className="flex h-full p-6 bg-gray-100">
      <div className="bg-white shadow rounded p-6 w-full">
        <h2 className="text-xl font-semibold mb-4">User Management</h2>

        {/* Add User Button */}
        {!isAddingUser && (
          <button
            className="bg-green-500 text-white px-4 py-2 rounded mb-4"
            onClick={() => setIsAddingUser(true)}
          >
            ➕ Add User
          </button>
        )}

        {/* User List Table */}
        {!isAddingUser && (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-300">
              <thead>
                <tr className="bg-gray-200">
                  <th className="px-4 py-2 border">User Picture</th>
                  <th className="px-4 py-2 border">User Name</th>
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
                            src={user.profile_picture 
                                  ? `${API_BASE_URL}/profilepic/${user.profile_picture}` 
                                  : "/profilepic/default-profile.png"} 
                            alt="Profile" 
                            className="w-14 h-14 rounded-full object-cover" 
                            onError={(e) => e.target.src = "/profilepic/default-profile.png"} // Handles broken images
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
        )}

        {/* Add / Edit User Form */}
        {isAddingUser && (
          <div className="bg-white p-6 shadow-md rounded">
            <h3 className="text-lg font-semibold mb-4">
              {selectedUser ? "Edit User" : "Add New User"}
            </h3>
            <form>
              <input
                type="text"
                placeholder="Username"
                defaultValue={selectedUser?.username || ""}
                className="block w-full p-2 border rounded mb-3"
              />
              <input
                type="text"
                placeholder="First Name"
                defaultValue={selectedUser?.first_name || ""}
                className="block w-full p-2 border rounded mb-3"
              />
              <input
                type="text"
                placeholder="Last Name"
                defaultValue={selectedUser?.last_name || ""}
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
      </div>
    </div>
  );
};

export default AdminDashboard;
