-- GPC membership bonuses (upgrade + monthly) — audit table + user timestamps + transaction types

CREATE TABLE IF NOT EXISTS public.membership_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  bonus_type text NOT NULL,
  from_tier text,
  to_tier text NOT NULL,
  gpc_amount integer NOT NULL,
  credited_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS membership_bonuses_user_credited
  ON public.membership_bonuses (user_id, credited_at DESC);

ALTER TABLE public.membership_bonuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own bonuses" ON public.membership_bonuses;
CREATE POLICY "Users read own bonuses"
  ON public.membership_bonuses FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.membership_bonuses IS 'Audit log for GPC membership upgrade and monthly bonuses; credits use credit_coins / coin_transactions.';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS membership_bonus_claimed boolean DEFAULT false;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_monthly_bonus_at timestamptz;

COMMENT ON COLUMN public.users.membership_bonus_claimed IS 'Legacy flag; prefer membership_bonuses rows for idempotency.';
COMMENT ON COLUMN public.users.last_monthly_bonus_at IS 'Last time a recurring monthly GPC membership bonus was credited.';

-- Extend transactions.type for reporting (mirror coin ledger descriptions)
-- Keep full list from 20260409140000_membership_balance_expiry + bonus types
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (
  type IN (
    'deposit',
    'withdrawal',
    'referral',
    'referral_commission',
    'earning',
    'ad_credit',
    'ad_view',
    'spin_wheel',
    'scratch_card',
    'mystery_box',
    'streak',
    'mission',
    'tournament_entry',
    'tournament_prize',
    'team_prize',
    'fight_entry',
    'fight_prize',
    'boxing_entry',
    'boxing_prize',
    'boxing_bet',
    'boxing_bet_payout',
    'game_win',
    'game_loss',
    'admin_adjustment',
    'membership_upgrade',
    'referral_upgrade',
    'referral_join',
    'commission',
    'subscription_payment',
    'membership_upgrade_bonus',
    'monthly_membership_bonus'
  )
);
