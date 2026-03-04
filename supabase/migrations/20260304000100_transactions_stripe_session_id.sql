-- Add stripe_session_id to transactions for webhook idempotency.
alter table public.transactions
  add column if not exists stripe_session_id text;

create index if not exists transactions_stripe_session_id_idx
  on public.transactions (stripe_session_id);
