import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { Button } from "@/components/ui/Button";
import logo from "@/assets/wwweekly-hero.png";

export default function CreateAccount() {
  const { setUser } = useStoreContext();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setUser({ id: String(Date.now()), email: email.trim(), name: name.trim(), phone: phone.trim() || undefined });
    navigate("/", { replace: true });
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    backgroundColor: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
  };

  return (
    <div style={{ minHeight: "100dvh", padding: 24, paddingTop: 48 }}>
      <Link to="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 32, color: "var(--text)", textDecoration: "none" }}>
        ← Back
      </Link>
      <div className="authLogoWrapper">
        <img src={logo} alt="WWEEKLY" className="authLogo authLogo--dark" />
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 32 }}>Create an Account</h1>
      <form onSubmit={handleSignUp} style={{ maxWidth: 400 }}>
        <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        <input type="tel" placeholder="Phone Number (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        <Button type="submit" variant="primary" fullWidth style={{ marginTop: 8, marginBottom: 16 }}>Sign Up</Button>
      </form>
    </div>
  );
}
