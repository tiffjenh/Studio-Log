#!/usr/bin/env bash
# One-time: link this repo to your Supabase project and push migrations.
# Requires: npx supabase login (once) and two env vars below.
#
# 1. Get your Project Ref: Supabase Dashboard → your project → URL is
#    https://supabase.com/dashboard/project/<PROJECT_REF>
# 2. Get your DB password: Project Settings → Database → (reset if needed)
# 3. Run (paste your values):
#    SUPABASE_PROJECT_REF=your_project_ref SUPABASE_DB_PASSWORD=your_db_password ./scripts/supabase-link-and-push.sh
#
# Or export them first:
#    export SUPABASE_PROJECT_REF=your_project_ref
#    export SUPABASE_DB_PASSWORD=your_db_password
#    ./scripts/supabase-link-and-push.sh

set -e
cd "$(dirname "$0")/.."

if [ -z "$SUPABASE_PROJECT_REF" ] || [ -z "$SUPABASE_DB_PASSWORD" ]; then
  echo "Set SUPABASE_PROJECT_REF and SUPABASE_DB_PASSWORD (see script header)."
  echo "Example: SUPABASE_PROJECT_REF=abcdefgh SUPABASE_DB_PASSWORD=secret ./scripts/supabase-link-and-push.sh"
  exit 1
fi

echo "Linking to project $SUPABASE_PROJECT_REF..."
npx supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"

echo "Pushing migrations..."
npx supabase db push

echo "Done. Future migrations: npm run db:push"
