# GarmonPay deployment checklist

## STEP 1 — Git (done)

- `git status` — commit any changes with `git add . && git commit -m "..." && git push origin main`
- Remote should be: `https://github.com/GarmonPay/GarmonPay.git`
- Branch: `main`

## STEP 2 — Commit & push (done)

- All local changes committed and pushed. Vercel auto-deploys on push to `main`.

## STEP 3 — Vercel connection (verify in dashboard)

In **Vercel Dashboard** → your project (**garmonpay** / **garmon-pay**) → **Settings** → **Git**:

- **Connected Repository:** `GarmonPay/GarmonPay` (GitHub)
- **Production Branch:** `main`
- **Auto-deploy:** enabled (deploys on every push to `main`)

If the repo or branch is wrong, disconnect and reconnect the correct repo/branch.

## STEP 4 — Force redeploy (optional)

If a push didn’t trigger a deploy or you want a clean build:

```bash
npx vercel --prod
```

Or install CLI and log in once:

```bash
npm install -g vercel
vercel login
vercel --prod
```

## STEP 5 — Build (verified)

- Run locally: `npm run build`
- Must see: **✓ Compiled successfully** and the route table with no red errors.
- Fix any TypeScript/ESLint errors before pushing.

## STEP 6 — Environment variables

**Local (`.env.local`):** Used for `npm run dev` and `npm run build`. Never commit this file.

**Vercel (Production):** Project → **Settings** → **Environment Variables**. Set these for **Production** (and Preview if you use it):

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key (pk_live_...) |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (sk_live_...) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `NEXT_PUBLIC_API_URL` | Yes | `https://garmonpay.com` |
| `NEXT_PUBLIC_ARENA_WS_URL` | Yes | `wss://garmonpay.com` |
| `ANTHROPIC_API_KEY` | If using Arena AI | Claude API key |
| `ADMIN_SETUP_SECRET` | If using admin setup | Random secret string |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | If using Turnstile | Cloudflare Turnstile site key |
| `TURNSTILE_SECRET_KEY` | If using Turnstile | Cloudflare Turnstile secret |
| `RESEND_API_KEY` | If using Resend email | Resend API key |
| `RESEND_FROM_EMAIL` | If using Resend | Sender email |

No NextAuth in this project; ignore `NEXTAUTH_SECRET` / `NEXTAUTH_URL` unless you add NextAuth later.

After changing env vars in Vercel, trigger a **Redeploy** (Deployments → ⋮ → Redeploy).

## STEP 7 — After deployment

1. **Vercel Dashboard:** Deployments → latest deployment should be **Ready** (green).
2. **Live site:** Open https://garmonpay.com and hard refresh: **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows).
3. **Confirm:** New changes (e.g. Arena create form, error messages) are visible.

If the site still shows old code: clear browser cache, try an incognito window, or check that the deployment is the one from your latest commit (match commit hash in Vercel to `git log -1 --oneline`).
