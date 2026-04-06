-- Balance-paid membership expiry columns + transactions.subscription_payment

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS membership_tier TEXT DEFAULT 'free';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS membership_payment_source TEXT;

UPDATE public.users
SET membership_tier = COALESCE(NULLIF(TRIM(membership), ''), 'free')
WHERE membership_tier IS NULL OR membership_tier = '';

-- Broad CHECK: merge types used across migrations + subscription_payment
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
    'subscription_payment'
  )
);
