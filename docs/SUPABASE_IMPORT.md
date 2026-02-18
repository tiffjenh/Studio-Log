# Student import and Supabase row limits

If **only some students appear** after a CSV import (e.g. 10–13 out of 15, or 12 out of 50), your Supabase project is likely using a **low PostgREST row limit**. The app works around this as much as possible, but for 50–200+ students you should raise the limit in Supabase.

## What’s going on

PostgREST (used by Supabase) has a **`db-max-rows`** setting that caps how many rows can be returned or affected per request. If this is set to a small value (e.g. 10 or 12), you will only see that many students even when more exist in the database.

- **Fetch:** The app now pages by advancing using the number of rows actually returned, so you can still get all students over multiple requests.
- **Insert:** The app inserts **one student per request** (same as “Add student”) so each insert is a single row and not blocked by multi-row limits.

If you still see fewer students than you imported, the limit is likely on the **Supabase project** and should be increased.

## How to fix it in Supabase

1. Open your **Supabase Dashboard** and select your project.
2. Go to **SQL Editor**.
3. Run **both** of these (database-level applies to all connections; then reload PostgREST):

```sql
-- 1) Set the row limit at database level (applies to API connections).
ALTER DATABASE postgres SET "pgrst.db_max_rows" = '2000';

-- 2) Reload PostgREST so it picks up the new setting.
NOTIFY pgrst, 'reload config';
```

If you get **"permission denied to set parameter pgrst.db_max_rows"**:

- The SQL Editor role doesn’t have permission to change this. Options:
  1. **Contact Supabase support** (Dashboard → Support) and ask them to set `pgrst.db_max_rows` to `2000` for your project.
  2. **Use the Supabase CLI** as project owner: some config can be applied via CLI with the right privileges.
  3. **Rely on the app’s paging:** the app already requests the next page using the number of rows actually returned, so you can still get all students (e.g. 14 in the first request, then 1 in the next) even with a low limit. If you still see only 14, check the import result for any row error (e.g. “Row 15: …”); that would mean the 15th insert failed, not the fetch.

If the ALTER works but you’re not sure PostgREST reloaded, also run the role-level setting and reload:

```sql
ALTER ROLE "postgres" SET "pgrst.db_max_rows" = '2000';
NOTIFY pgrst, 'reload config';
```

4. Wait a few seconds, then try your student import again.

To confirm the setting (run in SQL Editor):

```sql
SHOW pgrst.db_max_rows;
-- Or: SELECT rolname, rolconfig FROM pg_roles WHERE rolname = 'postgres';
```

## After increasing the limit

- **Student list:** Will load all students in fewer requests.
- **CSV import:** Will still insert one student per request for reliability; with a higher `db_max_rows`, the refetch after import will return everyone in one or two requests.

For very large imports (200–300+ students), the app shows progress (“Importing students… X of Y”) and continues even if some rows fail; the final count reflects how many were actually saved.
