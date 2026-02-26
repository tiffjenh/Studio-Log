# Insights Chat Response — Audit (where text is generated, payloads, prompts, modules, copy rules)

## 1) Where the Insights chat response text is generated

### What file renders the Insights page UI?

- **`src/pages/Insights.tsx`** — Renders the full Insights page (header, ASK ABOUT dropdown, chat area, composer).
- There is no separate `InsightsChat.tsx`; the chat list and composer live inside `Insights.tsx`.

### Where is the “assistant response” string created?

**Frontend formatter (deterministic pipeline), not an LLM reply.**

Flow:

1. **`src/pages/insights/useInsightsConversation.ts`**  
   On user send it calls **`askInsights(effectiveQuery, context)`** from `@/lib/insights` (i.e. `pipeline.ts`).

2. **`src/lib/insights/pipeline.ts`**  
   - Parses the query → **`parseToQueryPlan`** (`parse.ts`).  
   - Runs **`computeFromPlan`** (`compute.ts`) → runs SQL truth queries, returns structured `outputs`.  
   - Builds the answer string with **`resultToAnswer(computed)`** from **`src/lib/insights/respond.ts`**.

3. **`src/lib/insights/respond.ts`**  
   - Dispatches by **intent** to one of many **`format*`** helpers in **`src/lib/insights/formatAnswer.ts`** (e.g. `formatEarningsInPeriod`, `formatLessonsCountInPeriod`, …).  
   - These take `computed.outputs` (e.g. `total_dollars`, `lesson_count`, `rows`) and return a **single string** (with optional `**bold**` for the UI).

4. **Back in `pipeline.ts`**  
   - That string becomes **`finalAnswerText`**.  
   - For **`earnings_in_period`** only, the pipeline appends a second line:  
     `strings.earningsBasedOn(lessonCount, label)` → e.g. `Based on **17** completed lessons · ${label}`.  
   - **`label`** here is **`meta.date_range_label`**, which is set in **`extractMetadata()`** from either `out.label` / `out.date_range_label` (often absent) or **`plan.time_range.label`** (internal enum, e.g. `"last_30_days"`). **That is why `last_30_days` appears in the UI.**

5. **Back in `useInsightsConversation.ts`**  
   - `displayText = insightsResult.finalAnswerText` (or the clarifying question).  
   - Optionally **`translateForInsights(displayText, language)`** for ES/ZH.  
   - That becomes **`assistantContent`** and is stored as **`message.content`**.

So: **the assistant text is produced by a frontend formatter (`resultToAnswer` → `formatAnswer.ts`), driven by structured `computed.outputs` and `metadata` (e.g. `date_range_label`). There is no backend API that returns the final sentence; the only backend call is `/api/insights-router` for **intent classification only** (no numbers, no answer text).**

### Component that maps over messages and renders the assistant bubble

From **`src/pages/Insights.tsx`**:

```tsx
{messages.map((m, idx) => (
  <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", width: "100%" }}>
    {m.role === "user" ? renderUserBubble(m) : renderAssistantCard(m)}
  </div>
))}
```

- **User:** `renderUserBubble(m)` → `<div className="insights-userBubble">{m.content}</div>`.
- **Assistant:** `renderAssistantCard(m)` → a card that calls **`renderAssistantModules(m)`** and then shows meta (lesson count + date range).

**`renderAssistantModules(m)`** (same file):

- Reads **`m.content`** (the string from `finalAnswerText` / translation) and renders it as the summary paragraph (splitting `**` for bold).
- Reads **`m.meta?.insightsResult?.computedResult?.outputs`** and, based on presence of `rows`, `total_dollars`, `lesson_count`, etc., decides whether to add:
  - rate breakdown bars,
  - ranking rows (medals + student name + amount),
  - or label/value rows (Total earned, Lessons taught, etc.).

There is **no** separate “tool output → display text” step; the display text **is** the output of `resultToAnswer` + pipeline’s earnings suffix. The “tool output” is the structured **`outputs`** object; the **display text** is the string produced from it in `respond.ts` / `formatAnswer.ts`.

---

## 2) What the response payload looks like (and where backend keys leak)

### Example: message that shows “last_30_days”

**Conversation message** (what the UI stores and renders):

```ts
// From useInsightsConversation.ts — ConversationMessage
{
  role: "assistant",
  content: "$1,265\nBased on **17** completed lessons · last_30_days",  // ← last_30_days leaked here
  meta: {
    response: { /* ForecastResponse legacy shape */ },
    insightsResult: {
      finalAnswerText: "$1,265\nBased on **17** completed lessons · last_30_days",
      computedResult: {
        intent: "earnings_in_period",
        query_key: "earnings_in_period",
        outputs: {
          total_cents: 126500,
          total_dollars: 1265,   // or derived from total_cents
          lesson_count: 17,
          start_date: "2026-01-27",
          end_date: "2026-02-25"
          // no "label" or "date_range_label" in outputs from compute
        },
        confidence: "high",
      },
      needsClarification: false,
      clarifyingQuestion: null,
      metadata: {
        lesson_count: 17,
        date_range_label: "last_30_days",   // ← internal enum leaked here
        completed_only: true,
        router_used: "regex",
        explainability: {
          metricId: "earnings_in_period",
          dateRange: { start: "2026-01-27", end: "2026-02-25", label: "last_30_days" },
          ...
        },
      },
      trace: { queryPlan, sqlParams, ... },
      usedPipeline: true,
    },
    metadata: { lesson_count: 17, date_range_label: "last_30_days", ... },
  },
}
```

**Where `last_30_days` comes from:**

- **Not** from the LLM: the model only returns intent (+ time_range params) from `/api/insights-router`.
- **Not** from the database: SQL uses `start_date` / `end_date` only.
- It comes from the **time range normalization** in the frontend:
  - **`src/lib/insights/metrics/dateNormalize.ts`** returns `{ start, end, label: "last_30_days" }` for “last 30 days” (and similar for `last_7_days`, etc.).
  - **`src/lib/insights/parse.ts`** puts that into **`plan.time_range.label`**.
  - **`extractMetadata()`** in **`pipeline.ts`** sets **`metadata.date_range_label = plan.time_range.label`** when the compute `outputs` don’t provide `out.label` / `out.date_range_label`.
  - That **`date_range_label`** is then:
    - Used in the pipeline to build the second line of the answer: `strings.earningsBasedOn(lessonCount, label)` → **“Based on … · last_30_days”**.
    - Stored in **`meta.metadata.date_range_label`** and shown again in the card footer: **“Based on 17 completed lessons · last_30_days”** in **`Insights.tsx`** (`insights-assistantCard__meta`).

So **`last_30_days` is an internal time-range enum/label** from the parser/normalizer; it is never sent to the LLM and never comes from the DB — it’s just passed through as the “date range label” and currently shown verbatim in the UI.

---

## 3) How the model is instructed (prompt templates)

### Where the LLM prompt is stored

- **`api/insights-router.js`** (Vercel serverless function for **intent classification only**).

The app does **not** have a separate “Insights answer” LLM call. The only LLM call is this router.

### System prompt (Insights intent classifier)

From **`api/insights-router.js`** (excerpt):

```text
You are an intent classifier for a piano teacher's studio earnings app.

Your ONLY job: read the user's question and return a JSON object identifying their intent.
DO NOT compute any earnings, rates, percentages, counts, or financial figures.
Return ONLY valid JSON — no extra text, no markdown, no code fences.

LANGUAGE: The user may ask in English, Spanish, or Simplified Chinese (Mandarin).
Identify the intent the same way regardless of language. Always return English intent names.

Supported intents (choose the BEST match):
- earnings_total: All-time or current-year earnings summary ...
- earnings_by_range: Earnings in a period (this month, last month, a full year, ytd, date range) ...
- earnings_in_month: Earnings for a specific named month + year ...
- student_ytd: A specific student's YTD earnings ...
- top_student_by_earnings: Which student generated the most revenue ...
- ...
- clarification: Question is genuinely ambiguous ...

Return JSON with EXACTLY this structure (all fields required, use null for missing values):
{
  "intent": "<one of the above intent names>",
  "time_range": {
    "type": "month" | "ytd" | "year" | "custom" | "all" | null,
    "year": <number or null>,
    "month": <1-12 or null>,
    "start_date": "YYYY-MM-DD" or null,
    "end_date": "YYYY-MM-DD" or null,
    "label": "last_month" | "this_month" | "last_year" | "this_year" | null
  },
  "student_name": <string or null>,
  ...
  "needs_clarification": false,
  "clarification_question": null
}

Time range rules (derive from today's date which is provided in the user message):
1. "this month" → time_range.label = "this_month", type = "month"
2. "last month" → time_range.label = "last_month", type = "month"
...
8. When no time is specified → leave time_range fields null (do NOT default to any period)

Rules:
- Only set needs_clarification = true if ...
- NEVER return any monetary amounts, computed results, or numerical answers in this JSON — only intent classification and parameter extraction.
```

User message is: `Today is ${todayStr}. Question: ${question}` (or with prior intent if provided).

### Other prompts

- There are **no** other LLM prompts in this codebase for “earnings summary”, “top student”, “on track”, etc. Those answers are produced entirely by **`respond.ts`** + **`formatAnswer.ts`** from the structured **`computed.outputs`** and **metadata**.

---

## 4) How “modules/cards” are selected

- **Modules are driven by structured data**, not by an LLM. The UI does **not** use a message type like `kind: "text" | "summary" | "cards" | "chart"`.

### Message type in code

**`src/pages/insights/useInsightsConversation.ts`**:

```ts
export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  meta?: {
    response?: ForecastResponse;
    insightsResult?: AskInsightsResult;
    metadata?: InsightsMetadata;
  };
};
```

There is **no** `kind` or `type` on the message. The UI infers what to render from:

- **`m.content`** — always the main summary text (with `**bold**`).
- **`m.meta?.insightsResult?.computedResult?.outputs`** — used to choose:
  - **Rows with hourly rate** → rate breakdown bars.
  - **Rows without hourly rate (but with name/total_dollars)** → ranking list (medals + name + amount).
  - **Numeric outputs** (`total_dollars`, `lesson_count`, `percent_change`, `projected_*`, etc.) → label/value rows + optional progress bar.

So: **heuristics on the shape of `outputs`** (and a bit on intent implied by which fields exist), not a dedicated “cards” or “chart” type from the model.

### Flow summary

1. **Always:** one summary block from **`m.content`** (the string from `resultToAnswer` + pipeline suffix).
2. **Then:** if `outputs` has `rows` with rate info → rate bars; else if `rows` with name/amount → ranking list; else if numeric fields → metric rows (+ progress if `progress_percent`).
3. **Footer:** “Based on X completed lessons · {metadata.date_range_label}” — and **that’s where `last_30_days` shows up**; it should be a human-readable label instead.

---

## 5) Copy rules + rounding rules

### Leading sentence (e.g. “In January 2026, you earned $4,788.75 across 66 lessons.”)

- **Currently:** The app does **not** always start with a sentence like that. For **earnings_in_period**, **`formatEarningsInPeriod`** in **`formatAnswer.ts`** returns only **`fmt(v)`** (e.g. `"$1,265"`). The pipeline then appends **“Based on **17** completed lessons · last_30_days”**. So you get:
  - `"$1,265\nBased on **17** completed lessons · last_30_days"`.
- So: **no** “In January 2026, you earned $X across N lessons.” style lead sentence today. To match the mock, you’d add a single opening sentence (with human date range and 2-decimal currency) and keep the rest as today’s modules.

### Time ranges: never raw, always human

- **Requirement:** Do **not** show raw tokens like **`last_30_days`**. Map to:
  - “last 30 days”, “this month”, “Jan 2026”, “2025 YTD”, etc.
- **Where to fix:**
  - **`extractMetadata()`** in **`pipeline.ts`**: when setting **`date_range_label`**, map internal enums (`last_30_days`, `last_7_days`, `this_month`, `last_month`, `ytd`, etc.) to a **human-readable string** (and use that same string in **`strings.earningsBasedOn(lessonCount, label)`** and in **`metadata.date_range_label`** so the card footer also shows the human label).
  - Optionally keep the internal enum only in **`trace`** / **explainability** (or strip from client if you don’t need it in the UI).

### Currency and pluralization (current behavior)

- **Currency:** In **`formatAnswer.ts`**, **`fmt(n)`** is:
  - `"$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })`
  - So you can get **$1,265** or **$1,265.00** depending on the number. The mock’s “always 2 decimals” (e.g. **$1,265.00**) would require **`minimumFractionDigits: 2, maximumFractionDigits: 2`** (or equivalent) in one shared formatter used for display.
- **Pluralization:** The codebase already uses **“1 lesson” vs “66 lessons”** in several places (e.g. **`formatLessonsCountInPeriod`**: `lesson${n === 1 ? "" : "s"}`; **`strings.earningsBasedOn`** in pipeline: `lesson{m.meta.metadata.lesson_count !== 1 ? "s" : ""}`). So pluralization is already a rule; keep it.

### Summary table

| Rule | Current state | Recommendation |
|------|----------------|----------------|
| Lead sentence (“In Jan 2026, you earned $X across N lessons.”) | Not implemented; only “$X” + “Based on N lessons · last_30_days” | Add one opening sentence when you have a single period + total + count; use human date range and 2-decimal currency. |
| Time range in UI | Raw enum `last_30_days` (and similar) in content and meta | Map enums → “last 30 days”, “this month”, “Jan 2026”, etc., in one place and use that for both `finalAnswerText` and `metadata.date_range_label`. |
| Currency | 0–2 decimals (e.g. $1,265 or $1,265.00) | Standardize to 2 decimals (e.g. $1,265.00) in the shared display formatter if the mock requires it. |
| Pluralization | “1 lesson” / “N lessons” (and similar) already used | Keep as-is. |

---

## Quick reference: key files

| Purpose | File(s) |
|--------|--------|
| Insights page UI + message list + assistant card/modules | `src/pages/Insights.tsx` |
| Conversation state, call to askInsights, message.content = finalAnswerText | `src/pages/insights/useInsightsConversation.ts` |
| Pipeline: parse → compute → resultToAnswer → finalAnswerText + metadata | `src/lib/insights/pipeline.ts` |
| Intent → one format* function; “tool output” → display string | `src/lib/insights/respond.ts` |
| All format* helpers (currency, lessons, etc.) | `src/lib/insights/formatAnswer.ts` |
| Time range parsing; label e.g. last_30_days | `src/lib/insights/metrics/dateNormalize.ts`, `parse.ts` |
| metadata.date_range_label and earnings suffix | `pipeline.ts` → `extractMetadata()`, and block that does `strings.earningsBasedOn(lessonCount, label)` |
| LLM (intent only) | `api/insights-router.js` |
| Message type | `ConversationMessage` in `useInsightsConversation.ts` (role, content, meta; no kind). |

This audit should be enough to stop leaking backend/internal keys (e.g. `last_30_days`) and to align copy and rounding with the mock (human date range, optional lead sentence, 2-decimal currency, existing pluralization).
