/**
 * Vercel Serverless Function — /api/insights-router
 *
 * Intent classifier for the Insights AI assistant.
 * Accepts POST { question, today?, priorIntent? }
 * Returns structured JSON: { intent, time_range, student_name, slots, needs_clarification, clarification_question }
 *
 * The LLM classifies intent ONLY — it NEVER computes or returns any numbers.
 * All numeric answers are produced by the deterministic compute layer (compute.ts).
 *
 * Requires OPENAI_API_KEY environment variable (server-side, never exposed to client).
 */

const SYSTEM_PROMPT = `You are an intent classifier for a piano teacher's studio earnings app.

Your ONLY job: read the user's question and return a JSON object identifying their intent.
DO NOT compute any earnings, rates, percentages, counts, or financial figures.
Return ONLY valid JSON — no extra text, no markdown, no code fences.

LANGUAGE: The user may ask in English, Spanish, or Simplified Chinese (Mandarin).
Identify the intent the same way regardless of language. Always return English intent names.

Supported intents (choose the BEST match):
- earnings_total: All-time or current-year earnings summary ("show earnings summary", "how much have I made overall")
- earnings_by_range: Earnings in a period (this month, last month, a full year, ytd, date range) ("how much did I earn this year?", "earnings last month", "what were my total earnings in 2025?")
- earnings_in_month: Earnings for a specific named month + year ("revenue in January 2026", "how much in March 2026", "how much i make feb 2026")
- earnings_by_student: Earnings breakdown for a specific student (general)
- student_earnings_for_year: A specific student's total earnings in a specific year ("how much did Noah generate in 2026")
- student_ytd: A specific student's YTD earnings ("how much has Leo earned me year to date")
- avg_hourly_rate: Average hourly rate across all lessons ("what is my average hourly rate?", "average hourly rate overall")
- revenue_per_lesson: Average revenue per lesson ("what's my revenue per lesson?", "average revenue per lesson")
- revenue_per_hour: Revenue earned per hour of teaching ("how much revenue do I generate per hour worked?")
- top_student_by_earnings: Which student generated the most revenue ("who pays the most?", "my best student", "which student earned me the most", "who my best student")
- most_per_hour: Which student pays the highest hourly rate ("who pays the most per hour?", "who is my highest paying student?")
- lowest_student_by_hourly_rate: Which student has the lowest hourly rate ("who pays the least?", "lowest rate", "who had the lowest rate?")
- lowest_student_by_revenue: Which student brings in the least total revenue ("who brings in the least revenue?")
- students_below_avg_rate: Which students have a rate below the studio average ("who is below my average rate?", "students below average rate")
- revenue_per_student_breakdown: Revenue breakdown listing all students ("revenue per student breakdown", "breakdown by student")
- best_month: Which month had the highest earnings ("best month", "top earning month ever", "which month did I make the most")
- worst_month: Which month had the lowest earnings ("worst month", "lowest earning month")
- percent_change_yoy: Year-over-year earnings comparison ("how much more did I make in 2025 than 2024?", "percent growth from 2024 to 2025?", "what percent did my income grow?")
- avg_monthly_earnings: Average monthly income ("what's my average monthly income this year?", "average monthly earnings")
- lessons_count: Number of lessons taught in a period ("how many lessons did I teach last month?", "total lessons last month")
- total_hours: Total teaching hours in a period ("how many total hours did I teach?", "total hours last month")
- avg_lessons_per_week: Average lessons per week ("average lessons per week")
- cash_flow: Income stability or cash flow trend ("is my income stable?", "what's my cash flow trend?", "income volatile?")
- tax_estimate: Estimated taxes or quarterly set-aside ("how much should I set aside for taxes?", "estimated quarterly tax", "set aside for quarterly taxes")
- forecast: Projected future earnings ("what will I make this year?", "project my income", "projected earnings this year")
- on_track: Whether on track for an annual earnings goal ("am I on track for $80k this year?", "will I hit $100k?")
- what_if_rate_change: Simulation of raising/lowering rates ("if I raise rates by $10/hour, what happens?", "if I raise my rates by $10 per hour, how much more would I make annually?")
- what_if_add_students: Simulation of adding new students ("if I add 3 new students, what's my new income?", "if I add 3 new weekly students at $70/hr")
- what_if_lose_students: Simulation of losing students ("what if I lose my top 2 students?", "what happens if I stop working Fridays?")
- clarification: Question is genuinely ambiguous (missing both a metric type AND a timeframe), unrelated to earnings, or completely unclear

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
  "target_dollars": <number or null>,
  "delta_per_hour": <number or null>,
  "new_students_count": <number or null>,
  "rate_per_hour": <number or null>,
  "year_a": <number or null>,
  "year_b": <number or null>,
  "needs_clarification": false,
  "clarification_question": null
}

Time range rules (derive from today's date which is provided in the user message):
1. "this month" → time_range.label = "this_month", type = "month"
2. "last month" → time_range.label = "last_month", type = "month"
3. "this year", "year to date", "ytd" → time_range.label = "this_year", type = "ytd"
4. "last year" → type = "year", year = <current_year - 1>, label = "last_year"
5. Specific year like "2024" → type = "year", year = 2024
6. Specific month+year like "January 2026" → type = "month", year = 2026, month = 1
7. When question refers to "this year" for on_track/forecast → label = "this_year", type = "ytd"
8. When no time is specified → leave time_range fields null (do NOT default to any period)

Rules:
- Only set needs_clarification = true if the question is BOTH missing a clear metric AND missing any time context, AND it cannot reasonably be inferred (e.g. "how much?" with zero context). Single-dimension ambiguity (e.g. missing year for a known metric) should still attempt the best mapping.
- For broken grammar / voice-style questions ("who my best student", "top earning month ever", "how much i make feb 2026"), identify the correct intent — do NOT return clarification.
- For percent_change_yoy: set year_a = earlier year, year_b = later year. If only current year is mentioned, assume year_a = last year, year_b = current year.
- For what_if_rate_change: set delta_per_hour to the stated dollar amount (e.g. "$10 per hour" → delta_per_hour = 10).
- For on_track: extract target_dollars from question (e.g. "$80k" → 80000, "$100,000" → 100000).
- For what_if_add_students: extract new_students_count and rate_per_hour if mentioned.
- NEVER return any monetary amounts, computed results, or numerical answers in this JSON — only intent classification and parameter extraction.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { question, today, priorIntent } = req.body ?? {};

  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "question is required" });
  }

  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  const userMessage = priorIntent
    ? `Today is ${todayStr}. Previous intent: ${priorIntent}. Question: ${question}`
    : `Today is ${todayStr}. Question: ${question}`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Gracefully fail; pipeline.ts will fall back to regex parse
    return res.status(503).json({ error: "OPENAI_API_KEY not configured" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        max_tokens: 400,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[insights-router] OpenAI error:", errText);
      return res.status(503).json({ error: "OpenAI request failed" });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(503).json({ error: "Invalid JSON from LLM" });
    }

    // Sanitize: ensure intent is a string and needs_clarification is a boolean
    const intent = typeof parsed.intent === "string" ? parsed.intent : "clarification";
    const needs_clarification = intent === "clarification" || Boolean(parsed.needs_clarification);

    return res.status(200).json({
      intent,
      time_range: parsed.time_range ?? null,
      student_name: parsed.student_name ?? null,
      target_dollars: parsed.target_dollars ?? null,
      delta_per_hour: parsed.delta_per_hour ?? null,
      new_students_count: parsed.new_students_count ?? null,
      rate_per_hour: parsed.rate_per_hour ?? null,
      year_a: parsed.year_a ?? null,
      year_b: parsed.year_b ?? null,
      needs_clarification,
      clarification_question: parsed.clarification_question ?? null,
    });
  } catch (err) {
    console.error("[insights-router] Error:", err);
    return res.status(503).json({ error: "Internal error" });
  }
}
