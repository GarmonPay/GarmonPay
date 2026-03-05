# Production audit report — GarmonPay

**Date:** 2025-03-03  
**Scope:** Full codebase audit, Stripe payments, webhooks, recovery, dashboards, database, production readiness.

---

## 1. Fixes made

### Stripe & webhooks
- **Webhook signature:** Raw body is read with `req.arrayBuffer()` and `Buffer.from(arrayBuffer)` so the exact bytes are passed to `stripe.webhooks.constructEvent` (no re-encoding).
- **Webhook secret:** `STRIPE_WEBHOOK_SECRET` is trimmed and stripped of surrounding quotes/newlines.
- **Webhook events:** Handlers added for:
  - `checkout.session.completed` — primary path; duplicate check by `stripe_payments.stripe_session_id` before crediting.
  - `payment_intent.succeeded` — fallback for direct PaymentIntents; duplicate check by `transactions.reference_id` and `stripe_payments.stripe_payment_intent_id`.
  - `payment_intent.payment_failed` — logged (event id, payment intent id, amount, last error); no DB write.
- **Duplicate prevention:** For checkout: check `stripe_payments` for existing `stripe_session_id` before updating balance/transactions/deposits/stripe_payments. For payment_intent.succeeded: check transactions and stripe_payments by payment intent id.
- **Logging:** Webhook logs include `eventId` where relevant; errors are logged with clear messages.
- **Stripe key:** `STRIPE_SECRET_KEY` is normalized in `src/lib/stripe-server.ts` (trim, strip quotes, first line only) and used only server-side; `isStripeConfigured()` checks for `sk_` prefix.

### Payment recovery
- **Canonical recovery:** `POST /api/admin/recover-stripe-payments` is the single recovery endpoint: lists paid checkout sessions, finds user by metadata then email, credits `users.balance` and `users.total_deposits`, inserts into `stripe_payments`, `transactions` (with `source: stripe_recovery` when column exists), `deposits`, and returns `{ recovered, totalAmountCents, totalAmountDollars }`.
- **Deprecated route:** `POST /api/admin/recover-payments` now returns `410 Gone` with message to use `/api/admin/recover-stripe-payments` (old route used `recovered_stripe_sessions` and had balance-in-dollars vs cents issues).
- **Script:** `scripts/recover-payments.cjs` performs full recovery using Stripe + Supabase from `.env.local`; run with `node --env-file=.env.local scripts/recover-payments.cjs`.

### Dashboards
- **Members dashboard:** 
  - `GET /api/dashboard` now returns `totalDepositsCents` from `getTotalsForUser`.
  - Dashboard Summary shows **Total deposits**, Total earned, Total withdrawn; balance continues to prefer Supabase `users.balance` with fallback to API.
- **Admin dashboard:** 
  - New **Stripe payment logs** section: `GET /api/admin/stripe-payments` returns last 100 Stripe payments; admin UI shows Date, Email, Status, Amount.
  - Stats (total users, deposits, withdrawals, balance, profit, revenue) and Recent Transactions unchanged; `load()` preserves `recentPayments` when refreshing stats.

### Database
- **Index:** Migration `20250252000000_transactions_reference_id_index.sql` adds `transactions_reference_id_type` index on `(reference_id, type)` for webhook/recovery duplicate checks.

### Cleanup & routes
- **Duplicate webhook path:** `/api/webhooks/stripe` forwards to `/api/stripe/webhook` (canonical); both remain for compatibility.
- **Recovery:** Single recovery endpoint; old recover-payments logic removed and replaced with 410 response.

---

## 2. Environment variables (production / Vercel)

| Variable | Required | Notes |
|----------|----------|--------|
| `STRIPE_SECRET_KEY` | Yes | Server only; must start with `sk_live_` in production. |
| `STRIPE_WEBHOOK_SECRET` | Yes | From Stripe Dashboard → Webhooks → endpoint signing secret (`whsec_...`). |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server only; for admin and webhooks. |
| `NEXT_PUBLIC_SITE_URL` | Recommended | e.g. `https://garmonpay.com` for redirects. |
| `ADMIN_SETUP_SECRET` | Production | For one-time admin setup if used. |

- **Stripe webhook URL in Dashboard:** `https://garmonpay.com/api/stripe/webhook` (not a file path).
- **No client-side Stripe secrets:** Only `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; used only in API routes and `src/lib/stripe-server.ts`.

---

## 3. Remaining risks & recommendations

- **Stripe keys:** Ensure production uses live keys (`sk_live_`, `whsec_` for live endpoint). Test mode keys are for development only.
- **Webhook endpoint:** In Stripe Dashboard, confirm the webhook endpoint URL is exactly `https://garmonpay.com/api/stripe/webhook` and that you use that endpoint’s signing secret in Vercel.
- **Idempotency:** Webhook and recovery are idempotent by `stripe_session_id` / `reference_id` / `stripe_payment_intent_id`; replay of the same event does not double-credit.
- **Build-time Supabase:** Static generation may call Supabase; ENOTFOUND during build is expected if the build environment cannot reach Supabase. Pages that need data are dynamic or fetch at runtime.
- **Run recovery once:** After deploy, run recovery once (API or script) to backfill any missing payments; re-runs skip already-processed sessions.

---

## 4. Deploy commands

```bash
# 1. Ensure env is set (Vercel: Project → Settings → Environment Variables)
#    STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_SUPABASE_URL,
#    SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL=https://garmonpay.com

# 2. Run migrations (if using Supabase CLI)
npx supabase db push

# 3. Build and deploy (Vercel)
npm run build
vercel --prod
# Or push to main if Vercel is connected to GitHub:
git add -A
git commit -m "Production audit: Stripe webhook, recovery, dashboards"
git push origin main

# 4. In Stripe Dashboard → Developers → Webhooks:
#    Add endpoint URL: https://garmonpay.com/api/stripe/webhook
#    Events: checkout.session.completed, payment_intent.succeeded, payment_intent.payment_failed
#    Copy signing secret into Vercel as STRIPE_WEBHOOK_SECRET

# 5. (Optional) One-time payment recovery as admin
curl -X POST https://garmonpay.com/api/admin/recover-stripe-payments \
  -H "Cookie: <admin-session-cookie>" \
  # Or run locally with admin auth:
  node --env-file=.env.local scripts/recover-payments.cjs
```

---

## 5. Test checklist (manual)

- [ ] **Stripe test payment:** Create checkout session → pay with test card → confirm webhook returns 200 and balance/transactions update.
- [ ] **Webhook verification:** Send event with wrong signature → expect 400.
- [ ] **Members dashboard:** Log in → confirm Available balance, Total deposits, Total earned, Total withdrawn, Transaction history.
- [ ] **Admin dashboard:** Log in as admin → confirm Total revenue, Total deposits, Recent Transactions, Stripe payment logs.
- [ ] **Recovery:** Call `POST /api/admin/recover-stripe-payments` (or run script) → confirm response and that no duplicate credits occur on second run.
- [ ] **HTTPS:** Production site and webhook URL use HTTPS; middleware redirects HTTP to HTTPS in production.
