-- Add daily leaderboard support for pinball tournament mode.

alter table public.pinball_scores add column if not exists daily_key text;
create index if not exists pinball_scores_daily on public.pinball_scores (daily_key, score desc);

comment on column public.pinball_scores.daily_key is 'YYYY-MM-DD for daily leaderboard.';
