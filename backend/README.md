# GarmonPay Backend (Express + Supabase)

Production API for mobile and admin clients.

## Features

- Supabase Auth JWT verification middleware
- Role-based admin protection (`role = admin` or `is_super_admin = true`)
- Wallet/reward/withdrawal logic using atomic Postgres RPC functions
- Stripe webhook processing with idempotent deposit reconciliation
- Analytics event ingestion and admin querying

## Required environment variables

Copy `.env.example` to `.env` and set:

- `PORT`
- `APP_ORIGIN` (comma-separated allowed origins)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` (optional unless Stripe endpoints are used)
- `STRIPE_WEBHOOK_SECRET` (required for webhook endpoint)

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run start
```
