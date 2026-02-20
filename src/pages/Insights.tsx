/**
 * Insights — AI assistant for studio data (earnings, students, rates, forecasts).
 * Supports typed search + voice (EN/ES/ZH), multi-turn conversation, categories and suggestions.
 * UI: pastel background, floating cards, centered search (no background), gradient mic, chat-style results.
 */

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { dedupeLessons, getEffectiveRateCents } from "@/utils/earnings";
import type { StudentSummary } from "@/lib/forecasts/types";
import { INSIGHTS_CATEGORIES } from "./insightsConstants";
import { useInsightsConversation } from "./insights/useInsightsConversation";
import { useVoiceInput } from "./insights/useVoiceInput";
import { evaluateInsightsQuestion } from "@/lib/insights";
import type { InsightIntent } from "@/lib/insights/schema";
import { INSIGHTS_TEST_QUESTIONS } from "@/features/insights/testQuestions";
import { Button, IconButton } from "@/components/ui/Button";
import { DownloadIcon } from "@/components/ui/Icons";

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
    userId: data.user?.id,
    lessons: data.lessons,
    roster: data.students,
    earnings,
    students,
    locale,
    timezone,
  });

  const [queryText, setQueryText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");

  const preferredLang = lang === "es" ? "es" : lang === "zh" ? "zh" : "en";
  const [voiceEmptyError, setVoiceEmptyError] = useState<string | null>(null);
  const voice = useVoiceInput({
    preferredLang,
    onTranscript(text) {
      const trimmed = text.trim();
      if (!trimmed) {
        setVoiceEmptyError("Try again");
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

  type TestResultRow = {
    question: string;
    expectedIntent: string;
    expectedMetric: string;
    detectedIntent: string;
    handlerUsed: string;
    expectedMetricValue: string;
    gotMetricValue: string;
    pass: boolean;
    errorMessage: string | null;
    responsePreview: string;
  };
  const [testResults, setTestResults] = useState<TestResultRow[] | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const runInsightsTests = useCallback(async () => {
    setTestRunning(true);
    setTestResults(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const results: TestResultRow[] = [];
    for (const t of INSIGHTS_TEST_QUESTIONS) {
      try {
        const evalResult = await evaluateInsightsQuestion(
          {
            id: `panel-${results.length + 1}`,
            language: "en",
            text: t.question,
            expected_intent: t.expectedIntent,
            expected_metric: t.expectedMetric,
            expects_clarification: t.expectedClarificationNeeded,
            notes: t.notes,
          },
          {
            user_id: data.user?.id,
            lessons: data.lessons,
            roster: data.students,
            earnings,
            students,
            timezone,
            locale: "en-US",
          }
        );
        const pass = evalResult.row.verdict === "PASS";
        const planIntent = evalResult.row.detected_intent as InsightIntent;
        results.push({
          question: t.question,
          expectedIntent: t.expectedIntent,
          expectedMetric: evalResult.row.expected_metric ?? "auto",
          detectedIntent: planIntent,
          handlerUsed: planIntent,
          expectedMetricValue: evalResult.row.expected_metric_value,
          gotMetricValue: evalResult.row.got_metric_value,
          pass,
          errorMessage: evalResult.row.fail_reasons.length > 0 ? evalResult.row.fail_reasons.join("; ") : null,
          responsePreview: evalResult.row.llm_answer.slice(0, 80) + (evalResult.row.llm_answer.length > 80 ? "…" : ""),
        });
      } catch (e) {
        results.push({
          question: t.question,
          expectedIntent: t.expectedIntent,
          expectedMetric: "auto",
          detectedIntent: "—",
          handlerUsed: "—",
          expectedMetricValue: "—",
          gotMetricValue: "—",
          pass: false,
          errorMessage: e instanceof Error ? e.message : String(e),
          responsePreview: "",
        });
      }
    }
    setTestResults(results);
    setTestRunning(false);
  }, [earnings, students, data.user?.id, data.lessons, data.students, lang]);

  const downloadTestResults = useCallback(() => {
    if (!testResults || testResults.length === 0) return;
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const headers = ["Question", "Expected Intent", "Expected Metric", "Detected Intent", "Handler Used", "Expected Metric Value", "Got Metric Value", "Pass", "Error", "Response Preview"];
    const rows = testResults.map((r) => [
      escape(r.question),
      escape(r.expectedIntent),
      escape(r.expectedMetric),
      escape(r.detectedIntent),
      escape(r.handlerUsed),
      escape(r.expectedMetricValue),
      escape(r.gotMetricValue),
      escape(r.pass ? "PASS" : "FAIL"),
      escape(r.errorMessage ?? ""),
      escape(r.responsePreview),
    ]);
    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `insights-test-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [testResults]);

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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onCategoryQuestion(q)}
                  disabled={isLoading}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    borderRadius: 0,
                    justifyContent: "flex-start",
                    boxShadow: "none",
                    transition: "background 0.15s ease",
                  }}
                >
                  {q}
                </Button>
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
          <IconButton
            type="button"
            onClick={voice.phase === "recording" ? voice.stopRecording : voice.startRecording}
            disabled={!voice.supported || isLoading}
            aria-label={voice.phase === "recording" ? "Stop recording" : "Voice input"}
            variant={voice.phase === "recording" ? "danger" : "primary"}
            size="md"
            className="insights-voice-btn"
            style={{
              color: "#fff",
              flexShrink: 0,
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
          </IconButton>
        </div>
      </div>

      {voice.phase === "recording" && (
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", margin: "4px 0 8px" }}>
          Listening…
        </p>
      )}
      {(voice.error || voiceEmptyError) && (
        <p style={{ textAlign: "center", fontSize: 13, color: "#dc2626", margin: "4px 0 8px" }}>{voice.error || voiceEmptyError}</p>
      )}

      {/* Ask button + New chat: side by side, centered */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <Button type="button" variant="primary" size="sm" onClick={onSubmit} disabled={isLoading} loading={isLoading}>
          Ask
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setQueryText("");
            setVoiceEmptyError(null);
            searchInputRef.current?.focus();
          }}
        >
          Clear
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={clear}>
          New chat
        </Button>
      </div>

      {/* Dev-only: Insights test harness */}
      {import.meta.env.DEV && (
        <div style={{ marginBottom: 24, padding: 16, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text-muted)" }}>Diagnostics</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Button type="button" variant="secondary" size="sm" onClick={runInsightsTests} disabled={testRunning} loading={testRunning}>
              {testRunning ? "Running…" : "Run Insights Tests"}
            </Button>
            {testResults && testResults.length > 0 && (
              <Button type="button" variant="secondary" size="sm" onClick={downloadTestResults} leftIcon={<DownloadIcon size={10} />}>
                Download results
              </Button>
            )}
          </div>
          {testResults && (
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Question</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Expected</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Detected</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Expected metric</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Got metric</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Pass</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Error</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Response</th>
                  </tr>
                </thead>
                <tbody>
                  {testResults.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px 8px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }} title={r.question}>{r.question}</td>
                      <td style={{ padding: "6px 8px" }}>{r.expectedIntent}</td>
                      <td style={{ padding: "6px 8px" }}>{r.detectedIntent}</td>
                      <td style={{ padding: "6px 8px" }}>{r.expectedMetricValue}</td>
                      <td style={{ padding: "6px 8px" }}>{r.gotMetricValue}</td>
                      <td style={{ padding: "6px 8px", color: r.pass ? "var(--success)" : "#dc2626" }}>{r.pass ? "✓" : "✗"}</td>
                      <td style={{ padding: "6px 8px", color: "#dc2626" }}>{r.errorMessage ?? "—"}</td>
                      <td style={{ padding: "6px 8px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }} title={r.responsePreview}>{r.responsePreview}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
                {/* Metadata: lesson count + date range, shown under every answer */}
                {m.meta?.metadata && !m.meta.insightsResult?.needsClarification && (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 11,
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-sans)",
                      borderTop: "1px solid var(--border)",
                      paddingTop: 8,
                    }}
                  >
                    Based on {m.meta.metadata.lesson_count} completed lesson{m.meta.metadata.lesson_count !== 1 ? "s" : ""}
                    {m.meta.metadata.date_range_label ? ` · ${m.meta.metadata.date_range_label}` : ""}
                  </div>
                )}
                {/* Dev-only: View details accordion */}
                {import.meta.env.DEV && m.meta?.insightsResult?.trace && (
                  <details
                    style={{
                      marginTop: 8,
                      fontSize: 11,
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        userSelect: "none",
                        outline: "none",
                      }}
                    >
                      View details
                    </summary>
                    <div
                      style={{
                        marginTop: 8,
                        padding: "8px 10px",
                        background: "rgba(0,0,0,0.04)",
                        borderRadius: 6,
                        lineHeight: 1.6,
                      }}
                    >
                      <div><strong>Intent:</strong> {m.meta.insightsResult.trace.queryPlan.intent}</div>
                      <div><strong>Router:</strong> {m.meta.metadata?.router_used ?? "regex"}</div>
                      <div><strong>Truth key:</strong> {m.meta.insightsResult.trace.queryPlan.sql_truth_query_key}</div>
                      <div>
                        <strong>Params:</strong>{" "}
                        {JSON.stringify(
                          {
                            start_date: m.meta.insightsResult.trace.sqlParams?.start_date ?? null,
                            end_date: m.meta.insightsResult.trace.sqlParams?.end_date ?? null,
                            student_name: m.meta.insightsResult.trace.sqlParams?.student_name ?? null,
                          },
                          null,
                          0
                        )}
                      </div>
                      {m.meta.insightsResult.trace.zeroCause && (
                        <div style={{ color: "#b45309" }}>
                          <strong>Zero cause:</strong> {m.meta.insightsResult.trace.zeroCause}
                        </div>
                      )}
                      {(m.meta.insightsResult.trace.queryPlan.time_range?.label ?? m.meta.insightsResult.trace.queryPlan.time_range?.start) && (
                        <div><strong>Range:</strong> {m.meta.insightsResult.trace.queryPlan.time_range?.label ?? m.meta.insightsResult.trace.queryPlan.time_range?.start}</div>
                      )}
                      {m.meta.insightsResult.trace.verifierErrors?.length > 0 && (
                        <div style={{ color: "#dc2626" }}>
                          <strong>Verifier:</strong> {m.meta.insightsResult.trace.verifierErrors.join("; ")}
                        </div>
                      )}
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Raw computed outputs</summary>
                        <pre
                          style={{
                            marginTop: 4,
                            padding: "6px 8px",
                            background: "rgba(0,0,0,0.06)",
                            borderRadius: 4,
                            overflowX: "auto",
                            fontSize: 10,
                            maxHeight: 200,
                          }}
                        >
                          {JSON.stringify(m.meta.insightsResult.computedResult?.outputs, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
}
