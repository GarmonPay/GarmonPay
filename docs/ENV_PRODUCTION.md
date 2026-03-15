# Production environment variables (garmonpay.com)

Set these in your hosting provider (e.g. Vercel → Project → Settings → Environment Variables) for **Production**. Do not commit real keys to the repo.

## Required for Arena + Stripe + AI

| Variable | Example / value | Used for |
|----------|-----------------|----------|
| `NEXT_PUBLIC_API_URL` | `https://garmonpay.com` | API base URL for client requests (dashboard, arena, admin). |
| `NEXT_PUBLIC_ARENA_WS_URL` | `wss://garmonpay.com` | WebSocket URL for Arena fights and tournament bracket updates. Must match where the fight server is (same host or subdomain). |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Arena AI opponent (Claude). Omit if you don’t use “Fight AI Opponent”. |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Stripe API (checkout, subscriptions, webhook). |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Stripe webhook signature verification. Webhook URL: `https://garmonpay.com/api/stripe/webhook`. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | Stripe client-side (optional name: `STRIPE_PUBLISHABLE_KEY`). For checkout UI. |

## Confirm they’re connected

1. **NEXT_PUBLIC_API_URL**  
   - Open `https://garmonpay.com/dashboard/arena`.  
   - If the page loads and “My Fighter” or “Create Fighter” works, the app is calling the API; with same-origin deploy this is the same host.

2. **NEXT_PUBLIC_ARENA_WS_URL**  
   - Open `https://garmonpay.com/dashboard/arena/fight`, create a fight.  
   - If the fight connects and exchanges resolve, the client is using this WebSocket URL.  
   - Ensure your fight server is reachable at this URL (e.g. same host with a WebSocket-capable proxy, or the host where the fight server runs).

3. **ANTHROPIC_API_KEY**  
   - Use “Fight AI Opponent” on the arena fight page.  
   - If an AI opponent is generated and the fight starts, the key is set and used.

4. **STRIPE_SECRET_KEY**  
   - Trigger a Stripe flow (e.g. Arena Season Pass checkout or store checkout).  
   - If the redirect to Stripe Checkout works and no “Stripe not configured” error appears, the server has the key.  
   - You can also call `GET https://garmonpay.com/api/stripe/status` (or `/api/stripe/debug`) and confirm it reports the key as set (without exposing the key).

5. **NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY**  
   - Same checkout flow: if the Stripe Elements (or redirect) load without a client-side Stripe error, the publishable key is set.

6. **STRIPE_WEBHOOK_SECRET**  
   - In Stripe Dashboard → Developers → Webhooks, send a test event to `https://garmonpay.com/api/stripe/webhook`.  
   - If the webhook returns 200 and you see the expected behavior (e.g. Season Pass or store item granted), the secret is correct.

## Quick checklist

- [ ] `NEXT_PUBLIC_API_URL=https://garmonpay.com` (production)
- [ ] `NEXT_PUBLIC_ARENA_WS_URL=wss://garmonpay.com` (or the URL of your fight server)
- [ ] `ANTHROPIC_API_KEY` set if using Arena AI opponent
- [ ] `STRIPE_SECRET_KEY` set (live key for production)
- [ ] `STRIPE_WEBHOOK_SECRET` set and webhook URL `https://garmonpay.com/api/stripe/webhook` configured in Stripe
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (or `STRIPE_PUBLISHABLE_KEY`) set for client-side Stripe

After changing any `NEXT_PUBLIC_*` variable, rebuild and redeploy so the new value is embedded in the client bundle.
