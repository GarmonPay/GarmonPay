-- Money system hardening: withdrawal requests + referral trigger + user columns.

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  amount_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  stripe_email TEXT,
  processed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own withdrawals" ON public.withdrawal_requests;
CREATE POLICY "users read own withdrawals" ON public.withdrawal_requests
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users insert own withdrawals" ON public.withdrawal_requests;
CREATE POLICY "users insert own withdrawals" ON public.withdrawal_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := 'GARM-' || upper(substring(md5(NEW.id::text), 1, 4));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_referral_code ON public.users;
CREATE TRIGGER set_referral_code
  BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION generate_referral_code();

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES auth.users(id);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance_cents INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_status TEXT;

UPDATE public.users
SET referral_code = 'GARM-' || upper(substring(md5(id::text), 1, 4))
WHERE referral_code IS NULL;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check
CHECK (
  type IN (
    'earning',
    'withdrawal',
    'ad_credit',
    'referral',
    'ad_view',
    'membership_upgrade',
    'referral_upgrade',
    'referral_join',
    'deposit',
    'commission'
  )
);
