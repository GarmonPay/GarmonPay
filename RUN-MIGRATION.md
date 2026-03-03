# Run payment migration and redeploy

## 1. Apply migration to production Supabase

The project is **not linked** to Supabase CLI, so apply the migration manually:

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**.
2. Copy the entire contents of:
   ```
   supabase/migrations/20250248000000_payment_tables_and_columns.sql
   ```
3. Paste into the SQL Editor and click **Run**.

This ensures **all** of the following (creates tables if missing, adds columns if missing):

- **users**: id, email, role, balance, total_deposits, created_at, updated_at, stripe_account_id
- **profiles**: balance (if table exists)
- **deposits**: id, user_id, amount, status, stripe_session, stripe_session_id, created_at + RLS
- **transactions**: id, user_id, type, amount, status, description, reference_id, source, created_at + type check + RLS
- **stripe_payments**: full table + wallet_fund, stripe_session_id, indexes, RLS
- **withdrawals**: id, user_id, amount, status, platform_fee, created_at
- **platform_revenue**: id, amount, source, created_at + RLS
- **profit**: id, amount, source, created_at + RLS
- **recovered_stripe_sessions**: session_id PK, user_id, amount, created_at
- **stripe_subscriptions**: full table + RLS
- **increment_user_balance** function

Idempotent: safe to run multiple times.

The migration is **idempotent** and skips ALTERs when the target table doesn’t exist (e.g. `transactions`, `stripe_payments`, `withdrawals`), so it’s safe to run even if some tables were created by other migrations.

## 2. Redeploy Vercel

After the migration succeeds:

- **Option A:** In terminal (after `vercel login` if needed):
  ```bash
  npx vercel --prod
  ```
- **Option B:** In [Vercel Dashboard](https://vercel.com/dashboard) → your project → **Deployments** → **Redeploy** on the latest deployment.

---

**Optional (for future migrations):** Link Supabase and push from CLI:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Use the database password when prompted (or set `SUPABASE_DB_PASSWORD`).
