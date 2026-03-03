# CRITICAL DATABASE REPAIR — Full Report

## Summary

Stripe payment system has been inspected and repaired so that:
- **stripe_payments** is created with the required structure when missing
- **users.balance** and **users.total_deposits** are ensured
- **Webhook** inserts into **stripe_payments** and updates **users.balance** (and **total_deposits**)
- Deposits flow is: **Stripe webhook → stripe_payments → deposits → users.balance / total_deposits → transactions → dashboard**

---

## 1. Tables fixed / ensured

| Table | Status | Action |
|-------|--------|--------|
| **public.users** | Fixed | `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for `balance`, `total_deposits`, `updated_at`, `email`, `role` |
| **public.stripe_payments** | Fixed | `CREATE TABLE IF NOT EXISTS` with exact structure: `id`, `user_id`, `email`, `amount`, `currency`, `product_type`, `stripe_session_id` UNIQUE, `stripe_payment_intent`, `status`, `created_at`. RLS policy for service role. |
| **public.transactions** | Fixed | `CREATE TABLE IF NOT EXISTS` + columns `status`, `description`, `reference_id` + type check including `deposit` |
| **public.deposits** | Fixed | `CREATE TABLE IF NOT EXISTS` + `stripe_session` + RLS for service role |
| **increment_user_balance** | Fixed | `CREATE OR REPLACE FUNCTION` so webhook can credit `users.balance` |

**New migration file:** `supabase/migrations/20250249000000_critical_repair_stripe_payments.sql`

---

## 2. Columns added

- **users:** `balance numeric DEFAULT 0`, `total_deposits numeric DEFAULT 0`, `updated_at`, `email`, `role` (all `ADD COLUMN IF NOT EXISTS`)
- **stripe_payments (when table exists from older migration):** `user_id`, `email`, `amount`, `currency`, `product_type`, `stripe_session_id`, `stripe_payment_intent`, `status` (all `ADD COLUMN IF NOT EXISTS`)
- **transactions:** `status`, `description`, `reference_id`
- **deposits:** `stripe_session`

---

## 3. Errors fixed

- **Webhook did not insert into stripe_payments** — Fixed: webhook now inserts into `stripe_payments` first (repair schema: `amount`, `stripe_payment_intent`). On column error `42703`, falls back to legacy schema (`amount_cents`, `stripe_payment_intent_id`, `transaction_id`).
- **Duplicate stripe_session_id** — Handled: on unique violation `23505`, webhook logs and continues (idempotent).
- **users.balance not updated** — Already updated via `increment_user_balance` RPC; fallback direct `UPDATE users SET balance = ...` on RPC failure. Confirmed in place.
- **users.total_deposits not updated** — Fixed: webhook now reads `total_deposits`, adds `amount_total`, and updates `users.total_deposits`.
- **stripe_payments missing** — Repair migration creates table with exact structure when it does not exist; when it exists, adds any missing columns.

---

## 4. Webhook flow verified

**Route:** `/api/webhooks/stripe` (POST)

1. Verify Stripe signature with `STRIPE_WEBHOOK_SECRET`.
2. On `checkout.session.completed` and `payment_status === "paid"`:
   - Resolve user by email (profiles → users) or `metadata.user_id` / `client_reference_id`.
   - Skip if deposit already exists for `stripe_session`.
3. **Insert into stripe_payments:** `user_id`, `email`, `amount` (dollars), `currency`, `product_type`, `stripe_session_id`, `stripe_payment_intent`, `status`. On unknown column, retry with legacy columns (`amount_cents`, `stripe_payment_intent_id`, `transaction_id`).
4. **Insert into deposits:** `user_id`, `amount` (dollars), `stripe_session`, `status`.
5. **Update profiles.balance** (if profiles row exists).
6. **Insert into transactions:** `user_id`, `type: "deposit"`, `amount` (cents), `status`, `description`, `reference_id`.
7. **Update users.balance:** via `increment_user_balance(p_user_id, amount_total)` or direct `UPDATE users SET balance = balance + amount_total`.
8. **Update users.total_deposits:** read current, add `amount_total`, update.
9. Return `200 OK`.

**Dashboard:** Admin stats use `getPlatformTotals()` (sum of `transactions` where `type = 'deposit'`) and/or `deposits`; both are written by the webhook.

---

## 5. How to apply (production)

Run the repair migration in **Supabase Dashboard → SQL Editor**:

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**.
2. Copy the full contents of:
   - **First (critical repair):** `supabase/migrations/20250249000000_critical_repair_stripe_payments.sql`
   - **Then (full schema):** `supabase/migrations/20250248000000_payment_tables_and_columns.sql`  
   Or run **only** the critical repair file if you only need `users`, `stripe_payments`, `transactions`, `deposits`, and `increment_user_balance`.
3. Paste into the SQL Editor and click **Run**.

Both migrations are idempotent; safe to run multiple times.

---

## 6. Confirmation: production ready

- **Tables:** `users`, `stripe_payments`, `transactions`, `deposits` are created or altered so required columns exist.
- **Columns:** `users.balance`, `users.total_deposits`; `stripe_payments` with the exact structure you specified (and legacy-compatible fallback in code).
- **Webhook:** Inserts into `stripe_payments`, updates `users.balance` and `users.total_deposits`, writes `deposits` and `transactions`.
- **Flow:** Stripe webhook → stripe_payments → users.balance / total_deposits → deposits / transactions → dashboard.
- **Env:** Ensure `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` are set in Vercel (or your host).

After running the repair migration and redeploying, Stripe deposits will persist correctly and user balances will update for the dashboard.
