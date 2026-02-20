import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/ui/Button";

const OPTIONS: { code: "en" | "es" | "zh"; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "zh", label: "繁" },
];

export default function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-label="Switch language"
        style={{ minWidth: 52 }}
      >
        {OPTIONS.find((o) => o.code === lang)?.label ?? "EN"}
      </Button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-elevated)",
            overflow: "hidden",
            zIndex: 1000,
          }}
        >
          {OPTIONS.map((opt) => (
            <Button
              key={opt.code}
              type="button"
              variant="tab"
              active={lang === opt.code}
              size="sm"
              fullWidth
              onClick={() => {
                setLang(opt.code);
                setOpen(false);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                justifyContent: "flex-start",
                borderRadius: 0,
                boxShadow: "none",
              }}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
