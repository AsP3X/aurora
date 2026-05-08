import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, register } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const fn = isRegister ? register : login;
      const res = await fn(email, password);
      setAuth(res.token, res.user);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    }
  }

  return (
    <div className="login-container">
      <h1>Aurora Music</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit">{isRegister ? "Register" : "Login"}</button>
      </form>
      <p>
        {isRegister ? "Already have an account?" : "Need an account?"}{" "}
        <button type="button" className="link" onClick={() => setIsRegister(!isRegister)}>
          {isRegister ? "Login" : "Register"}
        </button>
      </p>
    </div>
  );
}
