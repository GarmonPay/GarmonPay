-- Review only. Do not apply to production until this file passes security review.
-- Do not move it into supabase/migrations. Do not db push.
-- Does not alter gp_sol_identities, gp_sol_sessions, or gp_sol_member_login.
-- Identity is gp_sol_members.id, which already belongs to one verified wallet.
-- These tables do not store a client-supplied wallet address or a staging UUID.
-- Paper SOL is virtual. There is no payment, payout, deposit, or withdrawal column that can be enabled.

BEGIN;

CREATE TABLE public.gp_member_paper_accounts (
  member_id uuid PRIMARY KEY REFERENCES public.gp_sol_members (id),
  cash_lamports bigint NOT NULL CHECK (cash_lamports >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gp_member_paper_positions (
  member_id uuid NOT NULL REFERENCES public.gp_sol_members (id),
  symbol text NOT NULL CHECK (symbol IN ('BTC', 'ETH')),
  micro_units bigint NOT NULL CHECK (micro_units > 0),
  cost_lamports bigint NOT NULL CHECK (cost_lamports >= 0),
  PRIMARY KEY (member_id, symbol)
);

CREATE TABLE public.gp_member_paper_fills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.gp_sol_members (id),
  symbol text NOT NULL CHECK (symbol IN ('BTC', 'ETH')),
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  virtual_lamports bigint NOT NULL CHECK (virtual_lamports > 0),
  micro_units bigint NOT NULL CHECK (micro_units > 0),
  price_microusd bigint NOT NULL CHECK (price_microusd > 0),
  sol_price_microusd bigint NOT NULL CHECK (sol_price_microusd > 0),
  price_source text NOT NULL CHECK (char_length(price_source) BETWEEN 2 AND 80),
  realized_lamports bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gp_member_paper_fills_member_time ON public.gp_member_paper_fills (member_id, created_at);

CREATE TABLE public.gp_member_ad_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.gp_sol_members (id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  destination_url text NOT NULL CHECK (char_length(destination_url) BETWEEN 8 AND 200),
  tier text NOT NULL CHECK (tier IN ('seconds5', 'seconds15', 'seconds30', 'seconds60')),
  views integer NOT NULL CHECK (views = 500),
  price_microusd bigint NOT NULL CHECK (price_microusd IN (6990000, 9990000, 14990000, 24990000)),
  status text NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  payment_enabled boolean NOT NULL DEFAULT false CHECK (payment_enabled = false),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gp_member_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.gp_sol_members (id),
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 40),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gp_member_paper_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_member_paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_member_paper_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_member_ad_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_member_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.gp_member_paper_accounts, public.gp_member_paper_positions, public.gp_member_paper_fills, public.gp_member_ad_drafts, public.gp_member_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.gp_member_paper_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gp_member_paper_positions TO service_role;
GRANT SELECT, INSERT ON public.gp_member_paper_fills TO service_role;
GRANT SELECT, INSERT ON public.gp_member_ad_drafts TO service_role;
GRANT SELECT, INSERT ON public.gp_member_audit TO service_role;

CREATE FUNCTION public.gp_member_guard_paper_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'gp_member_paper_fills' AND TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Paper fills cannot be changed or deleted';
  END IF;
  IF TG_TABLE_NAME = 'gp_member_paper_accounts' AND TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Paper accounts cannot be reset';
  END IF;
  IF TG_TABLE_NAME = 'gp_member_audit' AND TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Member audit rows are permanent';
  END IF;
  IF TG_TABLE_NAME = 'gp_member_ad_drafts' AND TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Advertising drafts are not editable into a paid campaign';
  END IF;
  IF current_setting('gp_member.paper_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Member records change only through a verified wallet session';
  END IF;
  IF TG_TABLE_NAME = 'gp_member_paper_accounts' AND TG_OP = 'INSERT' AND NEW.cash_lamports <> 10000000000 THEN
    RAISE EXCEPTION 'A paper account starts with 10 virtual SOL';
  END IF;
  IF TG_OP <> 'DELETE' AND TG_TABLE_NAME = 'gp_member_ad_drafts' AND (NEW.views <> 500 OR NEW.payment_enabled OR NEW.status <> 'draft') THEN
    RAISE EXCEPTION 'Advertising drafts stay unpaid packages of 500';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER gp_member_paper_accounts_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.gp_member_paper_accounts
  FOR EACH ROW EXECUTE FUNCTION public.gp_member_guard_paper_write();
CREATE TRIGGER gp_member_paper_positions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.gp_member_paper_positions
  FOR EACH ROW EXECUTE FUNCTION public.gp_member_guard_paper_write();
CREATE TRIGGER gp_member_paper_fills_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.gp_member_paper_fills
  FOR EACH ROW EXECUTE FUNCTION public.gp_member_guard_paper_write();
CREATE TRIGGER gp_member_ad_drafts_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.gp_member_ad_drafts
  FOR EACH ROW EXECUTE FUNCTION public.gp_member_guard_paper_write();
CREATE TRIGGER gp_member_audit_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.gp_member_audit
  FOR EACH ROW EXECUTE FUNCTION public.gp_member_guard_paper_write();

CREATE FUNCTION public.gp_member_workspace(p_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE actor uuid := public.gp_sol_member_actor(p_hash);
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  PERFORM set_config('gp_member.paper_write', 'on', true);
  INSERT INTO public.gp_member_paper_accounts (member_id, cash_lamports)
  VALUES (actor, 10000000000)
  ON CONFLICT (member_id) DO NOTHING;
  PERFORM set_config('gp_member.paper_write', 'off', true);
  RETURN jsonb_build_object(
    'ready', true,
    'virtual', true,
    'cashLamports', (SELECT cash_lamports::text FROM public.gp_member_paper_accounts WHERE member_id = actor),
    'positions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('symbol', symbol, 'microUnits', micro_units::text) ORDER BY symbol)
      FROM public.gp_member_paper_positions WHERE member_id = actor
    ), '[]'::jsonb),
    'fills', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'symbol', symbol, 'side', side, 'at', created_at, 'priceSource', price_source, 'realizedLamports', realized_lamports::text
      ) ORDER BY created_at DESC)
      FROM (
        SELECT symbol, side, created_at, price_source, realized_lamports
        FROM public.gp_member_paper_fills WHERE member_id = actor
        ORDER BY created_at DESC LIMIT 8
      ) recent
    ), '[]'::jsonb),
    'drafts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'url', destination_url, 'tier', tier, 'views', views, 'paymentEnabled', false
      ) ORDER BY created_at DESC)
      FROM public.gp_member_ad_drafts WHERE member_id = actor
    ), '[]'::jsonb),
    'activity', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('text', action, 'at', created_at) ORDER BY created_at DESC)
      FROM (
        SELECT action, created_at FROM public.gp_member_audit WHERE member_id = actor ORDER BY created_at DESC LIMIT 12
      ) recent
    ), '[]'::jsonb)
  );
END $$;

CREATE FUNCTION public.gp_member_record_paper_fill(
  p_hash text,
  p_symbol text,
  p_side text,
  p_spend_lamports bigint,
  p_sell_micro_units bigint,
  p_token_microusd bigint,
  p_sol_microusd bigint,
  p_price_source text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  actor uuid := public.gp_sol_member_actor(p_hash);
  cash bigint;
  held_units bigint := 0;
  held_cost bigint := 0;
  micro_units bigint;
  proceeds bigint;
  basis bigint;
  realized bigint := 0;
  next_cash bigint;
  next_units bigint;
  next_cost bigint;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_symbol NOT IN ('BTC', 'ETH') OR p_side NOT IN ('buy', 'sell') THEN RAISE EXCEPTION 'Invalid paper order'; END IF;
  IF p_token_microusd IS NULL OR p_token_microusd <= 0 OR p_sol_microusd IS NULL OR p_sol_microusd <= 0 THEN
    RAISE EXCEPTION 'A live price is required';
  END IF;
  IF p_price_source IS NULL OR char_length(p_price_source) < 2 OR char_length(p_price_source) > 80 THEN
    RAISE EXCEPTION 'Price source required';
  END IF;
  PERFORM set_config('gp_member.paper_write', 'on', true);
  INSERT INTO public.gp_member_paper_accounts (member_id, cash_lamports)
  VALUES (actor, 10000000000) ON CONFLICT (member_id) DO NOTHING;
  SELECT cash_lamports INTO cash FROM public.gp_member_paper_accounts WHERE member_id = actor FOR UPDATE;
  SELECT micro_units, cost_lamports INTO held_units, held_cost
  FROM public.gp_member_paper_positions WHERE member_id = actor AND symbol = p_symbol FOR UPDATE;
  held_units := COALESCE(held_units, 0);
  held_cost := COALESCE(held_cost, 0);
  IF p_side = 'buy' THEN
    IF p_spend_lamports IS NULL OR p_spend_lamports <= 0 OR p_spend_lamports > cash THEN
      RAISE EXCEPTION 'That virtual SOL amount is not available';
    END IF;
    micro_units := (p_spend_lamports * p_sol_microusd) / (1000 * p_token_microusd);
    IF micro_units <= 0 THEN RAISE EXCEPTION 'That amount is too small at the current price'; END IF;
    next_cash := cash - p_spend_lamports;
    next_units := held_units + micro_units;
    next_cost := held_cost + p_spend_lamports;
    proceeds := p_spend_lamports;
    realized := 0;
  ELSE
    IF p_sell_micro_units IS NULL OR p_sell_micro_units <= 0 OR held_units <= 0 OR p_sell_micro_units > held_units THEN
      RAISE EXCEPTION 'That paper position is not available';
    END IF;
    proceeds := (p_sell_micro_units * p_token_microusd * 1000) / p_sol_microusd;
    IF proceeds <= 0 THEN RAISE EXCEPTION 'That amount is too small at the current price'; END IF;
    basis := (held_cost * p_sell_micro_units) / held_units;
    realized := proceeds - basis;
    next_cash := cash + proceeds;
    next_units := held_units - p_sell_micro_units;
    next_cost := held_cost - basis;
    micro_units := p_sell_micro_units;
  END IF;
  UPDATE public.gp_member_paper_accounts SET cash_lamports = next_cash WHERE member_id = actor;
  IF next_units = 0 THEN
    DELETE FROM public.gp_member_paper_positions WHERE member_id = actor AND symbol = p_symbol;
  ELSIF held_units = 0 THEN
    INSERT INTO public.gp_member_paper_positions (member_id, symbol, micro_units, cost_lamports)
    VALUES (actor, p_symbol, next_units, next_cost);
  ELSE
    UPDATE public.gp_member_paper_positions
    SET micro_units = next_units, cost_lamports = next_cost
    WHERE member_id = actor AND symbol = p_symbol;
  END IF;
  INSERT INTO public.gp_member_paper_fills (
    member_id, symbol, side, virtual_lamports, micro_units, price_microusd, sol_price_microusd, price_source, realized_lamports
  ) VALUES (
    actor, p_symbol, p_side, proceeds, micro_units, p_token_microusd, p_sol_microusd, p_price_source, realized
  );
  INSERT INTO public.gp_member_audit (member_id, action, detail)
  VALUES (actor, 'paper_fill', jsonb_build_object('symbol', p_symbol, 'side', p_side, 'virtual', true));
  PERFORM set_config('gp_member.paper_write', 'off', true);
  RETURN jsonb_build_object('cashLamports', next_cash::text, 'realizedLamports', realized::text, 'virtual', true, 'paymentEnabled', false);
END $$;

CREATE FUNCTION public.gp_member_save_ad_draft(p_hash text, p_title text, p_url text, p_tier text, p_views integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  actor uuid := public.gp_sol_member_actor(p_hash);
  price bigint;
  draft_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_views <> 500 THEN RAISE EXCEPTION 'Each package is 500 verified views or clicks'; END IF;
  price := CASE p_tier
    WHEN 'seconds5' THEN 6990000
    WHEN 'seconds15' THEN 9990000
    WHEN 'seconds30' THEN 14990000
    WHEN 'seconds60' THEN 24990000
    ELSE NULL
  END;
  IF price IS NULL OR p_title IS NULL OR char_length(btrim(p_title)) < 1 OR char_length(btrim(p_title)) > 80 THEN
    RAISE EXCEPTION 'Choose an approved advertising package';
  END IF;
  IF p_url IS NULL OR p_url !~ '^https://' OR position('@' IN p_url) > 0 OR char_length(p_url) > 200 THEN
    RAISE EXCEPTION 'Use an HTTPS destination without embedded credentials';
  END IF;
  PERFORM set_config('gp_member.paper_write', 'on', true);
  INSERT INTO public.gp_member_ad_drafts (member_id, title, destination_url, tier, views, price_microusd, status, payment_enabled)
  VALUES (actor, btrim(p_title), p_url, p_tier, 500, price, 'draft', false)
  RETURNING id INTO draft_id;
  INSERT INTO public.gp_member_audit (member_id, action, detail)
  VALUES (actor, 'ad_draft', jsonb_build_object('tier', p_tier, 'views', 500, 'paymentEnabled', false));
  PERFORM set_config('gp_member.paper_write', 'off', true);
  RETURN draft_id;
END $$;

CREATE FUNCTION public.gp_member_paper_rankings(p_period text)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH bounds AS (
    SELECT CASE
      WHEN p_period = 'weekly' THEN date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      WHEN p_period = 'monthly' THEN date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      ELSE date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    END AS start_at
  ),
  totals AS (
    SELECT f.member_id, sum(f.realized_lamports) AS realized, count(*)::int AS fills
    FROM public.gp_member_paper_fills f
    CROSS JOIN bounds b
    WHERE f.created_at >= b.start_at AND f.created_at <= now()
    GROUP BY f.member_id
  )
  SELECT COALESCE(jsonb_agg(item ORDER BY realized DESC, handle), '[]'::jsonb)
  FROM (
    SELECT t.realized,
           m.username AS handle,
           jsonb_build_object(
             'handle', m.username,
             'displayName', CASE WHEN m.display_name = '' THEN m.username ELSE m.display_name END,
             'realizedLamports', t.realized::text,
             'fills', t.fills
           ) AS item
    FROM totals t
    JOIN public.gp_sol_members m ON m.id = t.member_id
    ORDER BY t.realized DESC, m.username
    LIMIT 100
  ) ranked;
$$;

REVOKE ALL ON FUNCTION public.gp_member_guard_paper_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_member_workspace(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_member_record_paper_fill(text, text, text, bigint, bigint, bigint, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_member_save_ad_draft(text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_member_paper_rankings(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gp_member_workspace(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gp_member_record_paper_fill(text, text, text, bigint, bigint, bigint, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gp_member_save_ad_draft(text, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.gp_member_paper_rankings(text) TO service_role;

COMMENT ON TABLE public.gp_member_paper_accounts IS
  'Virtual paper cash for one verified gp_sol member. Starts at 10 SOL lamports. Not a withdrawable balance.';
COMMENT ON TABLE public.gp_member_ad_drafts IS
  'Unpaid advertising drafts. 500 views or clicks. payment_enabled cannot be true.';

COMMIT;
