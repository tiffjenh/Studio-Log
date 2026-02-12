import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { hasSupabase } from "@/lib/supabase";
import { signInSupabase, signUpSupabase } from "@/store/supabaseSync";
import LogoIcon from "@/components/LogoIcon";

export default function Landing() {
  const { setUser } = useStoreContext();
  const { t } = useLanguage();
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
            <div className="landing__logo" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <LogoIcon size={28} />
            </div>
            <div className="landing__brand-text">
              <h1 className="landing__title">{t("landing.title")}</h1>
              <p className="landing__tagline">{t("landing.tagline")}</p>
            </div>
          </div>

          {/* Tabs: Log in | Sign up */}
          <div className="landing__tabs">
          <button
            type="button"
            className={`landing__tab ${mode === "login" ? "landing__tab--active" : ""}`}
            onClick={() => { setMode("login"); setError(""); }}
          >
            {t("landing.logIn")}
          </button>
          <button
            type="button"
            className={`landing__tab ${mode === "signup" ? "landing__tab--active" : ""}`}
            onClick={() => { setMode("signup"); setError(""); }}
          >
            {t("landing.signUp")}
          </button>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="landing__form">
            <input
              type="email"
              placeholder={t("landing.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="landing__input"
              style={inputStyle}
            />
            <input
              type="password"
              placeholder={t("landing.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="landing__input"
              style={inputStyle}
            />
            {error ? <p className="landing__error">{error}</p> : null}
            <button type="submit" className="btn btn-primary landing__submit">
              {t("landing.logInButton")}
            </button>
            <div className="landing__links">
              <Link to="/forgot-password" className="landing__link landing__link--muted">
                {t("landing.forgotPassword")}
              </Link>
              <button type="button" className="landing__link landing__link--muted" onClick={() => setMode("signup")}>
                {t("landing.noAccount")}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="landing__form">
            <input
              type="text"
              placeholder={t("landing.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="landing__input"
              style={inputStyle}
            />
            <div className="landing__input-wrap">
              <input
                type="email"
                placeholder={t("landing.email")}
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                className="landing__input"
                style={inputStyle}
              />
              <span className="landing__input-icon" aria-hidden>✉</span>
            </div>
            <input
              type="password"
              placeholder={t("landing.password")}
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              className="landing__input"
              style={inputStyle}
            />
            {error ? <p className="landing__error">{error}</p> : null}
            <button type="submit" className="btn btn-primary landing__submit">
              {t("landing.signUpButton")}
            </button>
            <div className="landing__links">
              <button type="button" className="landing__link" onClick={() => setMode("login")}>
                {t("landing.haveAccount")}
              </button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
  );
}
