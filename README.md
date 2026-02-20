# Wweekly (Web)

Mobile- and iPad-friendly website for tracking lessons and earnings for piano teachers. Built from the Studio Log PRD.

## Features

- **Login / Create account / Forgot password** – Local auth, or Supabase when configured
- **Dashboard** – Earned vs potential this week, today’s lessons with completion toggles
- **Students** – Roster with search and day filter, student detail, add student
- **Earnings** – Weekly / Monthly / Daily / By-student views with bar chart and summaries
- **Calendar** – Date picker and daily schedule with lesson toggles
- **Edit lesson** – Duration, note, location, save
- **Settings** – Edit name, email, phone; log out

Data is stored in the browser (localStorage) by default. With Supabase configured, auth and data sync to the cloud so the same account and data are shared across browsers and devices.

### Optional: Supabase backend (shared data)

**Step-by-step guide:** see **[SETUP-SUPABASE.md](./SETUP-SUPABASE.md)**.

Quick version:
1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run the migration: copy the contents of `supabase/migrations/001_initial.sql` and execute it.
3. In Project Settings → API, copy the **Project URL** and **anon public** key.
4. In this repo, copy `.env.example` to `.env` and set:
   - `VITE_SUPABASE_URL=` your project URL  
   - `VITE_SUPABASE_ANON_KEY=` your anon key
5. Restart the dev server (`npm run dev`). Sign up and login will use Supabase; students and lessons will sync.

For quicker testing you can turn off **Email confirmation** in Supabase: Authentication → Providers → Email.

## Run locally

```bash
cd studio-log-web
npm install
npm run dev
```

Open the URL shown (e.g. http://localhost:5174) in your browser or on your phone/iPad on the same network.

**Cursor Simple Browser:** The built-in browser often caches aggressively, so reschedule/date changes may not work. Use one of these:

1. **Preferred:** In the Simple Browser tab, use the **⋮** menu → **Open in External Browser** so the app opens in Chrome/Safari with the same URL. Test there; it will load the latest code.
2. In dev, a small “loaded HH:MM:SS” appears at bottom-right. After you refresh, that time should update. If it doesn’t change, the browser is serving cached code — use the external browser.
3. Restart the dev server (`npm run dev`), then open http://localhost:5174 in Chrome (or external browser) and test there.

## Build for production

```bash
npm run build
npm run preview
```

Output is in `dist/`. Deploy that folder to any static host (Vercel, Netlify, GitHub Pages, etc.).

## Voice Commands Supported

Homepage/dashboard voice uses a strict command pipeline: parse -> validate -> execute by `lesson_id` -> DB read-back verify.

### Supported intents
- **Attendance (single/multi/all):**
  - "Chloe came today"
  - "Chloe and Leo came today"
  - "All students attended today"
  - "Unmark Chloe and Leo"
- **Lesson edits on a date (single occurrence):**
  - "Make Chloe 45 minutes today"
  - "Change Leo's lesson time to 3pm"
  - "Move Leo from Friday Feb 18 to Sunday Feb 20 at 5pm for 1 hour"
- **Lesson amount/rate for one date:**
  - "Set Chloe rate to 60 per hour"
  - "Leo's class is now $100" (per-lesson amount for selected date)
- **Duration:** "Change Ava's lesson to an hour and a half", "Change Emma's lesson to two hours"

### Safety and clarification behavior
- If a name is ambiguous (e.g. two Emmas), voice asks a clarifying question and stores a pending command.
- Choosing a clarification candidate now resumes the original command and auto-applies it to the selected student.
- If a student has no lesson on the target date, voice asks for clarification instead of guessing.
- If command meaning is unclear (example: "Nobody came today"), voice asks confirmation wording.
- The UI only reports success after post-execution verification passes.

### Current limitations
- Recurring/going-forward voice edits (for example "raise rate going forward") are not auto-applied yet.
- Voice updates only existing lesson rows and does not create new recurring rows silently.

## How We Guarantee Insight Correctness

Insights now uses a SQL-first pipeline with verification:

1. **Normalize + route**: deterministic rules detect intent, entities, and date range first.
2. **Truth query execution**: canonical SQL truth-query definitions are mapped to deterministic metric execution against Supabase-scoped data (`user_id` filtered).
3. **Response generation**: answers are templated from computed truth values only (no free-form numeric generation).
4. **Verification gate**: low-confidence or ambiguous results trigger clarification instead of a guessed/default answer.
5. **Regression tests**: a 60-question paraphrase matrix validates routing and blocks irrelevant default outputs.

Debug mode:
- Open dev tools and run `localStorage.setItem("insights_debug", "1")`, then refresh.
- The Insights pipeline prints query, intent, extracted params, selected truth query, and summary result.
- You can also enable debug from URL with `?debug=1` for the Insights debug details panel.

## Voice + Insights test commands

- Run all tests: `npm test`
- Run voice pipeline tests only: `npx vitest run src/lib/voice/__tests__/homeVoicePipeline.test.ts`
- Run insights regressions only:
  - `npx vitest run src/lib/insights/__tests__/pipeline.test.ts`
  - `npx vitest run src/lib/insights/__tests__/cannedQuestionsHarness.test.ts`
- Build check: `npm run build`

## Developer notes

### Voice disambiguation (pending command)

When the parser detects an ambiguous student name (e.g. two "Leo"s), it returns `needs_clarification` with a **pending command** object (stored in the Voice UI). The object holds the original transcript, intent, resolved date/time/duration, and the list of candidate students. When the user taps a candidate (e.g. "Leo Garcia"), the app calls `resumePendingVoiceCommand(pending, { studentId })`, which re-runs the pipeline with a forced student resolution so the original action (set time, set duration, move, etc.) is applied to the chosen student. "Applied: …" is shown only after that execution succeeds.

### Adding new Insights intents

1. Add the intent to `src/lib/insights/schema.ts` (`insightIntentEnum`).
2. In `src/lib/insights/parse.ts`, add routing in `routeIntent()` (synonym patterns) and set `deriveTruthKey()` and default date range in `parseToQueryPlan` if needed.
3. In `src/lib/insights/truthQueries.ts`, implement the handler for the new `sql_truth_query_key` and return the expected output shape.
4. In `src/lib/insights/formatAnswer.ts` and `respond.ts`, add a formatter and route the intent to it.
5. In `src/lib/insights/pipeline.ts`, map any router/LLM intent name to the new intent in `mapRouterIntentToPlanIntent` and include new metric outputs in `hasValidMetric` if relevant.
6. Add tests in `src/lib/insights/__tests__/parse.paraphrase.test.ts` and `pipeline.test.ts` for the new question phrasings and expected outputs.

### Enabling debug logs

- **Voice:** In dev, open the voice panel and enable the "Debug" checkbox; or add `?voiceDebug=1` or `?debug=1` to the URL. The pipeline logs parsed intent, resolved date, student resolution, and plan to the console.
- **Insights:** Set `localStorage.setItem("insights_debug", "1")` and refresh; or use `?debug=1`. The pipeline logs query, intent, date range, truth query key, and result summary. The Insights UI also shows a "View details" accordion per answer when debug is on.
