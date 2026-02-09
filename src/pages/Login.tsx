import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";

export default function Login() {
  const { setUser } = useStoreContext();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setUser({ id: "1", email: email.trim(), name: email.split("@")[0], phone: "" });
    navigate("/", { replace: true });
  };

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", padding: 24 }}>
      <form onSubmit={handleLogin} style={{ maxWidth: 400, width: "100%", margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Log In</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 8, marginBottom: 16 }}>
          Log In
        </button>
        <div style={{ textAlign: "center" }}>
          <Link to="/create-account" style={{ color: "var(--primary)", fontSize: 16 }}>Don't have an account? Sign up</Link>
        </div>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link to="/forgot-password" style={{ color: "var(--text-muted)", fontSize: 14 }}>Forgot password?</Link>
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 16,
  fontSize: 16,
  marginBottom: 16,
};
