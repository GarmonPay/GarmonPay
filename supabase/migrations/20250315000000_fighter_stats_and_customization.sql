/* Fighter stats: stamina, experience. Customization: gender, skin_tone, gloves, shorts, shoes for cosmetics. */
alter table public.fighters add column if not exists stamina int not null default 50 check (stamina >= 1 and stamina <= 100);
alter table public.fighters add column if not exists experience int not null default 0 check (experience >= 0);
alter table public.fighters add column if not exists gender text check (gender is null or gender in ('male', 'female'));
alter table public.fighters add column if not exists skin_tone text;
alter table public.fighters add column if not exists gloves text;
alter table public.fighters add column if not exists shorts text;
alter table public.fighters add column if not exists shoes text;
comment on column public.fighters.stamina is 'Stamina stat 1-100; affects fight performance.';
comment on column public.fighters.experience is 'XP earned from fights and training.';
comment on column public.fighters.gender is 'male | female for model selection (male-boxer.glb / female-boxer.glb).';
comment on column public.fighters.skin_tone is 'Cosmetic: skin tone id or hex.';
comment on column public.fighters.gloves is 'Cosmetic: gloves style id.';
comment on column public.fighters.shorts is 'Cosmetic: shorts style id.';
comment on column public.fighters.shoes is 'Cosmetic: shoes style id.';
