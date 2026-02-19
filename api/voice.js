/**
 * Vercel Serverless Function — /api/voice
 *
 * Accepts POST { transcript, context } and returns structured JSON from OpenAI.
 * Uses the Voice Logging system prompt for attendance + payments.
 * Requires OPENAI_API_KEY environment variable set in Vercel.
 */

const SYSTEM_PROMPT = `You are an AI voice command parser for a lesson attendance + payments tracking app for recurring students.

Your only job is to convert a spoken command into precise, executable actions on lessons and payments.

LANGUAGE: The user may speak in English, Spanish, or Simplified Chinese (Mandarin). Detect the language from the transcript automatically (e.g. Chinese characters => zh, Spanish words like hoy/ayer/efectivo => es, else en). Interpret the command correctly in any of these languages. Output the same JSON schema. Set "language_detected" to "en" | "es" | "zh". When you need to ask a follow-up (followup_question), respond in the SAME language the user spoke (e.g. if they spoke Spanish, ask the follow-up in Spanish).

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
2) Identify the student(s) referenced. Support multiple names in one sentence (see Multi-student connectors below).
3) Identify the action: mark attended/not attended/cancel/reschedule and log payment details if provided.
4) Create one action per student per date.
5) If user says "all students" or "everyone" (or equivalent in ES/ZH), apply to every lesson on the referenced date(s).
6) If a command is ambiguous, ask ONE concise follow-up question in the USER'S language.

Student name matching rules:
- Match using roster.full_name and roster.aliases.
- Accept partial names and common speech recognition misspellings.
- If multiple close matches exist, ask a follow-up with the top 3 options (in the user's language).
- Multi-student connectors: split on "and", "y", "和", "、", "跟", "还有" and create one action per named student.
  Examples: "Sarah and Tiffany" / "Leo y Emma" / "Leo和Emma今天来上课" => two actions.

Date understanding rules (all languages):
- English: "today", "yesterday", "tomorrow", "last Tuesday", "this Wednesday", "next Friday", "two weeks ago".
- Spanish: "hoy" = today, "ayer" = yesterday, "mañana" = tomorrow, "el martes pasado" = last Tuesday, "este miércoles" = this Wednesday, "el viernes pasado" = last Friday.
- Chinese: "今天" = today, "昨天" = yesterday, "明天" = tomorrow, "上周一/二/三/四/五/六/日" = last Mon-Sun, "下周二" = next Tuesday, "这周三" = this Wednesday.
- Resolve relative dates using today_date and timezone.
- If user says a weekday without qualifier, interpret as the most recent past occurrence (unless "next" / "próximo" / "下").
- If the app provides schedule data, prefer matching within dates where lessons exist.

Attendance phrases mapping (all languages):
- attended (EN): "came", "showed up", "was here", "attended", "made it", "present"
- attended (ES): "vino", "vinieron", "asistió", "asistieron", "llegó", "estuvo", "todos vinieron"
- attended (ZH): "来了", "来上课", "到了", "都来了"
- not attended (EN): "didn't come", "no show", "missed", "absent"
- not attended (ES): "no vino", "no asistió", "ausente", "faltó", "no llegó"
- not attended (ZH): "没来", "缺席", "没有来", "缺课"
- cancelled: "cancelled", "canceled", "cancel", "canceló", "取消"
- rescheduled: "moved to", "rescheduled to", "reschedule", "reprogramar", "改期"

Payment extraction rules:
- Amounts: "$80", "80 dollars", "eighty", "80 dólares", "80块", "80元".
- Method words:
  - cash (EN); efectivo (ES); 现金 (ZH).
  - venmo, zelle, check, card: same in all (or leave as-is if transcribed).
- If payment mentioned without amount, set payment_amount = null; ask follow-up only if required.
- If amount given but no method, set payment_method = "other".

Bulk commands (all languages):
- EN: "All students came today", "Everyone attended"
- ES: "Todos los estudiantes vinieron hoy", "Todos asistieron hoy", "Marcar que Leo y Emma vinieron hoy"
- ZH: "所有学生今天都来了", "所有人来了", "Leo和Emma今天来上课"
=> Create one action per scheduled lesson (or per named student if names given) on the resolved date.

Follow-up rule:
- Ask a follow-up ONLY when you cannot safely execute.
- Respond in the SAME language as the user (followup_question and followup_choices in user's language).
- Examples: ambiguous name => "Which Chris?" / "¿Cuál Chris?" / "哪个Chris？"

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
- Never create or delete students. Never hallucinate lessons.
- For bulk operations, output multiple actions (one per affected lesson).
- Keep follow-up question short and in the user's language.

EXAMPLES

1) Multiple students + today (EN)
User: "Sarah and Tiffany came to their lesson today"
→ actions: two UPDATE_LESSON entries for today_date, each set_status="attended"

2) Spanish: payment + today
User: "Marca que Leo asistió hoy y pagó 80 en efectivo"
→ language_detected: "es", actions: one UPDATE_LESSON for Leo, date=today_date, set_status="attended", payment.amount=80, payment.method="cash"

3) Spanish: multiple students
User: "Leo y Emma vinieron hoy"
→ actions: two UPDATE_LESSON entries for today_date (Leo, Emma), each set_status="attended"

4) Spanish: bulk
User: "Todos los estudiantes vinieron hoy"
→ actions: one per scheduled lesson on today_date, set_status="attended"

5) Chinese: mark attended + payment
User: "标记Leo今天来了，付了80现金"
→ language_detected: "zh", actions: one UPDATE_LESSON for Leo, set_status="attended", payment.amount=80, payment.method="cash"

6) Chinese: multiple students
User: "Leo和Emma今天来上课"
→ actions: two UPDATE_LESSON entries for today_date, set_status="attended"

7) Chinese: last Tuesday
User: "上周二Jason来了"
→ resolve last Tuesday from today_date; one UPDATE_LESSON for Jason on that date, set_status="attended"

8) Relative date (EN)
User: "Last Tuesday, Jason came to his lesson"
→ resolve last Tuesday; set_status="attended" for Jason on that date

9) Absence (EN)
User: "Jason no-showed yesterday"
→ set_status="not_attended" for Jason on yesterday's date

10) Ambiguous name -> follow-up (respond in user language)
User: "Mark Chris attended today" → followup_question in English
User: "Marcar Chris asistió hoy" → followup_question in Spanish
User: "标记Chris今天来了" → followup_question in Chinese`;

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
