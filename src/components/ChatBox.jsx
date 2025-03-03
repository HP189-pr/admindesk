import React, { useState, useEffect } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

const dummyUsers = [
  { id: 1, name: "User1", unread: 3 },
  { id: 2, name: "User2", unread: 1 },
  { id: 3, name: "User3", unread: 0 },
];

const ChatBox = () => {
  const [isOpen, setIsOpen] = useState(false); // Internal state to handle open/close
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState(null);
  const [chatNotificationCount, setChatNotificationCount] = useState(0);

  // Simulate incoming messages every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setMessages((prev) => [
        ...prev,
        {
          text: "New message from User1",
          file: null,
          sender: "User1",
          time: new Date().toLocaleTimeString(),
        },
      ]);
      setChatNotificationCount((count) => count + 1);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const sendMessage = () => {
    const newMessage = {
      text: input,
      file: file,
      sender: "Me",
      time: new Date().toLocaleTimeString(),
    };
    setMessages([...messages, newMessage]);
    setInput("");
    setFile(null);
  };

  return (
    <div className={`fixed top-0 right-0 h-full flex items-center transition-all duration-300 ease-in-out ${isOpen ? "w-64" : "w-14"}`}>
      {/* Main Chatbox Container */}
      <div className={`h-full bg-gray-800 text-white flex flex-col ${isOpen ? "w-64" : "w-14"}`}>
        {/* Collapsed User List (shown when chat is closed) */}
        {!isOpen && (
          <div className="flex flex-col items-center py-2 space-y-3 overflow-auto mt-12">
            {dummyUsers.map((user) => (
              <div key={user.id} className="relative">
                <div className="w-10 h-10 bg-gray-500 rounded-full"></div>
                {user.unread > 0 && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-xs text-white flex items-center justify-center rounded-full">
                    {user.unread}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Expanded Chat UI */}
        {isOpen && (
          <div className="flex-1 flex flex-col mt-12">
            {/* Messages Area */}
            <div className="flex-1 overflow-auto p-2 space-y-2 bg-gray-100 text-black custom-scrollbar">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`p-2 rounded ${msg.sender === "Me" ? "bg-blue-200" : "bg-gray-200"}`}
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
                  <small className="block text-xs text-gray-500">{msg.time}</small>
                </div>
              ))}
            </div>

            {/* Input Area */}
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

      {/* Floating Expand/Collapse Button (on the LEFT of the chatbox) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute top-4 -left-6 w-10 h-10 bg-white border-2 border-blue-500 rounded-full flex items-center justify-center shadow-lg"
      >
        {isOpen ? (
          <FiChevronRight className="text-blue-500 text-xl" />
        ) : (
          <FiChevronLeft className="text-blue-500 text-xl" />
        )}

        {/* Notification Badge */}
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
