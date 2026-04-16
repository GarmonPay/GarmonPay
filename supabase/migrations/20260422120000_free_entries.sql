-- Monthly free Sweeps Coins (SC) online entry tracking (one per email or IP per calendar month).

CREATE TABLE IF NOT EXISTS public.free_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  email text NOT NULL,
  ip_address text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  month_year text NOT NULL
);

CREATE INDEX IF NOT EXISTS free_entries_month_email ON public.free_entries (month_year, lower(email));
CREATE INDEX IF NOT EXISTS free_entries_month_ip ON public.free_entries (month_year, ip_address)
  WHERE ip_address IS NOT NULL AND ip_address <> '' AND ip_address <> 'unknown';

CREATE UNIQUE INDEX IF NOT EXISTS free_entries_email_month_unique ON public.free_entries (month_year, (lower(trim(email))));

ALTER TABLE public.free_entries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.free_entries IS 'Free SC mail/online sweepstakes entries; server-side inserts via service role only.';
