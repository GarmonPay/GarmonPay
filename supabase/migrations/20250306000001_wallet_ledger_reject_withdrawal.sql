-- When a withdrawal is rejected, credit the user via wallet ledger so wallet_balances and users stay in sync.
-- (approve_withdrawal only moves pending_balance; the debit already happened at request time via ledger.)

create or replace function public.reject_withdrawal(p_withdrawal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.withdrawals%rowtype;
  v_ref text;
  v_result jsonb;
begin
  select * into v_row from public.withdrawals where id = p_withdrawal_id for update;
  if v_row is null then
    return jsonb_build_object('success', false, 'message', 'Withdrawal not found');
  end if;
  if v_row.status != 'pending' then
    return jsonb_build_object('success', false, 'message', 'Only pending withdrawals can be rejected');
  end if;

  v_ref := 'withdrawal_reject_' || p_withdrawal_id;
  v_result := public.wallet_ledger_entry(v_row.user_id, 'admin_adjustment', v_row.amount, v_ref);
  if not (v_result->>'success')::boolean then
    return jsonb_build_object('success', false, 'message', coalesce(v_result->>'message', 'Ledger credit failed'));
  end if;

  update public.users
  set withdrawable_balance = withdrawable_balance + v_row.amount,
      pending_balance = pending_balance - v_row.amount,
      updated_at = now()
  where id = v_row.user_id;

  update public.withdrawals set status = 'rejected' where id = p_withdrawal_id;

  update public.transactions
  set status = 'rejected', description = 'Withdrawal rejected - balance refunded'
  where reference_id = p_withdrawal_id and type = 'withdrawal';

  return jsonb_build_object('success', true);
end;
$$;

comment on function public.reject_withdrawal is 'Reject withdrawal: credit wallet via ledger, update withdrawable/pending, set status rejected.';
