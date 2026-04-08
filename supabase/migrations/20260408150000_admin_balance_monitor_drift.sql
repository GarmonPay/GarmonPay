-- Admin Balance Monitor: drift between wallet_balances and latest wallet_ledger row per user.
-- Called from GET /api/admin/balance-monitor (service role only).

CREATE OR REPLACE FUNCTION public.admin_balance_monitor_drift()
RETURNS TABLE (
  email text,
  wallet_balances_cents bigint,
  ledger_latest_cents bigint,
  drift_cents bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.email,
         wb.balance AS wallet_balances_cents,
         wl_latest.balance_after AS ledger_latest_cents,
         wb.balance - COALESCE(wl_latest.balance_after, 0) AS drift_cents
  FROM public.wallet_balances wb
  JOIN public.users u ON u.id = wb.user_id
  LEFT JOIN LATERAL (
    SELECT wl.balance_after
    FROM public.wallet_ledger wl
    WHERE wl.user_id = wb.user_id
    ORDER BY wl.created_at DESC
    LIMIT 1
  ) wl_latest ON true
  WHERE wb.balance != COALESCE(wl_latest.balance_after, 0)
  ORDER BY abs(wb.balance - COALESCE(wl_latest.balance_after, 0)) DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_balance_monitor_drift() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_balance_monitor_drift() TO service_role;

COMMENT ON FUNCTION public.admin_balance_monitor_drift() IS 'Rows where wallet_balances.balance differs from latest wallet_ledger.balance_after (admin diagnostics).';
