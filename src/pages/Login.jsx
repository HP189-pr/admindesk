import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/auth";

const LoginPage = () => {
  const [username, setUsername] = useState("");
  const [usrpassword, setUsrpassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    const user = await login(username, usrpassword);
    if (user) {
      navigate("/dashboard");
    } else {
      alert("Invalid credentials");
    }
  };

  return (
    <div className="flex justify-center items-center h-screen">
      <form onSubmit={handleLogin} className="bg-white p-6 shadow-md rounded">
        <input className="border p-2" type="text" placeholder="User ID or User Code" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className="border p-2 mt-2" type="password" placeholder="Password" value={usrpassword} onChange={(e) => setUsrpassword(e.target.value)} />
        <button className="bg-blue-500 text-white p-2 mt-2" type="submit">Login</button>
      </form>
    </div>
  );
};

export default LoginPage;
