import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { hasSupabase } from "@/lib/supabase";
import { signInSupabase, signUpSupabase } from "@/store/supabaseSync";
import LogoIcon from "@/components/LogoIcon";

export default function Landing() {
  const { setUser } = useStoreContext();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) return;
    if (hasSupabase()) {
      const result = await signInSupabase(email.trim(), password);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setUser(result.user);
      navigate("/", { replace: true });
      return;
    }
    setUser({ id: "1", email: email.trim(), name: email.split("@")[0], phone: "" });
    navigate("/", { replace: true });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !signupEmail.trim()) return;
    if (hasSupabase()) {
      const result = await signUpSupabase(signupEmail.trim(), signupPassword, name.trim(), undefined);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setUser(result.user);
      navigate("/", { replace: true });
      return;
    }
    setUser({ id: String(Date.now()), email: signupEmail.trim(), name: name.trim(), phone: undefined });
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
    <div className="landing landing--motion">
      <div className="landing__inner">
        <div className="landing__card">
          {/* Logo + app name */}
          <div className="landing__brand">
            <div className="landing__logo" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
              <LogoIcon size={28} />
            </div>
            <div className="landing__brand-text">
              <h1 className="landing__title">Studio Log</h1>
              <p className="landing__tagline">track lessons and earnings</p>
            </div>
          </div>

          {/* Tabs: Log in | Sign up */}
          <div className="landing__tabs">
          <button
            type="button"
            className={`landing__tab ${mode === "login" ? "landing__tab--active" : ""}`}
            onClick={() => { setMode("login"); setError(""); }}
          >
            Log in
          </button>
          <button
            type="button"
            className={`landing__tab ${mode === "signup" ? "landing__tab--active" : ""}`}
            onClick={() => { setMode("signup"); setError(""); }}
          >
            Sign up
          </button>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="landing__form">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="landing__input"
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="landing__input"
              style={inputStyle}
            />
            {error ? <p className="landing__error">{error}</p> : null}
            <button type="submit" className="btn btn-primary landing__submit">
              Log In
            </button>
            <div className="landing__links">
              <Link to="/forgot-password" className="landing__link landing__link--muted">
                Forgot password?
              </Link>
              <button type="button" className="landing__link landing__link--muted" onClick={() => setMode("signup")}>
                Don&apos;t have an account? Sign up
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="landing__form">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="landing__input"
              style={inputStyle}
            />
            <div className="landing__input-wrap">
              <input
                type="email"
                placeholder="Email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                className="landing__input"
                style={inputStyle}
              />
              <span className="landing__input-icon" aria-hidden>✉</span>
            </div>
            <input
              type="password"
              placeholder="Password"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              className="landing__input"
              style={inputStyle}
            />
            {error ? <p className="landing__error">{error}</p> : null}
            <button type="submit" className="btn btn-primary landing__submit">
              Sign Up
            </button>
            <div className="landing__links">
              <button type="button" className="landing__link" onClick={() => setMode("login")}>
                Already have an account? Log in
              </button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
  );
}
