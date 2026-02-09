import { useState } from "react";
import { Link } from "react-router-dom";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSent(true);
  };

  return (
    <div style={{ minHeight: "100dvh", padding: 24, paddingTop: 48 }}>
      <Link to="/" style={{ display: "inline-flex", marginBottom: 32, color: "var(--text)", textDecoration: "none" }}>← Back</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Forgot password?</h1>
      {sent ? (
        <p style={{ color: "var(--text-muted)" }}>If an account exists for this email, you'll receive a link to reset your password. (Demo: no email is sent.)</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ maxWidth: 400 }}>
          <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>Enter your email and we'll send you a link to reset your password.</p>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16 }}
          />
          <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>Send reset link</button>
        </form>
      )}
      <div style={{ marginTop: 24 }}>
        <Link to="/" style={{ color: "var(--primary)" }}>Back to log in</Link>
      </div>
    </div>
  );
}
