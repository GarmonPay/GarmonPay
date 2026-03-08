-- Boxing leaderboard: track knockouts. Every fight end is by KO (health to 0).
alter table public.fight_history
  add column if not exists knockout boolean not null default true;

comment on column public.fight_history.knockout is 'True when fight ended by knockout (opponent health to 0).';
