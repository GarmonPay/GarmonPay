# Monthly Recurring Referral Commission System

## Overview

When a referred member has an **active paid subscription**, the referrer earns a **monthly commission** (percentage of the subscription price). Commissions are paid only after a successful subscription payment and stop when the subscription is canceled.

## Database

- **subscriptions** — user_id, membership_tier, monthly_price, status (active/canceled/past_due), started_at, next_billing_date
- **subscription_payments** — idempotency: one row per (subscription_id, period_end_date) to prevent duplicate commission
- **referral_commission_config** — admin-set commission % per tier (Starter, Pro, Elite, VIP)
- **referral_commissions** — referrer, referred, subscription_id, commission_amount, last_paid_date, status (active/stopped)

## Commission Rules

1. **On subscription payment success** (monthly): create/update commission record, pay referrer balance, update last_paid_date, record in transactions.
2. **On subscription canceled**: trigger sets all referral_commissions for that subscription to status `stopped`; no further payouts.

## Security

- Commission paid **only** after successful subscription payment (recorded via subscription_payments).
- **Duplicate prevention**: subscription_payments unique on (subscription_id, period_end_date); process_subscription_billing skips if period already paid.
- All logic is **server-side** (Supabase RPC and API routes).

## Automated Monthly Process

- **Endpoint**: `POST /api/cron/process-referral-commissions`
- **Auth**: Header `X-Cron-Secret` or `Authorization: Bearer <CRON_SECRET>` (set `CRON_SECRET` in env).
- **Behavior**: Finds all active subscriptions where `next_billing_date <= today`, for each records payment (idempotent), pays referrer commission, advances next_billing_date.

Schedule this endpoint monthly (e.g. Vercel Cron, cron job).

## Admin

- **Referrals** page: total recurring commissions paid, active referral subscriptions count, form to set commission % per tier.
- **Create subscription** (testing): `POST /api/admin/subscriptions` with `userId`, `membershipTier`, `monthlyPriceCents`, optional `nextBillingDate`.

## User Dashboard

- **Referrals** page: **Monthly Referral Income** — active referral subscriptions count, this month’s commission, lifetime referral commission, list of active referral commission rows.

## Manual Test Checklist

1. **Commission paid monthly**
   - Create user A (referrer) and user B; set B’s `referred_by_code` = A’s `referral_code`.
   - Create subscription for B: tier e.g. Pro, monthly_price 1000, next_billing_date = today or past.
   - Call `process_all_due_referral_commissions` (or POST cron endpoint).
   - Assert: A’s balance increased by tier % of 1000; transaction type `referral_commission` for A; referral_commissions row has last_paid_date set.

2. **Stops when subscription canceled**
   - Cancel B’s subscription (status = 'canceled').
   - Assert: referral_commissions row for (A, B, sub) has status = 'stopped'.
   - Advance next_billing_date and run process again (or create new sub for same pair); no second payout for the same period (idempotent). New sub would create new commission row when processed.

3. **Balances update correctly**
   - After step 1, check users.balance for A increased by commission; transactions has one completed referral_commission row.

4. **Duplicate prevention**
   - Run process twice for the same subscription without advancing time: second run should not pay again (subscription_payments already has that period_end_date).

## Run automated checks

```bash
# Load env from .env.local if you use it
export $(grep -v '^#' .env.local | xargs)
npm run test:commissions
```
