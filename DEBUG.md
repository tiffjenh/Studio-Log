# Debugging Voice + Insights (Wweekly)

## Enable debug output

### Insights
- Add `?debug=1` to the Insights page URL, or set `localStorage.insights_debug = "1"`.
- The UI will show a “View details” panel with:
  - Parsed intent
  - Date range
  - Counts (lessons considered)
  - Aggregation / metric id

### Voice (Dashboard)
- Add `?debug=1` on the Dashboard URL to surface the voice debug payload (intent, resolved students, date resolution, plan).

## Common failure modes (and what we fixed)

### 1) “After I clarify, it answers the wrong question”
Root cause: the clarification turn wasn’t resuming the *original* question deterministically, so follow-ups like “earnings”, “attendance”, or a bare student name got treated as brand-new questions.

Fix: we store a **pending clarification** (original question + what param was missing) and deterministically rewrite the follow-up into a resumable query, e.g.:
- Missing student → `"<original>" + " for student <reply>"`
- Missing year → `"<original>" + " in <reply>"`
- Missing rate delta → `"<original>" + " by <reply>"`

### 2) “What-if / tax dropdowns ask ‘earnings or attendance?’”
Root cause: these prompts weren’t mapped to concrete intents / computations, so they fell into the generic fallback clarification.

Fix: added deterministic Insights intents + computations for:
- Hours total
- Average lessons/week
- Cash flow trend + stability
- Tax set-aside guidance
- What-if modeling (rate change, add students, weeks off, lose top N, students needed for target)

### 3) Voice “Move Leo Chen …” still asks “Which Leo?”
Root cause: the move-intent parser captured only the first name (“Leo”) and discarded full-name mentions.

Fix: prefer recognized full-name mentions (e.g. “Leo Chen”) over the first-name regex capture, and add a conservative “scheduled today” tie-breaker to reduce unnecessary ambiguity prompts.

## Manual test checklist (high-signal)

### Voice
- Same first name:
  - Say: “Leo’s class now at 6pm” → should ask “Which Leo?”
  - Tap “Leo Chen” → should automatically apply time change to Leo Chen’s lesson (no second step).
- Full name:
  - Say: “Move Leo Chen’s lesson to tomorrow” → should execute immediately (no “Which Leo?”).
- Duration:
  - “Change Ava’s lesson to an hour and a half” → 90 minutes
  - “Change Emma’s lesson to two hours” → 120 minutes
- Amount:
  - “Leo Chen’s class is now $100” → sets **lesson amount**, not hourly rate

### Insights
- “How many lessons did I teach last month?” → no contradictory empty-state copy
- “What’s my cash flow trend?” → formatted as title + bullets
- “Is my income stable or volatile?” → does not ask earnings/attendance
- “Average lessons per week” → returns a lessons/week value
- “Estimated tax on my income this year?” → returns guidance (25–30%), not a single revenue number labeled “tax”
- Dropdown what-ifs all return a coherent response (or a precise clarification if assumptions are missing)

