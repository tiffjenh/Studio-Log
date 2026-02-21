import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { hasSupabase } from "@/lib/supabase";
import { signInSupabase, signUpSupabase, resendConfirmationSupabase } from "@/store/supabaseSync";
import { Button } from "@/components/ui/Button";

export default function Landing() {
  const { setUser } = useStoreContext();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [resendMessage, setResendMessage] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [name, setName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  const isEmailNotConfirmed = (msg: string) => /email not confirmed|confirm your email/i.test(msg);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResendMessage("idle");
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

  const handleResendConfirmation = async () => {
    if (!email.trim()) return;
    setResendMessage("sending");
    const result = await resendConfirmationSupabase(email.trim());
    if (result.error) {
      setResendMessage("error");
      setError(result.error);
    } else {
      setResendMessage("sent");
      setError("");
    }
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

  const passwordWrapStyle: React.CSSProperties = { position: "relative", marginBottom: 16 };
  const passwordInputStyle: React.CSSProperties = { ...inputStyle, marginBottom: 0, paddingRight: 48 };
  const eyeBtnStyle: React.CSSProperties = {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: "translateY(-50%)",
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "none",
    cursor: "pointer",
    color: "var(--text-muted)",
    borderRadius: 8,
  };

  const EyeIcon = ({ show }: { show: boolean }) => (
    show ? (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ) : (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    )
  );

  return (
    <div className="landing landing--motion">
      <div className="landing__inner">
        <div className="landing__card">
          {/* App name only (no logo) */}
          <div className="landing__brand">
            <div className="landing__brand-text">
              <h1 className="landing__title">{t("landing.title")}</h1>
              <p className="landing__tagline">{t("landing.tagline")}</p>
            </div>
          </div>

          {/* Tabs: Log in | Sign up – active tab clearly selected (filled bg, bold, underline) */}
          <div className="landing__tabs" role="tablist" aria-label="Log in or Sign up">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              aria-controls="landing-login-panel"
              id="landing-tab-login"
              className={`landing__tab ${mode === "login" ? "landing__tab--active" : ""}`}
              onClick={() => { setMode("login"); setError(""); setResendMessage("idle"); }}
            >
              {t("landing.logIn")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              aria-controls="landing-signup-panel"
              id="landing-tab-signup"
              className={`landing__tab ${mode === "signup" ? "landing__tab--active" : ""}`}
              onClick={() => { setMode("signup"); setError(""); setResendMessage("idle"); }}
            >
              {t("landing.signUp")}
            </button>
          </div>

        {mode === "login" ? (
          <form id="landing-login-panel" role="tabpanel" aria-labelledby="landing-tab-login" onSubmit={handleLogin} className="landing__form">
            <input
              type="email"
              placeholder={t("landing.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="landing__input"
              style={inputStyle}
            />
            <div style={passwordWrapStyle}>
              <input
                type={showLoginPassword ? "text" : "password"}
                placeholder={t("landing.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="landing__input"
                style={passwordInputStyle}
              />
              <Button type="button" variant="ghost" iconOnly size="sm" onClick={() => setShowLoginPassword((s) => !s)} style={eyeBtnStyle} aria-label={showLoginPassword ? "Hide password" : "Show password"} title={showLoginPassword ? "Hide password" : "Show password"}>
                <EyeIcon show={!showLoginPassword} />
              </Button>
            </div>
            {error && !isEmailNotConfirmed(error) && (
              <p className="landing__error" style={{ marginBottom: 12 }}>{error}</p>
            )}
            {isEmailNotConfirmed(error) && (
              <div style={{ marginBottom: 16, textAlign: "center" }}>
                <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--text-muted)" }}>
                  Your email hasn't been confirmed yet. Check your inbox and spam folder, or resend the authentication email below.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  disabled={resendMessage === "sending" || resendMessage === "sent"}
                  loading={resendMessage === "sending"}
                  onClick={handleResendConfirmation}
                >
                  {resendMessage === "sending" ? "Sending..." : resendMessage === "sent" ? "Email sent - check your inbox" : "Resend Authentication Email"}
                </Button>
                {resendMessage === "error" && (
                  <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13, color: "var(--text-muted)" }}>Something went wrong. Try again in a minute.</p>
                )}
              </div>
            )}
            <Button type="submit" variant="secondary" size="lg" fullWidth style={{ marginTop: 6, marginBottom: 14 }}>
              {t("landing.logInButton")}
            </Button>
            <div className="landing__links">
              <Link to="/forgot-password" className="landing__link landing__link--muted">
                {t("landing.forgotPassword")}
              </Link>
            </div>
          </form>
        ) : (
          <form id="landing-signup-panel" role="tabpanel" aria-labelledby="landing-tab-signup" onSubmit={handleSignUp} className="landing__form">
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
              <span className="landing__input-icon" aria-hidden>&#9993;</span>
            </div>
            <div style={passwordWrapStyle}>
              <input
                type={showSignupPassword ? "text" : "password"}
                placeholder={t("landing.password")}
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                className="landing__input"
                style={passwordInputStyle}
              />
              <Button type="button" variant="ghost" iconOnly size="sm" onClick={() => setShowSignupPassword((s) => !s)} style={eyeBtnStyle} aria-label={showSignupPassword ? "Hide password" : "Show password"} title={showSignupPassword ? "Hide password" : "Show password"}>
                <EyeIcon show={!showSignupPassword} />
              </Button>
            </div>
            {error ? <p className="landing__error">{error}</p> : null}
            <Button type="submit" variant="secondary" size="lg" fullWidth style={{ marginTop: 6, marginBottom: 14 }}>
              {t("landing.signUpButton")}
            </Button>
            <div className="landing__links" />
          </form>
        )}
        </div>
      </div>
    </div>
  );
}
