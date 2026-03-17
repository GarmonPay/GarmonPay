# Launch checklist — GarmonPay

Use this before going live so the site is production-ready.

## 1. Environment variables

Copy `.env.example` to `.env.local` (or set in Vercel/hosting). **Required:**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase (API, fight server) |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `ADMIN_SETUP_SECRET` | One-time admin setup (production only) |

**Recommended for production:**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SITE_URL` | e.g. `https://garmonpay.com` (redirects, links) |
| `NEXT_PUBLIC_API_URL` | e.g. `https://garmonpay.com/api` or leave empty for same-origin |
| `NEXT_PUBLIC_BOXING_WS_URL` | Arena fight server WebSocket URL (e.g. `wss://garmonpay-fight-server.onrender.com`) |
| `NEXT_PUBLIC_FIGHT_SERVER_URL` | Same server, HTTP URL for keep-alive/status |

**Optional:**

- `MESHY_API_KEY` — Arena 3D fighter generation
- `ANTHROPIC_API_KEY` — Arena AI opponent (Claude)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` — Signup anti-bot
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — New-login email alerts
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Client-side Stripe

## 2. Database

1. Run **`supabase/CHECK_DATABASE.sql`** in Supabase Dashboard → SQL Editor.
2. If anything is missing, run **`supabase/APPLY_MISSING_MIGRATIONS.sql`** (safe to run multiple times).
3. For Arena 3D fighters, run **`supabase/RUN_ARENA_3D_COLUMNS.sql`** so `arena_fighters` has `model_3d_url`, `model_3d_status`, etc.
4. Re-run **`CHECK_DATABASE.sql`** until `missing_tables = 0` and column checks pass.

See **`supabase/DATABASE_FIRST.md`** and **`supabase/ARENA_MIGRATIONS_ORDER.md`** for details.

## 3. Fight server (Arena)

- Deploy **`server/fight-server.js`** (e.g. Render). Set env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGIN=https://garmonpay.com`.
- Set **`NEXT_PUBLIC_BOXING_WS_URL`** and **`NEXT_PUBLIC_FIGHT_SERVER_URL`** in the Next.js app to point to that deployment.
- Ensure keep-alive is enabled (Arena hub shows connection status). Cold starts may take ~30s after idle.

## 4. Stripe

- In Stripe Dashboard → Webhooks, add endpoint: `https://garmonpay.com/api/stripe/webhook` (or your production URL).
- Subscribe to: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, and any others your app uses.
- Set **`STRIPE_WEBHOOK_SECRET`** from the webhook’s signing secret.

## 5. Build and lint

```bash
npm ci
npm run build
npm run lint
```

Fix any errors. Warnings (e.g. one-off `useEffect` deps) are acceptable if intentional.

## 6. Quick smoke test

- Homepage and login/register load.
- Dashboard and wallet load for a test user.
- Arena: create fighter, start a fight, confirm WebSocket connects (green dot on hub).
- Deposit flow: create checkout session and confirm webhook credits balance (or use Stripe test mode).

---

**Optional:** Pinball, referrals, admin, tournaments, season pass, and 3D/Meshy depend on the same DB and env; once the checklist above is done, those features use the same config.
