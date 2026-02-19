"use client";

import { useMemo, useState } from "react";
import { runForecast } from "@/lib/forecasts/runForecast";
import type { EarningsRow, ForecastResponse, StudentSummary, SupportedLocale } from "@/lib/forecasts/types";
import { useLanguage } from "@/context/LanguageContext";
import { translateForInsights } from "@/utils/insightsLanguage";

type Props = {
  earnings: EarningsRow[];
  students?: StudentSummary[];
  rangeContext?: {
    mode: "daily" | "weekly" | "monthly" | "yearly" | "students" | "forecasts";
    startDate?: string;
    endDate?: string;
  };
  /** When "floating", voice button is rendered fixed bottom-right (dashboard style); when "inline", next to search. */
  voiceButtonPosition?: "inline" | "floating";
  /** When "stacked", search box is centered, larger, with Search button below (e.g. Insights page). */
  searchLayout?: "inline" | "stacked";
};

function langToSpeechLocale(lang: string): string {
  if (lang === "es") return "es-ES";
  if (lang === "zh") return "zh-CN";
  return "en-US";
}

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

export default function ForecastsPanel({ earnings, students, rangeContext, voiceButtonPosition = "inline", searchLayout = "inline" }: Props) {
  const { lang } = useLanguage();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<ForecastResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  const canUseVoice = useMemo(() => !!getSpeechRecognition(), []);
  const locale: SupportedLocale = lang === "es" ? "es-ES" : lang === "zh" ? "zh-CN" : "en-US";

  // Expand search bar to show full query (min width from content)
  const searchMinWidth = Math.min(320, Math.max(180, (query.length || 1) * 10 + 24));

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
        students,
      });
      if (lang === "es" || lang === "zh") {
        const [summaryTrans, detailsTrans] = await Promise.all([
          translateForInsights(data.summary, lang),
          data.details ? translateForInsights(data.details, lang) : Promise.resolve(""),
        ]);
        const answerTrans = data.answer?.body != null ? await translateForInsights(data.answer.body, lang) : null;
        const titleTrans = data.answer?.title != null ? await translateForInsights(data.answer.title, lang) : null;
        setRes({
          ...data,
          summary: summaryTrans,
          details: detailsTrans,
          answer:
            data.answer && (titleTrans != null || answerTrans != null)
              ? { title: titleTrans ?? data.answer.title, body: answerTrans ?? data.answer.body }
              : data.answer,
        });
      } else {
        setRes(data);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit() {
    const q = query.trim();
    if (!q) {
      run("Show my earnings summary");
      return;
    }
    run(q);
  }

  function startVoice() {
    const SR = getSpeechRecognition();
    if (!SR) return;

    const recog = new SR();
    recog.lang = langToSpeechLocale(lang);
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    recog.onresult = (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => {
      const text = event.results?.[0]?.[0]?.transcript ?? "";
      if (text) {
        setQuery(text);
        run(text);
      }
      setIsListening(false);
    };

    recog.onerror = () => {
      setErr("Voice input failed. Try again or type your question.");
      setIsListening(false);
    };
    setIsListening(true);
    recog.start();
  }

  const isStacked = searchLayout === "stacked";

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: isStacked ? "stretch" : "center",
          flexDirection: isStacked ? "column" : "row",
          gap: isStacked ? 12 : 8,
          flexWrap: isStacked ? "nowrap" : "wrap",
          marginBottom: 16,
          ...(isStacked ? { alignItems: "center", maxWidth: 480, marginLeft: "auto", marginRight: "auto" } : {}),
        }}
      >
        <div
          style={{
            ...(isStacked ? { width: "100%" } : { flex: "1 1 200px", minWidth: searchMinWidth, maxWidth: "100%" }),
            borderRadius: 20,
            background: "var(--card)",
            boxShadow: "var(--shadow-soft)",
            border: "1px solid var(--border)",
            padding: isStacked ? "16px 20px" : "12px 16px",
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => (e.key === "Enter" ? onSubmit() : null)}
            placeholder="Ask about revenue, pricing, capacity, what-ifs, tax…"
            style={{
              width: "100%",
              minWidth: 120,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: isStacked ? 18 : 16,
              fontFamily: "var(--font-sans)",
              color: "var(--text)",
            }}
            aria-label="Search forecasts"
          />
        </div>

        <button
          type="button"
          onClick={onSubmit}
          className="pill"
          style={{
            padding: isStacked ? "14px 24px" : "12px 16px",
            fontSize: isStacked ? 16 : 14,
            fontFamily: "var(--font-sans)",
            ...(isStacked ? { width: "100%", maxWidth: 480 } : {}),
          }}
          disabled={loading}
        >
          {loading ? "…" : "Search"}
        </button>

        {voiceButtonPosition === "inline" && (
          <button
            type="button"
            onClick={startVoice}
            aria-label={isListening ? "Stop listening" : "Voice input"}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: isListening ? "#dc2626" : "var(--primary, #c97b94)",
              color: "#fff",
              border: "none",
              boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
            disabled={!canUseVoice || loading}
            title={canUseVoice ? "Voice input" : "Voice not supported"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        )}
      </div>

      {voiceButtonPosition === "floating" && (
        <button
          type="button"
          onClick={isListening ? undefined : startVoice}
          aria-label={isListening ? "Stop listening" : "Voice input"}
          style={{
            position: "fixed",
            bottom: 88,
            right: 20,
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: isListening ? "#dc2626" : "var(--primary, #c97b94)",
            color: "#fff",
            border: "none",
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            cursor: canUseVoice && !loading ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 900,
            transition: "background 0.2s, transform 0.15s",
            transform: isListening ? "scale(1.1)" : "scale(1)",
          }}
          disabled={!canUseVoice || loading}
          title={canUseVoice ? "Voice input" : "Voice not supported"}
        >
          {isListening ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {err && (
          <div className="float-card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Error</div>
            <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{err}</div>
          </div>
        )}

        {!res && !err && (
          <div className="float-card" style={{ padding: 24, fontSize: 14, color: "var(--text-muted)", opacity: 0.9 }}>
            Ask in plain language — revenue, pricing, capacity, what-ifs, tax. Examples: “What was my best month?” · “How many students to reach $100,000 at $70/hr?” · “If I raise rates by $10/hour?” · “Who pays the most?” · “Am I on track for $80k?”
          </div>
        )}

        {res && (
          <>
            {res.missing_info_needed && res.missing_info_needed.length > 0 && (
              <div className="float-card" style={{ padding: 16, background: "var(--card)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Need a bit more info</div>
                <div style={{ fontSize: 14, color: "var(--text)" }}>Please provide: {res.missing_info_needed.join(", ")}.</div>
              </div>
            )}

            <div className="float-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{res.answer?.title ?? "Answer"}</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>{res.summary}</div>
              {res.details && <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 10, whiteSpace: "pre-wrap" }}>{res.details}</div>}
              {res.assumptions.length > 0 && (
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
                  <strong>Assumptions:</strong> {res.assumptions.join(" ")}
                </div>
              )}
              {res.calculations.length > 0 && (
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
                  <strong>How:</strong> {res.calculations.join(" → ")}
                </div>
              )}
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>Confidence: {res.confidence}</div>
            </div>

            {res.chartData && res.chartData.length > 0 && (
              <div className="float-card" style={{ padding: 20 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Overview</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {res.chartData.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ minWidth: 80, fontSize: 13, color: "var(--text)" }}>{d.label}</span>
                      <div style={{ flex: 1, height: 24, background: "var(--border)", borderRadius: 6, overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${Math.min(100, (d.value / Math.max(...res.chartData!.map((x) => x.value), 1)) * 100)}%`,
                            height: "100%",
                            background: "var(--avatar-gradient)",
                            borderRadius: 6,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>${d.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
