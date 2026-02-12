import { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/context/LanguageContext";

export default function ForgotPassword() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSent(true);
  };

  return (
    <div style={{ minHeight: "100dvh", padding: 24, paddingTop: 48, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Link to="/" style={{ display: "inline-flex", marginBottom: 24, color: "var(--text)", textDecoration: "none", fontFamily: "var(--font-sans)", alignSelf: "flex-start" }}>← {t("common.back")}</Link>
      <div className="float-card" style={{ maxWidth: 400, width: "100%", padding: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20, fontFamily: "var(--font-sans)" }}>{t("landing.forgotPassword")}</h1>
        {sent ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{t("landing.forgotPasswordSent")}</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <p style={{ color: "var(--text-muted)", marginBottom: 20, fontSize: 14 }}>{t("landing.forgotPasswordHint")}</p>
            <input
              type="email"
              placeholder={t("landing.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: 14, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16 }}
            />
            <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>{t("landing.sendResetLink")}</button>
          </form>
        )}
        <div style={{ marginTop: 20 }}>
          <Link to="/" style={{ color: "var(--primary)", fontSize: 14 }}>{t("landing.backToLogin")}</Link>
        </div>
      </div>
    </div>
  );
}
