# GarmonPay — Mobile + Backend + Admin

## Structure

- **`/src`** — Next.js app (web dashboard, admin panel, existing API routes)
- **`/backend`** — Node.js Express API for mobile (auth, wallet, rewards, withdrawals, analytics)
- **`/mobile`** — Flutter app (iOS/Android): auth, home, earn, wallet, profile

## Mobile app

1. `cd mobile`
2. Run `flutter create .` to generate `android/` and `ios/` if missing
3. `flutter pub get`
4. Set Supabase URL and anon key (see `mobile/README.md`)
5. Point `ApiClient.baseUrl` to your Node backend URL
6. `flutter run` or `flutter build apk` / `flutter build ios`

## Backend (Node)

1. `cd backend`
2. Copy `.env.example` to `.env` and set Supabase keys
3. `npm install && npm run build && npm start`
4. Default port: 4000

## Admin panel (Next.js)

- Existing admin at `/admin` (login, dashboard, users, withdrawals, etc.)
- New pages: **Rewards** (reward transactions), **Analytics** (event log)
- Run Supabase migration `20250247000000_analytics_events.sql` so Analytics works

## Stripe

- Existing Next.js webhook at `/api/webhooks/stripe` updates `users.balance` and `total_deposits`
- Node backend reads the same `users` table; no duplicate Stripe logic in Node

## Deployment

- **Next.js**: Vercel (or current host)
- **Node backend**: Any Node host (Railway, Fly.io, etc.); set env vars
- **Flutter**: Build APK/IPA and publish to stores; configure env for Supabase + API URL
