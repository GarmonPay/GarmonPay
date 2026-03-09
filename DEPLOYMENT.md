# GarmonPay — Deployment

## Tech stack

- **Next.js 14**, TypeScript, Tailwind
- **Supabase** (PostgreSQL, Auth, Storage)
- **Stripe** (payments)
- **Vercel** (recommended for hosting)

---

## Environment variables

Set these in Vercel (or your host) and in local `.env.local`:

### Supabase

- `NEXT_PUBLIC_SUPABASE_URL` — project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key
- `SUPABASE_SERVICE_ROLE_KEY` — service role (server-only; never expose to client)

### Stripe

- `STRIPE_SECRET_KEY` — secret key
- `STRIPE_WEBHOOK_SECRET` — webhook signing secret (from Stripe Dashboard → Developers → Webhooks)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — publishable key (optional, for client-side Stripe)

### Optional

- `ADMIN_SECRET` — used for admin-only API calls (e.g. wallet update by `user_id` with header `x-admin-key`)

---

## Database (Supabase)

1. In Supabase Dashboard → SQL Editor, run all migrations in `supabase/migrations/` **in order** (by filename).
2. New migrations added for this platform:
   - `20250312000000_wallets_table.sql` — `wallets` table synced with `wallet_balances`
   - `20250312000001_fighters.sql` — `fighters` (speed, power, defense, wins, losses, level, earnings)
   - `20250312000002_fights_fighter_ids.sql` — `fighter1_id`, `fighter2_id`, `winner_id` on `fights`
   - `20250312000003_bets.sql` — `bets` table for spectator bets; `status` on `fight_bets`
   - `20250312000004_users_banned.sql` — `banned`, `banned_reason` on `users`

---

## Stripe webhook

1. In Stripe Dashboard → Developers → Webhooks, add endpoint:
   - URL: `https://<your-domain>/api/stripe/webhook`
   - Events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
2. Copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET`.

Deposits started via `/api/wallet/deposit` complete in the webhook; balance is updated via `wallet_ledger_entry` (and synced to `wallet_balances` / `wallets`).

---

## Build and deploy (Vercel)

1. Connect the repo to Vercel.
2. Set all environment variables above.
3. Build command: `npm run build`
4. Output: Next.js (default).

Build succeeds with `npm run build`. Runtime errors during static generation (e.g. Supabase fetch, dynamic routes) are expected when env or network are not available at build time; they do not block deployment.

---

## Key APIs and flows

- **Wallet**: Balance is canonical in `wallet_balances` (and mirrored in `wallets`). All changes go through `wallet_ledger_entry` RPC. Use `GET /api/wallet/get` or `GET /api/wallet` for balance; `POST /api/wallet/deposit` starts Stripe Checkout; `POST /api/wallet/update` for admin/internal adjustments.
- **Fighters**: `GET/POST /api/fighters` to list and create. Training: `POST /api/training/upgrade` (body: `fighter_id`, `stat`: speed|power|defense). Costs: speed $1, power $2, defense $2 (deducted from wallet).
- **Fight arena**: Create fight with optional `fighterId`; join with optional `fighterId`. Resolve by stats: `POST /api/fight-arena/fights/[id]/end` with `{ "runByStats": true }`. Winner is determined by (speed + power + defense); wallet and fighter wins/losses/earnings are updated; spectator bets in `bets` are paid out.
- **Bets**: Spectators `POST /api/bets` with `fight_id`, `amount_cents`, `prediction` (host|opponent). Payout is automatic when the fight ends.
- **Leaderboard**: `GET /api/leaderboard?sort=wins|level|earnings` returns top fighters from `fighters` table.
- **Admin**: `/admin` for dashboard; Ban/Unban via `POST /api/admin/ban` (body: `userId`, `banned`, `reason?`). Banned users are rejected in `getAuthUserId` / `getAuthUserIdStrict`.

---

## PWA

- Manifest: `public/manifest.json`
- Service worker: `public/sw.js`
- Install prompt: `beforeinstallprompt` is captured and an "Install" banner is shown (see `PwaInstallPrompt.tsx`). Users can install GarmonPay on supported mobile devices.
