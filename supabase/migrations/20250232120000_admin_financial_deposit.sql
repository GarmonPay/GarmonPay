-- Admin financial: allow deposit type in transactions (Stripe top-ups).
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in (
    'earning', 'withdrawal', 'ad_credit', 'referral', 'referral_commission',
    'spin_wheel', 'scratch_card', 'mystery_box', 'streak', 'mission',
    'tournament_entry', 'tournament_prize', 'team_prize',
    'fight_entry', 'fight_prize',
    'boxing_entry', 'boxing_prize', 'boxing_bet', 'boxing_bet_payout',
    'deposit'
  ));
