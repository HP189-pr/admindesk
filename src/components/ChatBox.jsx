import React, { useState, useEffect } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { useAuth } from '../hooks/AuthContext';

const ChatBox = () => {
  const { fetchUsers, isAuthenticated, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState({});
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const [chatNotificationCount, setChatNotificationCount] = useState(0);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const getUsers = async () => {
      const userList = await fetchUsers();
      if (userList) setUsers(userList);
    };

    getUsers();
    const interval = setInterval(getUsers, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchUsers]);

  useEffect(() => {
    if (!isAuthenticated || !isOpen) return;

    const interval = setInterval(() => {
      setMessages((prev) => ({
        ...prev,
        User1: [
          ...(prev['User1'] || []),
          {
            text: 'New message from User1',
            file: null,
            sender: 'User1',
            time: new Date().toLocaleTimeString(),
          },
        ],
      }));
      setChatNotificationCount((count) => count + 1);
    }, 15000);

    return () => clearInterval(interval);
  }, [isAuthenticated, isOpen]);

  const sendMessage = () => {
    if ((!input.trim() && !file) || !selectedUser) return;

    setMessages((prev) => ({
      ...prev,
      [selectedUser.usercode]: [
        ...(prev[selectedUser.usercode] || []),
        {
          text: input.trim() || '[File sent]',
          file: file,
          sender: user?.usercode || 'Me',
          time: new Date().toLocaleTimeString(),
        },
      ],
    }));

    setInput('');
    setFile(null);
  };

  return (
    <div
      className={`fixed top-0 right-0 h-full flex items-center transition-all duration-300 ease-in-out ${
        isOpen ? 'w-64' : 'w-14'
      }`}
    >
      <div
        className={`h-full bg-gray-800 text-white flex flex-col ${
          isOpen ? 'w-64' : 'w-14'
        }`}
      >
        {!isOpen && (
          <div className="flex flex-col items-center py-2 space-y-3 overflow-auto mt-12">
            {users.map((user) => (
              <div
                key={user.userid}
                className="relative cursor-pointer"
                onClick={() => setSelectedUser(user)}
              >
                <div className="w-10 h-10 bg-gray-500 rounded-full"></div>
                <div
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ${
                    user.status === 'online' ? 'bg-white' : 'bg-gray-400'
                  }`}
                ></div>
              </div>
            ))}
          </div>
        )}

        {isOpen && !selectedUser && (
          <div className="flex-1 flex flex-col mt-12">
            <div className="p-2 border-b bg-gray-900 text-white">
              <h3 className="text-lg font-semibold">Users</h3>
              <ul>
                {users.map((user) => (
                  <li
                    key={user.userid}
                    className="flex items-center gap-2 p-1 cursor-pointer hover:bg-gray-700"
                    onClick={() => setSelectedUser(user)}
                  >
                    <div
                      className={`w-3 h-3 rounded-full ${
                        user.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                      }`}
                    ></div>
                    <span>{user.usercode}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {selectedUser && (
          <div className="flex-1 flex flex-col mt-12">
            <div className="p-2 border-b bg-gray-900 text-white flex justify-between">
              <h3 className="text-lg font-semibold">{selectedUser.usercode}</h3>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-red-400"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-auto p-2 space-y-2 bg-gray-100 text-black custom-scrollbar">
              {(messages[selectedUser.usercode] || []).map((msg, index) => (
                <div
                  key={index}
                  className={`p-2 rounded ${
                    msg.sender === user?.usercode ? 'bg-blue-200' : 'bg-gray-200'
                  }`}
                >
                  <strong>{msg.sender}</strong>
                  <div>{msg.text}</div>
                  {msg.file && (
                    <a
                      href={URL.createObjectURL(msg.file)}
                      download={msg.file.name}
                      className="text-blue-500"
                    >
                      Download File
                    </a>
                  )}
                  <small className="block text-xs text-gray-500">
                    {msg.time}
                  </small>
                </div>
              ))}
            </div>

            <div className="p-2 border-t flex items-center space-x-2 bg-gray-800">
              <input
                type="text"
                className="flex-1 p-2 text-black border rounded"
                placeholder="Type a message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <input
                type="file"
                className="hidden"
                id="file-upload"
                onChange={(e) => setFile(e.target.files[0])}
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer bg-gray-700 text-white p-2 rounded"
              >
                📎
              </label>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded"
                onClick={sendMessage}
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute top-4 -left-6 w-10 h-10 bg-white border-2 border-blue-500 rounded-full flex items-center justify-center shadow-lg"
      >
        {isOpen ? <FiChevronRight className="text-blue-500 text-xl" /> : <FiChevronLeft className="text-blue-500 text-xl" />}
        {chatNotificationCount > 0 && !isOpen && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs flex items-center justify-center rounded-full">
            {chatNotificationCount}
          </div>
        )}
      </button>
    </div>
  );
};

export default ChatBox;