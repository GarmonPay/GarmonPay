-- Reverses only the isolated member_platform tables from 0001_isolated_not_applied.sql.
-- Do not run this against production. Do not run it if those tables contain data you need.
-- This file is not in supabase/migrations and must not be applied by db push.

drop table if exists member_platform_commission_events;
drop table if exists member_platform_campaigns;
drop table if exists member_platform_profiles;
