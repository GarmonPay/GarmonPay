-- Link fights to fighters. winner_id = winning fighter id.
alter table public.fights
  add column if not exists fighter1_id uuid references public.fighters (id) on delete set null,
  add column if not exists fighter2_id uuid references public.fighters (id) on delete set null,
  add column if not exists winner_id uuid references public.fighters (id) on delete set null;

create index if not exists fights_fighter1_id on public.fights (fighter1_id);
create index if not exists fights_fighter2_id on public.fights (fighter2_id);
create index if not exists fights_winner_id on public.fights (winner_id);

comment on column public.fights.fighter1_id is 'Host fighter.';
comment on column public.fights.fighter2_id is 'Opponent fighter.';
comment on column public.fights.winner_id is 'Winning fighter (fighter1 or fighter2).';
