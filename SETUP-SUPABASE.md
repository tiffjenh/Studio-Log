# Supabase setup (5 minutes)

The app already has Supabase built in. To sync students and lessons across Chrome, Cursor, and other devices, do this once:

## 1. Create a Supabase project

1. Go to **[supabase.com](https://supabase.com)** and sign in (or create a free account).
2. Click **New project**.
3. Pick an organization (or create one), name the project (e.g. `studio-log`), set a database password (save it somewhere), choose a region, then click **Create new project**.
4. Wait until the project is ready (green checkmark).

## 2. Run the database migration

1. In the left sidebar, open **SQL Editor**.
2. Click **New query**.
3. Open this file in your project: **`supabase/migrations/001_initial.sql`**.
4. Copy its **entire contents** and paste into the Supabase SQL Editor.
5. Click **Run** (or press Cmd+Enter). You should see “Success. No rows returned.”

## 3. Get your API keys

1. In the left sidebar, go to **Project Settings** (gear icon).
2. Click **API** in the left menu.
3. You’ll see:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`)
   - **Project API keys** → **anon** **public** (long string starting with `eyJ...`)

## 4. Add keys to the app

1. In the **studio-log-web** folder, copy the example env file:
   ```bash
   cp .env.example .env
   ```
2. Open **`.env`** in your editor and set:
   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...your_anon_key_here...
   ```
   Paste your real **Project URL** and **anon public** key (no quotes).

3. Restart the dev server: stop it (Ctrl+C), then run:
   ```bash
   npm run dev
   ```

## 5. Optional: skip email confirmation (for testing)

So you can log in right after signup without checking email:

1. In Supabase, go to **Authentication** → **Providers** → **Email**.
2. Turn **off** “Confirm email”.
3. Save.

---

## Troubleshooting: "new row violates row-level security policy"

The app isn't sending a valid login session. Try: **Log out** (Settings → Log out), then **sign in again** with your email and password. Also ensure "Confirm email" is turned off in Supabase (step 5) if you're testing.

---

After this, **sign up** once in the app (e.g. in Chrome). Then **log in with the same email and password** in Cursor (or any other browser). Your students and lessons will be the same everywhere.
