/**
 * Insights — AI assistant for studio data (earnings, students, rates, forecasts).
 * Supports typed search + voice (EN/ES/ZH), multi-turn conversation, categories and suggestions.
 * UI matches mocks: header, ASK ABOUT dropdown, chat bubbles + assistant cards with modules, chips, composer.
 */

import { useMemo, useState, useRef, useEffect } from "react";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { dedupeLessons, getEffectiveRateCents } from "@/utils/earnings";
import type { StudentSummary } from "@/lib/forecasts/types";
import { INSIGHTS_CATEGORIES } from "./insightsConstants";
import { useInsightsConversation } from "./insights/useInsightsConversation";
import { useVoiceInput } from "./insights/useVoiceInput";
import "./Insights.css";

const LIGHTBULB_SVG = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
    <path d="M9 18h6" />
    <path d="M10 22h4" />
  </svg>
);

/** Chips shown above composer when no user message yet (match mock: How much this month?, Top student?, Tax estimate) */
const SUGGESTION_CHIP_QUESTIONS: string[] = [
  "How much did I make this month?",
  "Which student earned me the most?",
  "How much should I set aside for taxes?",
];

const EMPTY_STATE_PILLS: { label: string; question: string }[] = [
  { label: "Revenue summary", question: "Show my earnings summary" },
  { label: "Top earning student", question: "Which student earned me the most?" },
  { label: "Tax estimate", question: "How much should I set aside for taxes?" },
  { label: "Rate breakdown", question: "What is my average hourly rate?" },
];

const PAPER_PLANE_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const REFRESH_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </svg>
);

const MIC_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

export default function Insights() {
  const { data } = useStoreContext();
  const { lang, t } = useLanguage();
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
    userId: data.user?.id,
    lessons: data.lessons,
    roster: data.students,
    earnings,
    students,
    locale,
    timezone,
    language: lang,
  });

  const [queryText, setQueryText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) setCategoryDropdownOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCategoryDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const preferredLang = lang === "es" ? "es" : lang === "zh" ? "zh" : "en";
  const [voiceEmptyError, setVoiceEmptyError] = useState<string | null>(null);
  const voice = useVoiceInput({
    preferredLang,
    onTranscript(text) {
      const trimmed = text.trim();
      if (!trimmed) {
        setVoiceEmptyError(t("insights.tryAgain"));
        return;
      }
      setVoiceEmptyError(null);
      setQueryText(trimmed);
      sendMessage(trimmed);
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

  const selectedCategoryLabel = selectedCategory ? INSIGHTS_CATEGORIES.find((c) => c.id === selectedCategory)?.labelKey : null;
  const hasUserSentMessage = messages.some((m) => m.role === "user");

  function renderUserBubble(m: (typeof messages)[0]) {
    if (m.role !== "user") return null;
    return <div className="insights-userBubble">{m.content}</div>;
  }

  function renderAssistantModules(m: (typeof messages)[0]) {
    const out = m.meta?.insightsResult?.computedResult?.outputs as Record<string, unknown> | undefined;
    const rows = Array.isArray(out?.rows) ? out.rows : null;
    const hasNumericOutputs =
      out &&
      (out.total_earned != null || out.totalEarned != null || out.total_dollars != null || out.lesson_count != null || out.lessons_taught != null || out.projected_full_year != null || out.projected_yearly_dollars != null);

    const summaryEl = (
      <p className="insights-assistantCard__summary">
        {m.content.split("**").map((part, i) =>
          i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
        )}
      </p>
    );

    if (rows && rows.length > 0) {
      const hasHourlyRate = (rows as Array<Record<string, unknown>>).some((r) => r.hourly_dollars != null || r.hourly_cents != null);
      if (hasHourlyRate) {
        const rateCounts = (rows as Array<Record<string, unknown>>).reduce<Record<string, number>>((acc, r) => {
          const rate = r.hourly_dollars != null ? Number(r.hourly_dollars) : (r.hourly_cents != null ? Number(r.hourly_cents) / 100 : 0);
          const key = rate.toFixed(0);
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {});
        const maxCount = Math.max(...Object.values(rateCounts), 1);
        return (
          <>
            {summaryEl}
            <div className="insights-module">
              {(Object.entries(rateCounts) as [string, number][])
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([rate, count]) => (
                  <div key={rate} className="insights-rateRow">
                    <span className="insights-rateRow__label">${rate}/hr</span>
                    <div className="insights-rateRow__barWrap">
                      <div className="insights-rateRow__barFill" style={{ width: `${(count / maxCount) * 100}%` }} />
                    </div>
                    <span className="insights-rateRow__count">{count} student{count !== 1 ? "s" : ""}</span>
                  </div>
                ))}
            </div>
          </>
        );
      }
      const medals = ["🥇", "🥈", "🥉"];
      return (
        <>
          {summaryEl}
          <div className="insights-module">
            {(rows as Array<Record<string, unknown>>).slice(0, 5).map((row, i) => (
              <div key={i} className="insights-rankingRow">
                <div className="insights-rankingRow__left">
                  <span>{medals[i] ?? ""}</span>
                  <div>
                    <div className="insights-rankingRow__name">{String(row.name ?? row.student_name ?? row.label ?? "—")}</div>
                    {(row.lessons != null || row.rate != null) && (
                      <div className="insights-rankingRow__sub">
                        {row.lessons != null && `${row.lessons} lessons`}
                        {row.lessons != null && row.rate != null && " · "}
                        {row.rate != null && `$${Number(row.rate)}/hr`}
                      </div>
                    )}
                  </div>
                </div>
                <span className="insights-rankingRow__amount">
                  {row.total_dollars != null ? `$${Number(row.total_dollars).toFixed(2)}` : row.totalEarned != null ? `$${Number(row.totalEarned).toFixed(2)}` : "—"}
                </span>
              </div>
            ))}
          </div>
        </>
      );
    }

    if (hasNumericOutputs && out) {
      const labelValuePairs: { label: string; value: string; positive?: boolean; negative?: boolean }[] = [];
      if (out.total_earned != null || out.totalEarned != null || out.total_dollars != null) {
        const v = Number(out.total_earned ?? out.totalEarned ?? out.total_dollars ?? 0);
        labelValuePairs.push({ label: "Total earned", value: `$${v.toFixed(2)}` });
      }
      if (out.lesson_count != null || out.lessons_taught != null) {
        const v = Number(out.lesson_count ?? out.lessons_taught ?? 0);
        labelValuePairs.push({ label: "Lessons taught", value: String(v) });
      }
      if (out.percent_change != null || out.delta_percent != null) {
        const v = Number(out.percent_change ?? out.delta_percent ?? 0);
        const amt = out.delta_amount != null ? ` ($${Math.abs(Number(out.delta_amount)).toFixed(2)})` : "";
        labelValuePairs.push({
          label: "vs previous month",
          value: `${v >= 0 ? "↑" : "↓"}${Math.abs(v).toFixed(1)}%${amt}`,
          positive: v >= 0,
          negative: v < 0,
        });
      }
      if (out.earned_so_far_dollars != null) {
        labelValuePairs.push({ label: "Earned so far (Feb 25)", value: `$${Number(out.earned_so_far_dollars).toFixed(2)}` });
      }
      if (out.projected_full_year != null || out.projected_yearly_dollars != null) {
        const v = Number(out.projected_full_year ?? out.projected_yearly_dollars ?? 0);
        labelValuePairs.push({ label: "Projected full year", value: `$${v.toFixed(2)}`, negative: true });
      }
      if (out.needed_per_month_dollars != null) {
        labelValuePairs.push({ label: "Needed per month to hit goal", value: `$${Number(out.needed_per_month_dollars).toFixed(2)}`, negative: true });
      }
      const progressPercent = out.progress_percent != null ? Number(out.progress_percent) : null;
      if (labelValuePairs.length > 0 || progressPercent != null) {
        return (
          <>
            {summaryEl}
            <div className="insights-module">
              {labelValuePairs.map((pair, i) => (
                <div key={i} className="insights-module__row">
                  <span className="insights-module__label">{pair.label}</span>
                  <span
                    className={
                      pair.positive ? "insights-module__value insights-module__value--positive" :
                      pair.negative ? "insights-module__value insights-module__value--negative" :
                      "insights-module__value insights-module__value--teal"
                    }
                  >
                    {pair.value}
                  </span>
                </div>
              ))}
            </div>
            {progressPercent != null && (
              <div className="insights-progressWrap">
                <div className="insights-progressLabel">
                  <span>Progress to goal</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="insights-progressBar">
                  <div
                    className={progressPercent >= 0 ? "insights-progressBar__fill" : "insights-progressBar__fill insights-progressBar__fill--negative"}
                    style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                  />
                </div>
              </div>
            )}
          </>
        );
      }
    }

    return summaryEl;
  }

  function renderAssistantCard(m: (typeof messages)[0]) {
    if (m.role !== "assistant") return null;
    return (
      <div className="insights-assistantCard">
        {renderAssistantModules(m)}
        {m.meta?.metadata && !m.meta.insightsResult?.needsClarification && m.meta.metadata.lesson_count > 0 && m.meta.metadata.date_range_label_human && (
          <div className="insights-assistantCard__meta">
            Based on {m.meta.metadata.lesson_count} completed lesson{m.meta.metadata.lesson_count !== 1 ? "s" : ""}
            {" · "}
            {m.meta.metadata.date_range_label_human}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="insights-page">
      {/* 1) Page header — icon + title + subtitle, tight spacing */}
      <header className="insights-header">
        <div className="insights-header__icon">{LIGHTBULB_SVG}</div>
        <div className="insights-header__text">
          <h1 className="insights-header__title">{t("insights.title")}</h1>
          <p className="insights-header__subtitle">{t("insights.subtitle")}</p>
        </div>
      </header>

      {/* 2) ASK ABOUT dropdown — pill field + menu list */}
      <div className="insights-askabout" ref={categoryDropdownRef}>
        <label className="insights-askabout__label">{t("insights.askAbout")}</label>
        <div style={{ position: "relative", width: "100%", maxWidth: "100%" }}>
          <button
            type="button"
            className="insights-askabout__trigger"
            data-placeholder={selectedCategoryLabel ? undefined : "true"}
            onClick={() => setCategoryDropdownOpen((o) => !o)}
            aria-expanded={categoryDropdownOpen}
            aria-haspopup="listbox"
            aria-label="Ask about category"
          >
            {selectedCategoryLabel ? t(selectedCategoryLabel) : t("insights.selectCategoryPlaceholder")}
          </button>
          <span className="insights-askabout__chevron" aria-hidden>▼</span>

          {categoryDropdownOpen && (
            <div role="listbox" id="insights-category-listbox" aria-label="Category" className="insights-askabout__panel">
              <button
                type="button"
                role="option"
                className="insights-askabout__option"
                aria-selected={selectedCategory === ""}
                onClick={() => { setSelectedCategory(""); setCategoryDropdownOpen(false); }}
              >
                {selectedCategory === "" && <span className="insights-askabout__check">✓</span>}
                {t("insights.selectCategoryPlaceholder")}
              </button>
              {INSIGHTS_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="option"
                  className="insights-askabout__option"
                  aria-selected={selectedCategory === cat.id}
                  onClick={() => { setSelectedCategory(cat.id); setCategoryDropdownOpen(false); }}
                >
                  {selectedCategory === cat.id && <span className="insights-askabout__check">✓</span>}
                  {t(cat.labelKey)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category questions: show when a category is selected */}
      {selectedCategory && (() => {
        const cat = INSIGHTS_CATEGORIES.find((c) => c.id === selectedCategory);
        if (!cat || !cat.questions.length) return null;
        return (
          <div className="insights-categoryQuestions">
            <ul>
              {cat.questions.map((q) => (
                <li key={q}>
                  <button type="button" onClick={() => onCategoryQuestion(q)} disabled={isLoading}>{q}</button>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* Scrollable conversation + chips (when no user message) + composer */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div className="insights-chat">
          {error && (
            <div className="insights-errorCard">
              <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{error}</div>
            </div>
          )}

          {isLoading && (
            <div className="insights-wave-loader" aria-hidden style={{ marginBottom: 24 }}>
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <span key={i} className="insights-wave-loader__dot" />
              ))}
            </div>
          )}

          {messages.length === 0 && !isLoading && (
            <div className="insights-empty">
              <div className="insights-empty__icon">{LIGHTBULB_SVG}</div>
              <h2 className="insights-empty__title">Ask anything about your studio</h2>
              <p className="insights-empty__sub">Earnings, students, forecasts, taxes...</p>
              <div className="insights-empty__pills">
                {EMPTY_STATE_PILLS.map((pill) => (
                  <button key={pill.question} type="button" className="insights-empty__pill" onClick={() => onCategoryQuestion(pill.question)}>
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, idx) => (
            <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", width: "100%" }}>
              {m.role === "user" ? renderUserBubble(m) : renderAssistantCard(m)}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* 4) Suggested question chips — only when no user message yet; horizontal scroll */}
        {!hasUserSentMessage && !isLoading && (
          <div className="insights-chipRow">
            {SUGGESTION_CHIP_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                className="insights-chip"
                onClick={() => onCategoryQuestion(question)}
                disabled={isLoading}
              >
                {question.length > 22 ? question.slice(0, 22) + "…" : question}
              </button>
            ))}
          </div>
        )}

        {/* 5) Bottom composer — input pill + mic inside + Ask / Clear / New */}
        <div className="insights-composer">
          {voice.phase === "recording" && (
            <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", margin: "0 0 8px", fontFamily: "var(--font-sans)" }}>{t("insights.listening")}</p>
          )}
          {(voice.error || voiceEmptyError) && (
            <p style={{ textAlign: "center", fontSize: 13, color: "#dc2626", margin: "0 0 8px", fontFamily: "var(--font-sans)" }}>{voice.error || voiceEmptyError}</p>
          )}

          <div className="insights-inputPill">
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
              placeholder={t("insights.inputPlaceholder")}
              aria-label="Ask a question"
              rows={1}
            />
            <button
              type="button"
              className="insights-micBtn"
              onClick={voice.phase === "recording" ? voice.stopRecording : voice.startRecording}
              disabled={!voice.supported || isLoading}
              aria-label={voice.phase === "recording" ? "Stop recording" : "Voice input"}
              style={{ animation: voice.phase === "recording" ? "insights-voice-pulse 1.2s ease-in-out infinite" : "none" }}
            >
              {MIC_SVG}
            </button>
          </div>

          <div className="insights-actionsRow">
            <button
              type="button"
              className="insights-askBtn"
              onClick={onSubmit}
              disabled={isLoading}
            >
              {PAPER_PLANE_SVG}
              {t("insights.askBtn")}
            </button>
            <button
              type="button"
              className="insights-clearBtn"
              onClick={() => {
                setQueryText("");
                setVoiceEmptyError(null);
                searchInputRef.current?.focus();
              }}
            >
              {t("insights.clearBtn")}
            </button>
            <button type="button" className="insights-newBtn" onClick={clear}>
              {REFRESH_SVG}
              {t("insights.newChatBtn")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
