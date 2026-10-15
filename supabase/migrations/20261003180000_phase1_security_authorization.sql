-- PHASE 1: prepare/review before production application. No row data or economics change.
-- Server routes call the financial RPCs with service_role after authenticating users.
-- Browser RPCs change_username/check_username_available, and auth.uid()-guarded
-- garmondrop/garmonfour_cancel_room remain available under their existing grants.
BEGIN;

DO $phase1$
DECLARE
  columns_sql text;
  col record;
  fn record;
  protected_functions text[] := ARRAY[
    'add_deposit',
    'add_game_reward',
    'add_funds',
    'admin_balance_monitor_drift',
    'approve_withdrawal',
    'celo_finalize_banker_terminal_round',
    'celo_handle_bank_bust_and_transfer',
    'celo_increment_round_banker_accounting',
    'celo_post_entry_atomic',
    'celo_reconcile_terminal_room_bank',
    'celo_record_platform_fee',
    'claim_daily_reward',
    'coin_flip_record_platform_fee',
    'complete_ad_session_and_issue_reward',
    'complete_ad_session_with_platform_protection',
    'convert_balance_to_ad_credit',
    'convert_gold_to_gpay_coins',
    'credit_coins',
    'credit_coins_with_ledger',
    'credit_gpay_tokens',
    'debit_gold_coins',
    'debit_gpay_coins',
    'debit_gpay_coins_with_ledger',
    'debit_sweeps_coins',
    'garmon_ad_engage',
    'garmon_margin_last_24h',
    'garmondrop_cancel_waiting_atomic',
    'garmondrop_fix_null_current_turn',
    'garmondrop_forfeit_atomic',
    'garmondrop_make_move_atomic',
    'garmondrop_post_entry_atomic',
    'garmondrop_record_platform_fee',
    'garmondrop_repair_turn_atomic',
    'garmonfour_cancel_waiting_atomic',
    'garmonfour_fix_null_current_turn',
    'garmonfour_forfeit_atomic',
    'garmonfour_make_move_atomic',
    'garmonfour_post_entry_atomic',
    'garmonfour_record_platform_fee',
    'garmonfour_repair_turn_atomic',
    'gpay_ledger_entry',
    'grant_referral_bonus_for_user',
    'handle_stripe_deposit',
    'increment_arena_coins',
    'increment_balance',
    'increment_profile_reportable_earnings',
    'increment_social_strikes',
    'increment_user_balance',
    'increment_wallet',
    'increment_wallet_balance',
    'platform_record_payout',
    'platform_record_revenue',
    'process_all_due_referral_commissions',
    'process_game_loss',
    'process_subscription_billing',
    'purchase_membership_with_balance_v2',
    'reject_withdrawal',
    'request_withdrawal',
    'stop_commissions_on_subscription_canceled',
    'submit_withdrawal',
    'wallet_ledger_entry'
  ];
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Phase 1 requires public.users; inspect schema before proceeding';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') OR
     NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') OR
     NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE EXCEPTION 'Required Supabase roles are missing';
  END IF;

  -- Own-row RLS alone does not protect columns. Remove both table and column grants.
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.users FROM PUBLIC, anon, authenticated;
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
    INTO columns_sql FROM pg_attribute
    WHERE attrelid = 'public.users'::regclass AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), REFERENCES (%s) ON public.users FROM PUBLIC, anon, authenticated',
    columns_sql, columns_sql, columns_sql);

  -- Only plain profile presentation fields are directly editable. Existing RLS still applies.
  FOR col IN SELECT attname FROM pg_attribute
    WHERE attrelid = 'public.users'::regclass AND attnum > 0 AND NOT attisdropped
      AND attname IN ('full_name', 'avatar_url')
  LOOP
    EXECUTE format('GRANT UPDATE (%I) ON public.users TO authenticated', col.attname);
  END LOOP;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO service_role;

  -- Cover every deployed overload; never replace function bodies or settlement rules.
  FOR fn IN SELECT p.oid, p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname = ANY(protected_functions)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
    IF has_function_privilege('anon', fn.oid, 'EXECUTE') OR
       has_function_privilege('authenticated', fn.oid, 'EXECUTE') OR
       NOT has_function_privilege('service_role', fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected financial function privileges: %', fn.signature;
    END IF;
  END LOOP;

  -- Assert effective grants as well, catching unexpected inherited permissions.
  FOR col IN SELECT attname FROM pg_attribute
    WHERE attrelid = 'public.users'::regclass AND attnum > 0 AND NOT attisdropped
  LOOP
    IF has_column_privilege('anon', 'public.users', col.attname, 'UPDATE') OR
       has_column_privilege('anon', 'public.users', col.attname, 'INSERT') OR
       has_column_privilege('authenticated', 'public.users', col.attname, 'INSERT') OR
       (col.attname NOT IN ('full_name', 'avatar_url') AND
        has_column_privilege('authenticated', 'public.users', col.attname, 'UPDATE')) THEN
      RAISE EXCEPTION 'Unexpected protected users column privileges: %', col.attname;
    END IF;
  END LOOP;
END;
$phase1$;
COMMIT;
