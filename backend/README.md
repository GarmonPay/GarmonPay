# GarmonPay Backend (Node.js + Express)

API server for the GarmonPay mobile app and admin operations.

## Setup

```bash
cp .env.example .env
# Edit .env with your Supabase URL and keys

npm install
npm run build
npm start
```

Development:

```bash
npm run dev
```

## Environment

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default 4000) |
| `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (for JWT verification) |

## API (all protected except health)

- `GET /health` — health check
- `GET /api/user/profile` — current user profile (Bearer token)
- `GET /api/wallet` — wallet balance
- `POST /api/rewards/credit` — body: `{ amount, eventType }` (amount in cents)
- `POST /api/withdrawals/request` — body: `{ amount, paymentMethod, wallet_address }`
- `GET /api/transactions` — list transactions
- `POST /api/analytics/event` — body: `{ eventType, payload? }`

Authentication: `Authorization: Bearer <supabase_access_token>`.

## Production

- Set env in your host (e.g. Vercel, Railway, Fly.io).
- Run migrations on Supabase so `analytics_events` exists.
