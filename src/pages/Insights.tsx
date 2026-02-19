import { useMemo, useState, useRef } from "react";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { dedupeLessons, getEffectiveRateCents } from "@/utils/earnings";
import type { StudentSummary } from "@/lib/forecasts/types";
import { runForecast } from "@/lib/forecasts/runForecast";
import type { ForecastResponse, SupportedLocale } from "@/lib/forecasts/types";
import { detectQueryLanguage, translateForInsights } from "@/utils/insightsLanguage";
import { INSIGHTS_CATEGORIES, SUGGESTION_CHIPS } from "./insightsConstants";

export default function Insights() {
  const { data } = useStoreContext();
  const { lang } = useLanguage();
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [queryText, setQueryText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [answer, setAnswer] = useState<ForecastResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const locale: SupportedLocale = lang === "es" ? "es-ES" : lang === "zh" ? "zh-CN" : "en-US";
  const rangeContext = { mode: "forecasts" as const };

  async function runSearch(q: string) {
    const trimmed = q.trim();
    const query = trimmed || "Show my earnings summary";
    setIsLoading(true);
    setErr(null);
    setAnswer(null);
    try {
      const res = await runForecast({
        query,
        locale,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        rangeContext,
        earnings,
        students,
      });
      const responseLang = detectQueryLanguage(query);
      if (responseLang === "es" || responseLang === "zh") {
        const [summaryTrans, detailsTrans] = await Promise.all([
          translateForInsights(res.summary, responseLang),
          res.details ? translateForInsights(res.details, responseLang) : Promise.resolve(""),
        ]);
        const answerTrans =
          res.answer?.body != null
            ? await translateForInsights(res.answer.body, responseLang)
            : null;
        const titleTrans =
          res.answer?.title != null
            ? await translateForInsights(res.answer.title, responseLang)
            : null;
        setAnswer({
          ...res,
          summary: summaryTrans,
          details: detailsTrans,
          answer:
            res.answer && (titleTrans != null || answerTrans != null)
              ? { title: titleTrans ?? res.answer.title, body: answerTrans ?? res.answer.body }
              : res.answer,
        });
      } else {
        setAnswer(res);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  function onSubmit() {
    runSearch(queryText);
  }

  function onSuggestionChip(question: string) {
    setQueryText(question);
    runSearch(question);
  }

  function onCategoryQuestion(question: string) {
    setQueryText(question);
    searchInputRef.current?.focus();
  }

  function copyAnswer() {
    if (!answer) return;
    const text = [answer.summary, answer.details].filter(Boolean).join("\n\n");
    void navigator.clipboard.writeText(text);
  }

  const cardStyle = {
    background: "var(--card)",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--shadow-card)",
    border: "1px solid var(--border)",
    padding: "var(--space-md)",
  };

  return (
    <div style={{ width: "100%", maxWidth: 640, margin: "0 auto" }}>
      <h1 className="headline-serif" style={{ fontSize: 28, fontWeight: 400, margin: "0 0 20px" }}>
        Insights
      </h1>

      {/* 1) Suggestions box */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Try asking…
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SUGGESTION_CHIPS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => onSuggestionChip(label)}
              disabled={isLoading}
              style={{
                padding: "8px 14px",
                borderRadius: "var(--radius-pill)",
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.8)",
                color: "var(--text)",
                fontSize: 13,
                fontFamily: "var(--font-sans)",
                cursor: isLoading ? "default" : "pointer",
                boxShadow: "var(--shadow-soft)",
                whiteSpace: "nowrap",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 2) Category dropdown + question list */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
          Categories
        </label>
        <select
          value={selectedCategory ?? ""}
          onChange={(e) => setSelectedCategory(e.target.value || null)}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--card)",
            fontSize: 14,
            fontFamily: "var(--font-sans)",
            color: "var(--text)",
            boxShadow: "var(--shadow-soft)",
          }}
          aria-label="Select category"
        >
          <option value="">Select a category…</option>
          {INSIGHTS_CATEGORIES.map((cat) => (
            <option key={cat.label} value={cat.label}>
              {cat.label}
            </option>
          ))}
        </select>
        {selectedCategory && (
          <div style={{ marginTop: 8, ...cardStyle, padding: "8px 0" }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {INSIGHTS_CATEGORIES.find((c) => c.label === selectedCategory)?.questions.map((q, idx, arr) => (
                <li key={q} style={{ borderBottom: idx < arr.length - 1 ? "1px solid var(--border)" : undefined }}>
                  <button
                    type="button"
                    onClick={() => onCategoryQuestion(q)}
                    disabled={isLoading}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      textAlign: "left",
                      border: "none",
                      background: "transparent",
                      color: "var(--text)",
                      fontSize: 14,
                      fontFamily: "var(--font-sans)",
                      cursor: isLoading ? "default" : "pointer",
                      borderRadius: 8,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {q.length > 56 ? `${q.slice(0, 55)}…` : q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 3) Search input */}
      <div style={{ marginBottom: 8 }}>
        <input
          ref={searchInputRef}
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? onSubmit() : null)}
          placeholder="Ask a question about your studio…"
          aria-label="Ask a question"
          style={{
            width: "100%",
            padding: "14px 18px",
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--card)",
            fontSize: 16,
            fontFamily: "var(--font-sans)",
            color: "var(--text)",
            boxShadow: "var(--shadow-soft)",
          }}
        />
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0", paddingLeft: 2 }}>
          Examples: revenue, rates, students, taxes
        </p>
      </div>

      {/* 4) Search button */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <button
          type="button"
          onClick={onSubmit}
          className="pill"
          disabled={isLoading}
          style={{
            padding: "12px 24px",
            fontSize: 15,
            fontFamily: "var(--font-sans)",
            fontWeight: 600,
            boxShadow: "var(--shadow-soft)",
            border: "1px solid var(--border)",
            background: "var(--card)",
          }}
        >
          {isLoading ? "…" : "Search"}
        </button>
      </div>

      {/* 5) Loading: gradient wave */}
      {isLoading && (
        <div className="insights-wave-loader" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <span key={i} className="insights-wave-loader__dot" />
          ))}
        </div>
      )}

      {/* 6) Results area */}
      {!isLoading && err && (
        <div style={{ ...cardStyle, marginTop: 8 }}>
          <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Error</div>
          <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{err}</div>
        </div>
      )}

      {!isLoading && answer && (
        <div style={{ ...cardStyle, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {answer.answer?.title ?? "Answer"}
            </div>
            <button
              type="button"
              onClick={copyAnswer}
              aria-label="Copy answer"
              style={{
                padding: 6,
                border: "none",
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>{answer.summary}</div>
          {answer.details && (
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 10, whiteSpace: "pre-wrap" }}>
              {answer.details}
            </div>
          )}
          {answer.assumptions.length > 0 && (
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
              <strong>Assumptions:</strong> {answer.assumptions.join(" ")}
            </div>
          )}
          {answer.calculations.length > 0 && (
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
              <strong>How:</strong> {answer.calculations.join(" → ")}
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>Confidence: {answer.confidence}</div>

          {answer.missing_info_needed && answer.missing_info_needed.length > 0 && (
            <div style={{ marginTop: 12, padding: 12, background: "rgba(180, 160, 180, 0.08)", borderRadius: 12, fontSize: 14, color: "var(--text)" }}>
              <strong>Need a bit more info:</strong> {answer.missing_info_needed.join(", ")}.
            </div>
          )}

          {answer.chartData && answer.chartData.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Overview</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {answer.chartData.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ minWidth: 80, fontSize: 13, color: "var(--text)" }}>{d.label}</span>
                    <div style={{ flex: 1, height: 24, background: "var(--border)", borderRadius: 6, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.min(100, (d.value / Math.max(...answer.chartData!.map((x) => x.value), 1)) * 100)}%`,
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
        </div>
      )}
    </div>
  );
}
