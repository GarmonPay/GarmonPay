#!/usr/bin/env bash
# Run all Supabase migrations in order.
# Option 1 (recommended): link project then run:
#   npx supabase link
#   npx supabase db push
#
# Option 2: if you have Supabase CLI and project linked:
#   supabase db push
#
# Option 3: with direct DB URL (e.g. from Supabase Dashboard > Settings > Database):
#   export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
#   for f in supabase/migrations/*.sql; do echo "Applying $f"; psql "$DATABASE_URL" -f "$f" || exit 1; done

set -e
if [ -n "$DATABASE_URL" ]; then
  echo "Using DATABASE_URL to apply migrations in order..."
  for f in $(ls supabase/migrations/*.sql 2>/dev/null | sort); do
    [ -f "$f" ] || continue
    echo "Applying $f"
    psql "$DATABASE_URL" -f "$f" || exit 1
  done
  echo "Done."
else
  echo "DATABASE_URL not set. Use: npx supabase link && npx supabase db push"
  echo "Or set DATABASE_URL and run this script again."
  exit 1
fi
