import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext.jsx";
import Clock from "../components/Clock";

const Login = () => {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [form, setForm] = useState({ identifier: "", usrpassword: "" });
    const [loginError, setLoginError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        const { id, value } = e.target;
        setForm((prev) => ({ ...prev, [id]: value }));
    };

    const handleLogin = async () => {
        if (!form.identifier || !form.usrpassword) {
            setLoginError("Both fields are required.");
            return;
        }

        setLoginError("");
        setLoading(true);

        try {
            const result = await login(form.identifier, form.usrpassword);

            if (result.success) {
                navigate("/dashboard");
            } else {
                setLoginError(result.error);
            }
        } catch (error) {
            setLoginError("Unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-r from-dashboardDark to-dashboardPrimary animate-gradient">
            <div className="absolute top-1 right-2 text-[#4b0082] text-xl">
                <Clock />
            </div>
            <div className="flex flex-col md:flex-row bg-gradient-to-b from-[#fefefe] to-[#ecf8ff] rounded-xl opacity-85 shadow-lg w-full max-w-3xl border-4 border-[#4b0082]">
                <div className="w-full md:w-1/2 p-8 flex flex-col justify-center">
                    <h2 className="text-3xl font-bold text-gray-800 text-center mb-4">Welcome</h2>
                    <p className="text-gray-600 text-center mb-6">Please log in to continue.</p>

                    <input
                        id="identifier"
                        type="text"
                        placeholder="Username or ID"
                        value={form.identifier}
                        onChange={handleChange}
                        className="w-full p-3 border rounded-md mb-3"
                    />

                    <input
                        id="usrpassword"
                        type="password"
                        placeholder="Password"
                        value={form.usrpassword}
                        onChange={handleChange}
                        className="w-full p-3 border rounded-md mb-3"
                    />

                    {loginError && <p className="text-red-500 text-sm text-center">{loginError}</p>}

                    <button
                        onClick={handleLogin}
                        className="w-full bg-gradient-to-r from-[#4b0082] to-[#009966] text-white py-2 rounded-md"
                    >
                        {loading ? "Logging in..." : "Login"}
                    </button>
                </div>
                <div className="w-full md:w-1/2 p-8 flex flex-col items-center">
                    <img src="/logo.png" alt="Logo" className="h-30 w-30 mb-4" />
                    <h3 className="text-3xl font-bold">Kadi Sarva Vishwavidyalaya</h3>
                </div>
            </div>
        </div>
    );
};

export default Login;
