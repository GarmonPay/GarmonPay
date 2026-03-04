# GarmonPay production deployment

**Live site:** https://garmonpay.com

## Environment (Vercel)

- `NEXT_PUBLIC_SITE_URL` = `https://garmonpay.com`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

## Stripe webhook

- **URL:** `https://garmonpay.com/api/stripe/webhook`
- In Stripe Dashboard → Developers → Webhooks: add endpoint with this URL.
- Events: `checkout.session.completed` (and any subscription/connect events you use).
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## Database (Supabase)

Run migrations so all payment tables exist:

```bash
supabase db push
```

Or run `supabase/migrations/20250250000000_production_stripe_tables.sql` in the SQL Editor.

Required tables: `public.users`, `public.transactions`, `public.deposits`, `public.stripe_payments`.  
Balance is stored in **cents** in `users.balance`; the webhook credits it via `increment_user_balance`.

## Test webhook (optional)

```bash
npm run test:webhook
# Or against production (use a test user and staging DB):
TEST_USER_ID=<uuid> TEST_EMAIL=you@example.com node --env-file=.env.local scripts/simulate-stripe-webhook.mjs https://garmonpay.com/api/stripe/webhook
```

## Build

```bash
npm run build
```

No localhost references; all URLs use `NEXT_PUBLIC_SITE_URL` or `https://garmonpay.com`.
