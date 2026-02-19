import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
  useEffect,
} from "react";
import en from "@/locales/en";
import es from "@/locales/es";
import zh from "@/locales/zh";

const STORAGE_KEY = "studio-log-lang";

export type LangCode = "en" | "es" | "zh";
const translations: Record<LangCode, typeof en> = { en, es, zh };

function getNested(
  obj: Record<string, unknown>,
  path: string
): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const p of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  return typeof current === "string" ? current : undefined;
}

type LanguageContextValue = {
  lang: LangCode;
  setLang: (code: LangCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => {
    if (typeof window === "undefined") return "en";
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "es") return "es";
    if (stored === "zh") return "zh";
    return "en";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const setLang = useCallback((code: LangCode) => {
    setLangState(code);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const dict = translations[lang];
      let value = getNested(dict as Record<string, unknown>, key);
      if (value === undefined) value = getNested(en as Record<string, unknown>, key);
      let out = value ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        }
      }
      return out;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
