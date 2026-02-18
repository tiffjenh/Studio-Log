"use client";

import { useMemo, useState } from "react";
import { runForecast } from "@/lib/forecasts/runForecast";
import type { EarningsRow, ForecastResponse, SupportedLocale } from "@/lib/forecasts/types";

type Props = {
  earnings: EarningsRow[];
  rangeContext?: {
    mode: "daily" | "weekly" | "monthly" | "yearly" | "students" | "forecasts";
    startDate?: string;
    endDate?: string;
  };
};

const LOCALE_OPTIONS: { label: string; value: SupportedLocale }[] = [
  { label: "EN", value: "en-US" },
  { label: "ES", value: "es-ES" },
  { label: "中文(简)", value: "zh-CN" },
  { label: "中文(繁)", value: "zh-TW" },
];

interface SpeechRecognitionConstructor {
  new (): {
    lang: string;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void) | null;
    onerror: (() => void) | null;
    start: () => void;
  };
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function ForecastsPanel({ earnings, rangeContext }: Props) {
  const [query, setQuery] = useState("");
  const [locale, setLocale] = useState<SupportedLocale>("en-US");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<ForecastResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canUseVoice = useMemo(() => !!getSpeechRecognition(), []);

  async function run(q: string) {
    setLoading(true);
    setErr(null);
    try {
      const data = await runForecast({
        query: q,
        locale,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        rangeContext,
        earnings,
      });
      setRes(data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit() {
    const q = query.trim();
    if (!q) {
      run("Show my forecasts, taxes, and cash flow insights");
      return;
    }
    run(q);
  }

  function startVoice() {
    const SR = getSpeechRecognition();
    if (!SR) return;

    const recog = new SR();
    recog.lang = locale;
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    recog.onresult = (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => {
      const text = event.results?.[0]?.[0]?.transcript ?? "";
      if (text) {
        setQuery(text);
        run(text);
      }
    };

    recog.onerror = () => setErr("Voice input failed. Try again or type your question.");
    recog.start();
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <div
          style={{
            flex: "1 1 200px",
            minWidth: 0,
            borderRadius: 20,
            background: "var(--card)",
            boxShadow: "var(--shadow-soft)",
            border: "1px solid var(--border)",
            padding: "12px 16px",
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => (e.key === "Enter" ? onSubmit() : null)}
            placeholder="Search forecasts, taxes, cash flow…"
            style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: 16, fontFamily: "var(--font-sans)", color: "var(--text)" }}
            aria-label="Search forecasts"
          />
        </div>

        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as SupportedLocale)}
          style={{
            borderRadius: 20,
            background: "var(--card)",
            border: "1px solid var(--border)",
            padding: "12px 14px",
            fontSize: 14,
            fontFamily: "var(--font-sans)",
            color: "var(--text)",
          }}
          aria-label="Language"
          title="Language"
        >
          {LOCALE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onSubmit}
          className="pill"
          style={{ padding: "12px 16px", fontSize: 14 }}
          disabled={loading}
        >
          {loading ? "…" : "Search"}
        </button>

        <button
          type="button"
          onClick={startVoice}
          className="pill"
          style={{ padding: "12px 16px", fontSize: 14, opacity: canUseVoice && !loading ? 1 : 0.5 }}
          disabled={!canUseVoice || loading}
          title={canUseVoice ? "Voice input" : "Voice input not supported in this browser"}
          aria-label="Voice input"
        >
          🎤
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {err && (
          <div className="float-card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Error</div>
            <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{err}</div>
          </div>
        )}

        {!res && !err && (
          <div className="float-card" style={{ padding: 24, fontSize: 14, color: "var(--text-muted)", opacity: 0.9 }}>
            Ask for forecasts, taxes, or cash flow insights. Try: “Forecast my earnings this month.”
          </div>
        )}

        {res && (
          <>
            <div className="float-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Summary</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{res.summary}</div>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 8 }}>{res.details}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              <ForecastCard title={res.cards?.forecast?.title ?? "Earnings forecast"} body={res.cards?.forecast?.body ?? ""} />
              <ForecastCard title={res.cards?.tax?.title ?? "Tax estimation"} body={res.cards?.tax?.body ?? ""} />
              <ForecastCard title={res.cards?.cashflow?.title ?? "Cash flow insights"} body={res.cards?.cashflow?.body ?? ""} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ForecastCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="float-card" style={{ padding: 20 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text)", opacity: 0.9 }}>{body || "—"}</div>
    </div>
  );
}
