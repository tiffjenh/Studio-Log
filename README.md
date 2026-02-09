# Studio Log (Web)

Mobile- and iPad-friendly website for the Studio Log / Mom Piano app. Tracks lessons and earnings for piano teachers. Built from the [Studio Log PRD](../Studio%20Log%20PRD.md).

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

Open the URL shown (e.g. http://localhost:5173) in your browser or on your phone/iPad on the same network.

## Build for production

```bash
npm run build
npm run preview
```

Output is in `dist/`. Deploy that folder to any static host (Vercel, Netlify, GitHub Pages, etc.).
