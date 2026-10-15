-- Emergency rollback only: restores the VERIFIED pre-migration exposure.
-- Do not run automatically: this reopens public access to historical financial data.
BEGIN;
ALTER TABLE public.backup_transactions_clean DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_transactions_clean_v2 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_transactions_full DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_profiles_balance_fix DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovered_stripe_sessions DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.backup_transactions_clean TO anon, authenticated;
GRANT ALL ON TABLE public.backup_transactions_clean_v2 TO anon, authenticated;
GRANT ALL ON TABLE public.backup_transactions TO anon, authenticated;
GRANT ALL ON TABLE public.backup_users TO anon, authenticated;
GRANT ALL ON TABLE public.backup_transactions_full TO anon, authenticated;
GRANT ALL ON TABLE public.backup_profiles_balance_fix TO anon, authenticated;
GRANT ALL ON TABLE public.recovered_stripe_sessions TO anon, authenticated;
GRANT ALL ON TABLE public.admin_finance_overview TO anon, authenticated;
GRANT ALL ON TABLE public.admin_stats TO anon, authenticated;
GRANT ALL ON TABLE public.total_deposits TO anon, authenticated;
COMMIT;
