-- transactions type constraint: all types used by app (deposits, withdrawals, referrals, games, fights, boxing, tournaments, admin)
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions
ADD CONSTRAINT transactions_type_check
CHECK (
  type IN (
    'deposit',
    'withdrawal',
    'referral',
    'referral_commission',
    'earning',
    'ad_credit',
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
    'admin_adjustment'
  )
);
