# Supabase CLI – link project and push migrations

Once the CLI is installed and linked to your Supabase project, you (or Cursor) can run migrations from the terminal so schema updates apply automatically instead of copying SQL into the Dashboard.

## 1. Install the CLI

**Option A – project-only (recommended)**  
From the project root:

```bash
npm install supabase --save-dev
```

Then use `npx supabase` for all commands below (or add the scripts in package.json and use `npm run db:push`, etc.).

**Option B – global (Homebrew on macOS)**

```bash
brew install supabase/tap/supabase
```

Then you can run `supabase` directly.

## 2. Log in to Supabase

```bash
npx supabase login
```

This opens a browser to get an access token. If you used global install, run `supabase login` instead.

## 3. Link this repo to your remote project

You need your **Project ID** (project ref) and **database password**:

- **Project ref:** Open [Supabase Dashboard](https://supabase.com/dashboard) → your project. The URL is `https://supabase.com/dashboard/project/<project-id>` — that last part is your Project ID.
- **Database password:** Project Settings → Database (reset if you don’t remember it).

**Option A – one command (no prompts)**  
From the project root:

```bash
SUPABASE_PROJECT_REF=your_project_ref SUPABASE_DB_PASSWORD=your_db_password ./scripts/supabase-link-and-push.sh
```

Replace `your_project_ref` and `your_db_password`. This links the project and runs `db push` so all pending migrations (including `006_rename_lessons_date_to_lesson_date.sql`) are applied. **Migration 006 is required** for rescheduling lessons to work: it renames the reserved column `date` to `lesson_date` so Supabase/PostgREST accept updates.

**Option B – interactive**

```bash
npx supabase link --project-ref YOUR_PROJECT_ID
```

When prompted, enter your database password. Then run `npm run db:push`.

After this, the project is linked: the CLI stores the link in `supabase/.temp/project-ref` (or similar) so future commands use this project.

## 4. Apply migrations to the remote database

From the project root:

```bash
npx supabase db push
```

This applies any new migrations in `supabase/migrations/` that haven’t been applied yet (including `005_add_lesson_time_of_day.sql`).

To see what’s applied:

```bash
npx supabase migration list
```

## Using this from Cursor

- Cursor’s terminal is a normal shell in your project. There is no separate “link Supabase to Cursor” step.
- After you’ve run **login** and **link** once on this machine, anyone (including the AI) can run from the same repo:
  - `npx supabase db push` to apply new migrations
  - `npx supabase migration list` to see status
- So: **you** do the one-time install + login + link; after that, **updates can be made automatically** by running `npx supabase db push` whenever there are new migration files.

## Optional: npm scripts

Add to `package.json` under `"scripts"`:

```json
"db:push": "supabase db push",
"db:migration-list": "supabase migration list"
```

Then you can run:

- `npm run db:push` – apply pending migrations
- `npm run db:migration-list` – list migration status

Use `npx supabase` in the script if the CLI is only installed as a devDependency:

```json
"db:push": "npx supabase db push",
"db:migration-list": "npx supabase migration list"
```

## Troubleshooting

- **“supabase: command not found”**  
  Use `npx supabase` (or install globally with Homebrew).

- **“Project not linked”**  
  Run `npx supabase link --project-ref YOUR_PROJECT_ID` again and enter the database password.

- **“Permission denied” on push**  
  Ensure the database password you use for `link` is correct (Project Settings → Database → Reset password if needed).

- **Migrations already applied**  
  If you previously ran the SQL for `005_add_lesson_time_of_day.sql` in the Dashboard, the migration may already be recorded. Use `supabase migration list` to confirm; if the migration is listed as applied, you’re done.
