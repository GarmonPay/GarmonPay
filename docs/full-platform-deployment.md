# GarmonPay Full Platform Deployment Guide

## 1) Database (Supabase)

Apply all migrations, including:

- `supabase/migrations/20260301000000_mobile_backend_platform.sql`

This migration provisions/extends:

- `wallets`
- `transactions`
- `withdrawals`
- `reward_events`
- `analytics_events`

and adds RPC functions used by backend API:

- `gp_ensure_wallet`
- `gp_credit_reward`
- `gp_request_withdrawal`
- `gp_admin_manual_credit`
- `gp_admin_process_withdrawal`
- `gp_apply_stripe_deposit`

## 2) Backend API (`/backend`)

Set environment:

- `PORT`
- `APP_ORIGIN` (comma-separated web origins)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Run:

```bash
cd backend
npm install
npm run build
npm run start
```

Or Docker:

```bash
cd backend
docker build -t garmonpay-backend .
docker run -p 4000:4000 --env-file .env garmonpay-backend
```

## 3) Next.js Admin Panel

Set:

- `NEXT_PUBLIC_BACKEND_API_URL` to your backend API base, e.g. `https://api.garmonpay.com/api`

Admin pages added:

- `/admin/users`
- `/admin/withdrawals`
- `/admin/rewards`
- `/admin/analytics`

## 4) Flutter Mobile App (`/mobile`)

Build with runtime defines:

- `API_BASE_URL`
- `ANDROID_REWARDED_AD_UNIT_ID`
- `IOS_REWARDED_AD_UNIT_ID`

Example:

```bash
cd mobile
flutter pub get
flutter build apk --release \
  --dart-define=API_BASE_URL=https://api.garmonpay.com/api \
  --dart-define=ANDROID_REWARDED_AD_UNIT_ID=ca-app-pub-xxxx/yyyy
```

## 5) Stripe

Configure webhook endpoint to backend:

- `POST https://api.garmonpay.com/api/stripe/webhook`

On `checkout.session.completed`, backend applies deposit to wallet and inserts transaction via `gp_apply_stripe_deposit`.
