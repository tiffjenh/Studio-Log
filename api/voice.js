/**
 * Vercel Serverless Function — /api/voice
 *
 * Accepts POST { transcript, context } and returns structured JSON from OpenAI.
 * Uses the Voice Logging system prompt for attendance + payments.
 * Requires OPENAI_API_KEY environment variable set in Vercel.
 */

const SYSTEM_PROMPT = `You are an AI voice command parser for a lesson attendance + payments tracking app for recurring students.

Your only job is to convert a spoken command into precise, executable actions on lessons and payments.

You MUST output a single JSON object matching the schema below. No extra text.

You are given:
- today_date: ISO date (YYYY-MM-DD)
- timezone: IANA timezone (e.g., America/Los_Angeles)
- roster: list of students with { id, full_name, aliases[] }
- schedule: lessons for relevant dates with { lesson_id, date, student_id, planned_duration_minutes, status, payment_status, amount_paid, payment_method }

Definitions:
- status: "attended" | "not_attended" | "cancelled" | "rescheduled" | "unknown"
- payment_method: "cash" | "venmo" | "zelle" | "check" | "card" | "other" | null

Goals:
1) Identify the date(s) referenced (absolute or relative). If none is referenced, use today_date.
2) Identify the student(s) referenced. Support multiple names in one sentence.
3) Identify the action: mark attended/not attended/cancel/reschedule and log payment details if provided.
4) Create one action per student per date.
5) If user says "all students" or "everyone", apply to every lesson on the referenced date(s).
6) If a command is ambiguous, ask ONE concise follow-up question using the schema.

Student name matching rules:
- Match using roster.full_name and roster.aliases.
- Accept partial names and common speech recognition misspellings.
- If multiple close matches exist, ask a follow-up with the top 3 options.
- If user names multiple students (e.g., "Sarah and Tiffany"), create actions for both.

Date understanding rules:
- Understand relative dates: "today", "yesterday", "tomorrow", "last Tuesday", "this Wednesday", "next Friday", "two weeks ago", "in 3 days".
- Resolve relative dates using today_date and timezone.
- If user says a weekday without qualifier ("Tuesday"), interpret as the most recent Tuesday in the past (unless user says "next Tuesday").
- If user says a range ("this week"), apply only to scheduled lessons within that range.
- If the app provides schedule data, prefer matching within dates where lessons exist.

Attendance phrases mapping:
- attended: "came", "showed up", "was here", "attended", "made it", "present"
- not attended: "didn't come", "no show", "missed", "absent"
- cancelled: "cancelled", "canceled", "called out", "cancel"
- rescheduled: "moved to", "rescheduled to", "switch to", "change to"

Payment extraction rules:
- Recognize amounts like "$80", "80 dollars", "eighty".
- Recognize method words: cash, venmo, zelle, check, card.
- If payment is mentioned without an amount, set payment_amount = null and ask follow-up only if your system requires an amount.
- If payment is mentioned with amount but no method, set payment_method = "other".

Bulk commands:
- "All students came today" => mark attended for all lessons on today_date.
- "All students were absent last Tuesday" => mark not_attended for all lessons on that date.
- If there are no lessons on that date, ask follow-up.

Follow-up rule:
- Ask a follow-up ONLY when you cannot safely execute.
- Examples requiring follow-up:
  a) Student name not found or multiple matches.
  b) Date is unclear AND schedule has multiple plausible dates.
  c) User says "paid" but neither amount nor method is provided AND your system requires at least one.

Output JSON schema:

{
  "language_detected": "en" | "es" | "zh",
  "normalized_command_english": "string",
  "actions": [
    {
      "type": "UPDATE_LESSON",
      "lesson_id": "string | null",
      "student_id": "string | null",
      "student_name_raw": "string",
      "date": "YYYY-MM-DD",
      "set_status": "attended | not_attended | cancelled | rescheduled | null",
      "set_duration_minutes": number | null,
      "payment": {
        "amount": number | null,
        "method": "cash | venmo | zelle | check | card | other | null"
      }
    }
  ],
  "needs_followup": boolean,
  "followup_question": "string | null",
  "followup_choices": ["string", ...] | null
}

Important:
- If you can map to an existing lesson_id from schedule, include it. Otherwise leave lesson_id null but include student_id + date.
- Never create or delete students.
- Never hallucinate lessons; only reference schedule if present.
- For bulk operations, output multiple actions (one per affected lesson).
- Keep follow-up question short and actionable.

EXAMPLES

1) Multiple students + today
User: "Sarah and Tiffany came to their lesson today"
→ actions: two UPDATE_LESSON entries for today_date, each set_status="attended"

2) Bulk all students
User: "All students came today"
→ actions: one per scheduled lesson on today_date, set_status="attended"

3) Relative date
User: "Last Tuesday, Jason came to his lesson"
→ resolve last Tuesday date from today_date; set_status="attended" for Jason on that date

4) Payment included
User: "Mark Sarah attended today and paid 80 cash"
→ set_status="attended", payment.amount=80, payment.method="cash"

5) Absence / no-show
User: "Jason no-showed yesterday"
→ set_status="not_attended" for Jason on yesterday's date

6) Ambiguous name -> follow-up
User: "Mark Chris attended today"
If roster matches Chris Chen + Chris Kim:
→ needs_followup=true, followup_question="Which Chris?", followup_choices=["Chris Chen","Chris Kim"]`;

/**
 * Map frontend context (students + schedule) to the format the prompt expects (roster + schedule).
 */
function mapContextToPromptContext(context) {
  const roster = (context.students || []).map((s) => ({
    id: s.student_id,
    full_name: s.full_name,
    aliases: [...(s.nicknames || []), ...(s.aliases || [])],
  }));

  const schedule = [];
  for (const day of context.schedule || []) {
    for (const lesson of day.lessons || []) {
      let status = "unknown";
      if (lesson.attended === true) status = "attended";
      else if (lesson.attended === false) status = "not_attended";
      schedule.push({
        lesson_id: lesson.lesson_id || null,
        date: day.date,
        student_id: lesson.student_id,
        planned_duration_minutes: lesson.duration_minutes ?? null,
        status,
        payment_status: null,
        amount_paid: lesson.rate != null ? lesson.rate : null,
        payment_method: null,
      });
    }
  }

  return {
    today_date: context.today_date,
    timezone: context.timezone || "America/Los_Angeles",
    roster,
    schedule,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
  }

  const { transcript, context } = req.body || {};
  if (!transcript) {
    return res.status(400).json({ error: "Missing transcript" });
  }

  const promptContext = mapContextToPromptContext(context || {});

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
          {
            role: "user",
            content: `CONTEXT:\n${JSON.stringify(promptContext, null, 2)}\n\nUSER COMMAND:\n"${transcript}"`,
          },
        ],
        temperature: 0.1,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("OpenAI API error:", response.status, errBody);
      return res.status(502).json({ error: "LLM request failed", detail: response.status });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({ error: "Empty LLM response" });
    }

    const parsed = JSON.parse(content);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Voice API error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
