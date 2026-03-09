-- Boxing game upgrade: fighter progression, customization, and cosmetics inventory.
alter table public.fighters
  add column if not exists stamina int not null default 5 check (stamina >= 1 and stamina <= 100),
  add column if not exists experience int not null default 0 check (experience >= 0),
  add column if not exists gender text not null default 'male' check (gender in ('male', 'female')),
  add column if not exists skin_tone text not null default 'medium',
  add column if not exists gloves_color text not null default 'red',
  add column if not exists shorts_color text not null default 'black',
  add column if not exists shoes_color text not null default 'white',
  add column if not exists owned_cosmetics jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true;

create index if not exists fighters_experience on public.fighters (experience desc);
create index if not exists fighters_stamina on public.fighters (stamina desc);
create index if not exists fighters_is_active on public.fighters (is_active);

comment on column public.fighters.stamina is 'Fighter endurance. Training and fights consume/recover this value.';
comment on column public.fighters.experience is 'Career progression points earned from training and matches.';
comment on column public.fighters.gender is 'Male or female boxer model selection.';
comment on column public.fighters.owned_cosmetics is 'JSON object map of unlocked cosmetic item ids.';
