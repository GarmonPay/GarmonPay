-- Spectator betting: close when first exchange happens (set by fight server).
alter table public.arena_fights add column if not exists betting_open boolean not null default true;
comment on column public.arena_fights.betting_open is 'False after first exchange; spectators can only bet when true.';
