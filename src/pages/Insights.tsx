/**
 * Insights — AI assistant for studio data (earnings, students, rates, forecasts).
 * Supports typed search + voice (EN/ES/ZH), multi-turn conversation, categories and suggestions.
 * UI: pastel background, floating cards, centered search (no background), gradient mic, chat-style results.
 */

import { useMemo, useState, useRef, useEffect } from "react";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { dedupeLessons, getEffectiveRateCents } from "@/utils/earnings";
import type { StudentSummary } from "@/lib/forecasts/types";
import { INSIGHTS_CATEGORIES } from "./insightsConstants";
import { useInsightsConversation } from "./insights/useInsightsConversation";
import { useVoiceInput } from "./insights/useVoiceInput";

export default function Insights() {
  const { data } = useStoreContext();
  const { lang } = useLanguage();
  const searchInputRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const completedLessons = dedupeLessons(data.lessons.filter((l) => l.completed));
  const studentById = useMemo(() => new Map(data.students.map((s) => [s.id, s])), [data.students]);

  const earnings = useMemo(
    () =>
      completedLessons.map((l) => {
        const student = studentById.get(l.studentId);
        const name = student ? `${student.firstName} ${student.lastName}` : undefined;
        return {
          date: l.date,
          amount: l.amountCents / 100,
          durationMinutes: l.durationMinutes,
          customer: name,
          studentId: l.studentId,
        };
      }),
    [completedLessons, studentById]
  );

  const students: StudentSummary[] = useMemo(
    () =>
      data.students
        .filter((s) => !s.terminatedFromDate || s.terminatedFromDate > new Date().toISOString().slice(0, 10))
        .map((s) => ({
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          rateCents: getEffectiveRateCents(s, new Date().toISOString().slice(0, 10)),
          durationMinutes: s.durationMinutes,
        })),
    [data.students]
  );

  const locale = lang === "es" ? "es-ES" : lang === "zh" ? "zh-CN" : "en-US";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { messages, sendMessage, clear, isLoading, error } = useInsightsConversation({
    earnings,
    students,
    locale,
    timezone,
  });

  const [queryText, setQueryText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");

  const preferredLang = lang === "es" ? "es" : lang === "zh" ? "zh" : "en";
  const voice = useVoiceInput({
    preferredLang,
    onTranscript(text) {
      setQueryText(text);
      sendMessage(text);
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-grow textarea: ~5 lines max (≈120px) then scroll; smooth height transition.
  const TEXTAREA_MAX_HEIGHT = 120;
  useEffect(() => {
    const el = searchInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  }, [queryText]);

  function onSubmit() {
    const q = queryText.trim();
    if (q) sendMessage(q);
    else sendMessage("Show my earnings summary");
  }

  /** Clicking a category question populates the input and runs the query immediately. */
  function onCategoryQuestion(question: string) {
    setQueryText(question);
    sendMessage(question);
  }

  const floatingCard = {
    background: "var(--card)",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--shadow-card)",
    padding: "var(--space-md)",
    border: "1px solid var(--border)",
  };

  return (
    <div className="insights-page" style={{ width: "100%", maxWidth: 640, margin: "0 auto", padding: "0 20px 32px" }}>
      {/* Page title */}
      <h1 className="headline-serif" style={{ fontSize: 28, fontWeight: 400, margin: "0 0 28px", color: "var(--text)" }}>
        Insights
      </h1>

      {/* Ask about: dropdown (design-system aligned) + sub-questions panel */}
      <div style={{ marginBottom: 28 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "var(--font-sans)" }}>
          Ask about
        </label>
        <div className="insights-dropdown-wrap" style={{ position: "relative", width: "100%" }}>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="insights-dropdown"
            style={{
              width: "100%",
              padding: "14px 44px 14px 16px",
              borderRadius: 18,
              border: "1px solid var(--border)",
              background: "var(--card)",
              fontSize: 14,
              fontFamily: "var(--font-sans)",
              color: "var(--text)",
              cursor: "pointer",
              appearance: "none",
              WebkitAppearance: "none",
              boxShadow: "var(--shadow-soft)",
            }}
            aria-label="Ask about category"
          >
            <option value="">Select a category…</option>
            {INSIGHTS_CATEGORIES.map((cat) => (
              <option key={cat.label} value={cat.label}>
                {cat.label}
              </option>
            ))}
          </select>
          <span className="insights-dropdown-arrow" aria-hidden style={{ position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)", transition: "transform 0.2s ease" }}>
            ▼
          </span>
        </div>
        {selectedCategory && (
          <ul className="insights-category-list" style={{ listStyle: "none", margin: "12px 0 0", padding: 0, border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden", background: "var(--card)", boxShadow: "var(--shadow-card)" }}>
            {INSIGHTS_CATEGORIES.find((c) => c.label === selectedCategory)?.questions.map((q, i, arr) => (
              <li key={q} style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
                <button
                  type="button"
                  onClick={() => onCategoryQuestion(q)}
                  disabled={isLoading}
                  className="insights-category-item"
                  style={{
                    width: "100%",
                    padding: "12px 18px",
                    textAlign: "left",
                    border: "none",
                    background: "transparent",
                    color: "var(--text)",
                    fontSize: 14,
                    fontFamily: "var(--font-sans)",
                    cursor: isLoading ? "default" : "pointer",
                    borderRadius: 0,
                    transition: "background 0.15s ease",
                  }}
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Search row: white container around textarea + voice button */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            width: "100%",
            maxWidth: 440,
            gap: 14,
            padding: "16px 18px",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-soft)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea
              ref={searchInputRef}
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="Ask about your students and earnings…"
              aria-label="Ask a question"
              rows={1}
              style={{
                display: "block",
                width: "100%",
                padding: 0,
                border: "none",
                background: "transparent",
                fontSize: 16,
                fontFamily: "var(--font-sans)",
                color: "var(--text)",
                outline: "none",
                resize: "none",
                minHeight: 24,
                maxHeight: 120,
                lineHeight: 1.4,
                transition: "height 0.15s ease",
                boxSizing: "border-box",
              }}
            />
          </div>
          <button
            type="button"
            onClick={voice.phase === "recording" ? voice.stopRecording : voice.startRecording}
            disabled={!voice.supported || isLoading}
            aria-label={voice.phase === "recording" ? "Stop recording" : "Voice input"}
            className="insights-voice-btn"
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: "none",
              background: "var(--avatar-gradient)",
              color: "#fff",
              cursor: voice.supported && !isLoading ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "var(--shadow-soft)",
              animation: voice.phase === "recording" ? "insights-voice-pulse 1.2s ease-in-out infinite" : "none",
              transition: "filter 0.2s ease, transform 0.15s ease",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        </div>
      </div>

      {voice.phase === "recording" && (
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", margin: "4px 0 8px" }}>
          Listening…
        </p>
      )}
      {voice.error && (
        <p style={{ textAlign: "center", fontSize: 13, color: "#dc2626", margin: "4px 0 8px" }}>{voice.error}</p>
      )}

      {/* Ask button + New chat: side by side, centered */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <button
          type="button"
          onClick={onSubmit}
          className="pill"
          disabled={isLoading}
          style={{
            padding: "10px 22px",
            fontSize: 14,
            fontFamily: "var(--font-sans)",
            fontWeight: 600,
            background: "#ffffff",
            color: "#1a1a1a",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-soft)",
            cursor: isLoading ? "default" : "pointer",
          }}
        >
          {isLoading ? "…" : "Ask"}
        </button>
        <button
          type="button"
          onClick={clear}
          className="pill"
          style={{
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "var(--font-sans)",
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--text-muted)",
            cursor: "pointer",
            boxShadow: "var(--shadow-soft)",
          }}
        >
          New chat
        </button>
      </div>

      {/* Gradient loader while thinking */}
      {isLoading && (
        <div className="insights-wave-loader" aria-hidden="true" style={{ marginBottom: 24 }}>
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <span key={i} className="insights-wave-loader__dot" />
          ))}
        </div>
      )}

      {/* Conversation (chat-style) */}
      <div
        style={{
          minHeight: 120,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {error && (
          <div style={{ ...floatingCard, borderLeft: "4px solid #dc2626" }}>
            <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{error}</div>
          </div>
        )}
        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            {m.role === "user" ? (
              <div
                style={{
                  maxWidth: "85%",
                  padding: "12px 16px",
                  borderRadius: "18px 18px 4px 18px",
                  background: "rgba(182, 177, 217, 0.2)",
                  color: "var(--text)",
                  fontSize: 15,
                  fontFamily: "var(--font-sans)",
                  lineHeight: 1.5,
                }}
              >
                {m.content}
              </div>
            ) : (
              <div
                style={{
                  maxWidth: "90%",
                  ...floatingCard,
                  padding: "16px 18px",
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontFamily: "var(--font-sans)",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    color: "var(--text)",
                  }}
                >
                  {m.content.split("**").map((part, i) =>
                    i % 2 === 1 ? (
                      <strong key={i} style={{ display: "block", marginBottom: 8 }}>
                        {part}
                      </strong>
                    ) : (
                      <span key={i}>{part}</span>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
}
