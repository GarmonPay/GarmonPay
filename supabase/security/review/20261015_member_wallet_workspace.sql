-- Review only. Do not apply to production until this file passes security review.
-- Do not move it into supabase/migrations. Do not db push.
-- Does not alter gp_sol_identities, gp_sol_sessions, or gp_sol_member_login.
-- Does not reuse the isolated staging migration or its optional wallet column.
-- Identity is gp_sol_members.id. That row already has one unique wallet_address.
-- These tables do not store a client-supplied wallet address or a staging UUID.
-- Referral relationships stay on gp_sol_members.referred_by. This file pays nothing.
-- Paper SOL is virtual. There is no payment, payout, deposit, or withdrawal column that can be enabled.

BEGIN;
-- Dedicated non-login execution owner. Never grant membership to application roles.
CREATE ROLE gp_member_executor NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
-- Temporary ownership-transfer permissions also support a non-superuser migration owner.
GRANT gp_member_executor TO CURRENT_USER;
GRANT USAGE, CREATE ON SCHEMA public TO gp_member_executor;
GRANT SELECT (id, wallet_address, username, display_name) ON public.gp_sol_members TO gp_member_executor;
GRANT SELECT (token_hash, wallet_address, revoked_at, expires_at) ON public.gp_sol_sessions TO gp_member_executor;
GRANT SELECT (wallet_address, banned) ON public.gp_sol_identities TO gp_member_executor;
CREATE POLICY gp_member_executor_read ON public.gp_sol_members FOR SELECT TO gp_member_executor USING (true);
CREATE POLICY gp_member_executor_read ON public.gp_sol_sessions FOR SELECT TO gp_member_executor USING (true);
CREATE POLICY gp_member_executor_read ON public.gp_sol_identities FOR SELECT TO gp_member_executor USING (true);

CREATE TABLE public.gp_member_price_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 symbol text NOT NULL CHECK (symbol IN ('BTC','ETH','JUP','RAY')),
 asset_id text NOT NULL,
 source text NOT NULL CHECK (source = 'coingecko'),
 token_microusd bigint NOT NULL CHECK (token_microusd > 0 AND token_microusd <= 10000000000000),
 sol_microusd bigint NOT NULL CHECK (sol_microusd > 0 AND sol_microusd <= 10000000000000),
 observed_at timestamptz NOT NULL,
 sol_observed_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((symbol = 'BTC' AND asset_id = 'bitcoin') OR (symbol = 'ETH' AND asset_id = 'ethereum') OR (symbol = 'JUP' AND asset_id = 'jupiter-exchange-solana') OR (symbol = 'RAY' AND asset_id = 'raydium'))
);
CREATE INDEX gp_member_price_symbol_received ON public.gp_member_price_observations(symbol,received_at DESC);
-- Publisher is independently credentialed; service_role cannot publish observations.
CREATE ROLE gp_member_price_publisher NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
GRANT USAGE ON SCHEMA public TO gp_member_price_publisher;
-- PostgREST may assume this role only from a trusted, signed role claim.
-- No anon/authenticated/service_role membership is granted.
DO $api_role$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
   GRANT gp_member_price_publisher TO authenticator;
 END IF;
END $api_role$;
CREATE TABLE public.gp_member_ranking_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id uuid NOT NULL REFERENCES public.gp_sol_members(id),
 eligible boolean NOT NULL,
 reason text NOT NULL CHECK (length(reason) BETWEEN 10 AND 500),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 decided_by text NOT NULL DEFAULT session_user
);
-- Fail closed: eligibility requires an append-only operator decision after wallet/abuse review.
-- No application role may enroll, reset, or rewrite eligibility.


CREATE TABLE public.gp_member_paper_accounts (
  member_id uuid PRIMARY KEY REFERENCES public.gp_sol_members (id),
  cash_lamports bigint NOT NULL CHECK (cash_lamports >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.gp_member_paper_positions (
  member_id uuid NOT NULL REFERENCES public.gp_sol_members (id),
  symbol text NOT NULL CHECK (symbol IN ('BTC', 'ETH', 'JUP', 'RAY')),
  micro_units bigint NOT NULL CHECK (micro_units > 0),
  cost_lamports bigint NOT NULL CHECK (cost_lamports >= 0),
  PRIMARY KEY (member_id, symbol)
);

CREATE TABLE public.gp_member_paper_fills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.gp_sol_members (id),
  symbol text NOT NULL CHECK (symbol IN ('BTC', 'ETH', 'JUP', 'RAY')),
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  virtual_lamports bigint NOT NULL CHECK (virtual_lamports > 0),
  micro_units bigint NOT NULL CHECK (micro_units > 0),
  price_microusd bigint NOT NULL CHECK (price_microusd > 0),
  sol_price_microusd bigint NOT NULL CHECK (sol_price_microusd > 0),
  price_source text NOT NULL CHECK (char_length(price_source) BETWEEN 2 AND 80),
  realized_lamports bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.gp_member_paper_fills
 ADD COLUMN request_id uuid NOT NULL,
 ADD COLUMN observation_id uuid NOT NULL REFERENCES public.gp_member_price_observations(id),
 ADD COLUMN request_payload jsonb NOT NULL,
 ADD COLUMN result jsonb NOT NULL,
 ADD CONSTRAINT gp_member_fill_request_unique UNIQUE(member_id, request_id);

CREATE INDEX gp_member_paper_fills_member_time ON public.gp_member_paper_fills (member_id, created_at);

CREATE TABLE public.gp_member_ad_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.gp_sol_members (id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  destination_url text NOT NULL CHECK (char_length(destination_url) BETWEEN 8 AND 200),
  tier text NOT NULL CHECK (tier IN ('seconds5', 'seconds15', 'seconds30', 'seconds60')),
  views integer NOT NULL CHECK (views = 1000),
  price_microusd bigint NOT NULL CHECK (price_microusd IN (9990000, 14990000, 24990000)),
  status text NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  payment_enabled boolean NOT NULL DEFAULT false CHECK (payment_enabled = false),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.gp_member_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.gp_sol_members (id),
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 40),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.gp_member_paper_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_member_paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_member_paper_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_member_ad_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_member_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_member_paper_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gp_member_paper_positions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gp_member_paper_fills FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gp_member_ad_drafts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gp_member_audit FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.gp_member_paper_accounts, public.gp_member_paper_positions, public.gp_member_paper_fills, public.gp_member_ad_drafts, public.gp_member_audit FROM PUBLIC, anon, authenticated;
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
  IF current_user <> 'gp_member_executor' THEN RAISE EXCEPTION 'Restricted member writer'; END IF;
  IF current_setting('gp_member.paper_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Member records change only through a verified wallet session';
  END IF;
  IF TG_TABLE_NAME = 'gp_member_paper_accounts' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.cash_lamports <> 10000000000 THEN
        RAISE EXCEPTION 'A paper account starts with 10 virtual SOL';
      END IF;
    ELSIF NEW.member_id IS DISTINCT FROM OLD.member_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Paper account identity is immutable';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'gp_member_ad_drafts' THEN
    IF NEW.views <> 1000 OR NEW.payment_enabled OR NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Advertising drafts stay unpaid packages of 1000';
    END IF;
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

CREATE FUNCTION public.gp_member_actor(p_hash text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 SELECT m.id FROM public.gp_sol_sessions s
 JOIN public.gp_sol_identities i USING(wallet_address)
 JOIN public.gp_sol_members m USING(wallet_address)
 WHERE s.token_hash = p_hash AND s.revoked_at IS NULL
 AND s.expires_at > clock_timestamp() AND NOT i.banned;
$$;
REVOKE ALL ON FUNCTION public.gp_member_actor(text) FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.gp_member_actor(text) OWNER TO gp_member_executor;

-- Equity uses immutable fills and contemporaneous observations. No client marks.
-- Missing prices return unavailable, never zero-valued holdings or invented marks.
CREATE FUNCTION public.gp_member_paper_value(p_member uuid, p_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cash numeric := 10000000000; value numeric := 0; basis numeric := 0;
 realized numeric := 0; position record; quote public.gp_member_price_observations%ROWTYPE;
 amount numeric; marks jsonb := '[]'::jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.gp_member_paper_accounts a WHERE a.member_id=p_member AND a.created_at<=p_at)
 THEN RETURN NULL; END IF;
 SELECT 10000000000 + coalesce(sum(CASE f.side WHEN 'buy' THEN -f.virtual_lamports::numeric ELSE f.virtual_lamports::numeric END),0),
 coalesce(sum(f.realized_lamports::numeric),0) INTO cash,realized
 FROM public.gp_member_paper_fills f WHERE f.member_id=p_member AND f.created_at<=p_at;
 FOR position IN SELECT f.symbol,
   sum(CASE f.side WHEN 'buy' THEN f.micro_units::numeric ELSE -f.micro_units::numeric END) units,
   sum(CASE f.side WHEN 'buy' THEN f.virtual_lamports::numeric ELSE -f.virtual_lamports::numeric + f.realized_lamports::numeric END) cost
 FROM public.gp_member_paper_fills f WHERE f.member_id=p_member AND f.created_at<=p_at
 GROUP BY f.symbol LOOP
   IF position.units=0 THEN CONTINUE; END IF;
   SELECT o.* INTO quote FROM public.gp_member_price_observations o
   WHERE o.symbol=position.symbol AND o.observed_at BETWEEN p_at-interval '60 seconds' AND p_at
     AND o.sol_observed_at BETWEEN p_at-interval '60 seconds' AND p_at AND o.received_at<=p_at
   ORDER BY o.received_at DESC,o.id DESC LIMIT 1;
   IF NOT FOUND THEN RETURN jsonb_build_object('available',false,'reason','Fresh marks unavailable for every open position'); END IF;
   amount := trunc(position.units * quote.token_microusd::numeric * 1000 / quote.sol_microusd::numeric);
   -- Conservative net liquidation mark includes modeled execution and costs.
   amount := trunc(amount * 9950 / 10000);
   amount := greatest(0,amount-ceil(amount*175/10000)-5000);
   value := value+amount; basis := basis+position.cost;
   marks := marks || jsonb_build_array(jsonb_build_object('symbol',position.symbol,'observationId',quote.id,
     'valueLamports',amount::text,'costLamports',position.cost::text,'unrealizedLamports',(amount-position.cost)::text));
 END LOOP;
 RETURN jsonb_build_object('available',true,'at',p_at,'equityLamports',(cash+value)::text,
 'cashLamports',cash::text,'unrealizedLamports',(value-basis)::text,'realizedLamports',realized::text,
 'marks',marks,'formula','net-liquidation-sol-v1');
END $$;
REVOKE ALL ON FUNCTION public.gp_member_paper_value(uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.gp_member_paper_value(uuid,timestamptz) OWNER TO gp_member_executor;

CREATE FUNCTION public.gp_member_workspace(p_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE actor uuid := public.gp_member_actor(p_hash);
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  PERFORM set_config('gp_member.paper_write', 'on', true);
  INSERT INTO public.gp_member_paper_accounts (member_id, cash_lamports)
  VALUES (actor, 10000000000)
  ON CONFLICT (member_id) DO NOTHING;
  PERFORM set_config('gp_member.paper_write', 'off', true);
  IF public.gp_member_actor(p_hash) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN jsonb_build_object(
    'ready', true,
    'schemaVersion', 'paper-v1-equity',
    'virtual', true,
    'valuation', public.gp_member_paper_value(actor, clock_timestamp()),
    'history', COALESCE((SELECT jsonb_agg(point ORDER BY at) FROM (
      SELECT f.created_at at, public.gp_member_paper_value(actor,f.created_at) point
      FROM public.gp_member_paper_fills f WHERE f.member_id=actor ORDER BY f.created_at DESC LIMIT 100
    ) points), '[]'::jsonb),
    'fillCount', (SELECT count(*) FROM public.gp_member_paper_fills WHERE member_id=actor),
    'cashLamports', (SELECT cash_lamports::text FROM public.gp_member_paper_accounts WHERE member_id = actor),
    'positions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('symbol', symbol, 'microUnits', micro_units::text, 'costLamports', cost_lamports::text) ORDER BY symbol)
      FROM public.gp_member_paper_positions WHERE member_id = actor
    ), '[]'::jsonb),
    'fills', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'symbol', symbol, 'side', side, 'at', created_at, 'priceSource', price_source, 'realizedLamports', realized_lamports::text, 'virtualLamports', virtual_lamports::text, 'microUnits', micro_units::text, 'priceMicrousd', price_microusd::text, 'solPriceMicrousd', sol_price_microusd::text
      ) ORDER BY created_at DESC)
      FROM (
        SELECT id, symbol, side, created_at, price_source, realized_lamports, virtual_lamports, micro_units, price_microusd, sol_price_microusd
        FROM public.gp_member_paper_fills WHERE member_id = actor
        ORDER BY created_at DESC, id DESC LIMIT 100
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

-- A lost-response retry can recover its committed result even during a price outage.
CREATE FUNCTION public.gp_member_paper_request(p_hash text,p_request_id uuid,p_symbol text,p_side text,p_spend_lamports bigint,p_sell_micro_units bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := public.gp_member_actor(p_hash); previous public.gp_member_paper_fills%ROWTYPE;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 SELECT f.* INTO previous FROM public.gp_member_paper_fills f WHERE f.member_id=actor AND f.request_id=p_request_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF previous.request_payload IS DISTINCT FROM jsonb_build_array(p_symbol,p_side,p_spend_lamports,p_sell_micro_units)
 THEN RAISE EXCEPTION 'Request ID reused for a different order'; END IF;
 RETURN previous.result;
END $$;
REVOKE ALL ON FUNCTION public.gp_member_paper_request(text,uuid,text,text,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gp_member_paper_request(text,uuid,text,text,bigint,bigint) TO service_role;
ALTER FUNCTION public.gp_member_paper_request(text,uuid,text,text,bigint,bigint) OWNER TO gp_member_executor;

CREATE FUNCTION public.gp_member_paper_history(p_hash text,p_before_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid:=public.gp_member_actor(p_hash); result jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 IF (p_before_at IS NULL) <> (p_before_id IS NULL) THEN RAISE EXCEPTION 'Complete history cursor required'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'symbol',f.symbol,'side',f.side,'at',f.created_at,
 'virtualLamports',f.virtual_lamports::text,'microUnits',f.micro_units::text,'priceMicrousd',f.price_microusd::text,
 'solPriceMicrousd',f.sol_price_microusd::text,'priceSource',f.price_source,'realizedLamports',f.realized_lamports::text)
 ORDER BY f.created_at DESC,f.id DESC),'[]'::jsonb) INTO result
 FROM (SELECT * FROM public.gp_member_paper_fills WHERE member_id=actor
 AND (p_before_at IS NULL OR (created_at,id)<(p_before_at,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT 100) f;
 IF public.gp_member_actor(p_hash) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.gp_member_paper_history(text,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gp_member_paper_history(text,timestamptz,uuid) TO service_role;
ALTER FUNCTION public.gp_member_paper_history(text,timestamptz,uuid) OWNER TO gp_member_executor;

CREATE FUNCTION public.gp_member_record_paper_fill(
  p_hash text,
  p_symbol text,
  p_side text,
  p_spend_lamports bigint,
  p_sell_micro_units bigint,
  p_request_id uuid,
  p_observation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := public.gp_member_actor(p_hash);
  cash bigint;
  held_units bigint := 0;
  held_cost bigint := 0;
  v_micro_units bigint;
  p_token_microusd bigint;
  p_sol_microusd bigint;
  p_price_source text;
  observation public.gp_member_price_observations%ROWTYPE;
  previous public.gp_member_paper_fills%ROWTYPE;
  payload jsonb;
  response jsonb;
  units_numeric numeric;
  proceeds_numeric numeric;
  proceeds bigint;
  basis bigint;
  realized bigint := 0;
  next_cash bigint;
  next_units bigint;
  next_cost bigint;
  trade_budget numeric;
  fee_lamports bigint;
  gross_proceeds numeric;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_symbol NOT IN ('BTC', 'ETH', 'JUP', 'RAY') OR p_side NOT IN ('buy', 'sell') THEN RAISE EXCEPTION 'Invalid paper order'; END IF;
  IF p_request_id IS NULL OR p_observation_id IS NULL THEN RAISE EXCEPTION 'Request and observation required'; END IF;
  IF p_symbol IS NULL OR p_side IS NULL THEN RAISE EXCEPTION 'Invalid paper order'; END IF;
  IF (p_side = 'buy' AND p_sell_micro_units IS NOT NULL) OR (p_side = 'sell' AND p_spend_lamports IS NOT NULL) THEN RAISE EXCEPTION 'Ambiguous order'; END IF;
  payload := jsonb_build_array(p_symbol, p_side, p_spend_lamports, p_sell_micro_units);
  PERFORM set_config('gp_member.paper_write', 'on', true);
  INSERT INTO public.gp_member_paper_accounts (member_id, cash_lamports)
  VALUES (actor, 10000000000) ON CONFLICT (member_id) DO NOTHING;
  SELECT cash_lamports INTO cash FROM public.gp_member_paper_accounts WHERE member_id = actor FOR UPDATE;
  -- Account lock serializes both different orders and duplicate retries for this member.
  -- Recheck session after waiting for the account lock, using wall time rather than transaction start.
  IF public.gp_member_actor(p_hash) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT f.* INTO previous FROM public.gp_member_paper_fills f WHERE f.member_id = actor AND f.request_id = p_request_id;
  IF FOUND THEN
    IF previous.request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Request ID reused for a different order'; END IF;
    PERFORM set_config('gp_member.paper_write', 'off', true);
    RETURN previous.result;
  END IF;
  IF (SELECT count(*) FROM public.gp_member_paper_fills f WHERE f.member_id=actor AND f.created_at>clock_timestamp()-interval '1 minute') >= 30 THEN
    RAISE EXCEPTION 'Paper order rate limit; wait one minute';
  END IF;
  SELECT o.* INTO observation FROM public.gp_member_price_observations o WHERE o.id = p_observation_id AND o.symbol = p_symbol;
  IF NOT FOUND OR observation.observed_at < clock_timestamp() - interval '60 seconds'
    OR observation.sol_observed_at < clock_timestamp() - interval '60 seconds'
    OR observation.observed_at > clock_timestamp() OR observation.sol_observed_at > clock_timestamp()
    OR observation.received_at < clock_timestamp() - interval '60 seconds' THEN
    RAISE EXCEPTION 'Fresh verified price observation required';
  END IF;
  p_token_microusd := observation.token_microusd;
  p_sol_microusd := observation.sol_microusd;
  p_price_source := observation.source;
  SELECT pos.micro_units, pos.cost_lamports INTO held_units, held_cost
  FROM public.gp_member_paper_positions pos WHERE pos.member_id = actor AND pos.symbol = p_symbol FOR UPDATE;
  held_units := COALESCE(held_units, 0);
  held_cost := COALESCE(held_cost, 0);
  IF p_side = 'buy' THEN
    IF p_spend_lamports IS NULL OR p_spend_lamports <= 0 OR p_spend_lamports > 1000000000000 OR p_spend_lamports > cash THEN
      RAISE EXCEPTION 'That virtual SOL amount is not available';
    END IF;
    -- paper-v1: inclusive 175 bps modeled trading cost, 50 bps adverse
    -- execution and 5,000 virtual lamports network cost. No real fee is charged.
    trade_budget := p_spend_lamports::numeric - 5000;
    fee_lamports := ceil(greatest(trade_budget, 0) * 175 / 10000)::bigint;
    trade_budget := trade_budget - fee_lamports;
    units_numeric := trunc((trade_budget * p_sol_microusd::numeric * 10000) / (numeric '1000' * p_token_microusd::numeric * 10050));
    IF units_numeric <= 0 OR units_numeric > 9223372036854775807 THEN RAISE EXCEPTION 'That amount is too small at the current price'; END IF;
    v_micro_units := units_numeric::bigint;
    next_cash := cash - p_spend_lamports;
    next_units := held_units + v_micro_units;
    next_cost := held_cost + p_spend_lamports;
    proceeds := p_spend_lamports;
    realized := 0;
  ELSE
    IF p_sell_micro_units IS NULL OR p_sell_micro_units <= 0 OR p_sell_micro_units > 1000000000000 OR held_units <= 0 OR p_sell_micro_units > held_units THEN
      RAISE EXCEPTION 'That paper position is not available';
    END IF;
    proceeds_numeric := trunc((p_sell_micro_units::numeric * p_token_microusd::numeric * numeric '1000') / p_sol_microusd::numeric);
    IF proceeds_numeric <= 0 OR proceeds_numeric > 1000000000000 THEN RAISE EXCEPTION 'That amount is too small at the current price'; END IF;
    gross_proceeds := proceeds_numeric;
    proceeds_numeric := trunc(proceeds_numeric * 9950 / 10000);
    fee_lamports := ceil(proceeds_numeric * 175 / 10000)::bigint;
    proceeds_numeric := proceeds_numeric - fee_lamports - 5000;
    IF proceeds_numeric <= 0 THEN RAISE EXCEPTION 'Sale is too small after virtual costs'; END IF;
    proceeds := proceeds_numeric::bigint;
    basis := trunc((held_cost::numeric * p_sell_micro_units::numeric) / held_units::numeric)::bigint;
    realized := proceeds - basis;
    next_cash := cash + proceeds;
    next_units := held_units - p_sell_micro_units;
    next_cost := held_cost - basis;
    v_micro_units := p_sell_micro_units;
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
  response := jsonb_build_object('cashLamports', next_cash::text, 'realizedLamports', realized::text, 'virtual', true, 'paymentEnabled', false, 'simulationModel', 'paper-v1', 'feeLamports', fee_lamports::text, 'networkLamports', '5000', 'adverseSlippageBps', 50);
  INSERT INTO public.gp_member_paper_fills (
    request_id, observation_id, request_payload, result, member_id, symbol, side, virtual_lamports, micro_units, price_microusd, sol_price_microusd, price_source, realized_lamports
  ) VALUES (
    p_request_id, p_observation_id, payload, response, actor, p_symbol, p_side, proceeds, v_micro_units, p_token_microusd, p_sol_microusd, p_price_source, realized
  );
  INSERT INTO public.gp_member_audit (member_id, action, detail)
  VALUES (actor, 'paper_fill', jsonb_build_object('symbol', p_symbol, 'side', p_side, 'virtual', true, 'requestId', p_request_id, 'observationId', p_observation_id));
  PERFORM set_config('gp_member.paper_write', 'off', true);
  RETURN response;
END $$;

CREATE FUNCTION public.gp_member_save_ad_draft(p_hash text, p_title text, p_url text, p_tier text, p_views integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := public.gp_member_actor(p_hash);
  price bigint;
  draft_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_views IS DISTINCT FROM 1000 THEN RAISE EXCEPTION 'Each package is 1000 verified views or clicks'; END IF;
  price := CASE p_tier
    WHEN 'seconds5' THEN 9990000
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
  VALUES (actor, btrim(p_title), p_url, p_tier, 1000, price, 'draft', false)
  RETURNING id INTO draft_id;
  INSERT INTO public.gp_member_audit (member_id, action, detail)
  VALUES (actor, 'ad_draft', jsonb_build_object('tier', p_tier, 'views', 1000, 'paymentEnabled', false));
  PERFORM set_config('gp_member.paper_write', 'off', true);
  RETURN draft_id;
END $$;

CREATE FUNCTION public.gp_member_rankings_at(p_start timestamptz,p_end timestamptz)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH bounds AS (SELECT p_start AS start_at  ), eligible AS (
    SELECT a.member_id, a.created_at, b.start_at FROM public.gp_member_paper_accounts a CROSS JOIN bounds b
    JOIN LATERAL (SELECT d.eligible,d.decided_at FROM public.gp_member_ranking_decisions d
      WHERE d.member_id=a.member_id AND d.decided_at<=p_end ORDER BY d.decided_at DESC,d.id DESC LIMIT 1) e ON e.eligible
    WHERE a.created_at<=e.decided_at AND (e.decided_at<=b.start_at OR (a.created_at>=b.start_at AND NOT EXISTS (SELECT 1 FROM public.gp_member_paper_fills f WHERE f.member_id=a.member_id AND f.created_at<e.decided_at)))
  ), valuations AS (
    SELECT e.member_id,public.gp_member_paper_value(e.member_id,p_end) ending,
      CASE WHEN e.created_at>=e.start_at THEN jsonb_build_object('available',true,'equityLamports','10000000000')
      ELSE public.gp_member_paper_value(e.member_id,e.start_at) END beginning,
      (SELECT count(*) FROM public.gp_member_paper_fills f WHERE f.member_id=e.member_id AND f.created_at>=e.start_at AND f.created_at<=p_end) fills
    FROM eligible e
  ), scores AS (
    SELECT v.*,((v.ending->>'equityLamports')::numeric / (v.beginning->>'equityLamports')::numeric - 1)*10000 return_bps
    FROM valuations v WHERE (v.ending->>'available')::boolean AND (v.beginning->>'available')::boolean
      AND (v.beginning->>'equityLamports')::numeric>0 AND v.fills>0
  )
  SELECT coalesce(jsonb_agg(item ORDER BY return_bps DESC,member_id),'[]'::jsonb) FROM (
    SELECT s.return_bps,s.member_id,jsonb_build_object('memberId',s.member_id,'handle',m.username,
      'displayName',coalesce(nullif(m.display_name,''),m.username),'realizedLamports',s.ending->>'realizedLamports',
      'unrealizedLamports',s.ending->>'unrealizedLamports','equityLamports',s.ending->>'equityLamports',
      'returnBps',s.return_bps::text,'fills',s.fills,'formula','net-liquidation-sol-v1') item
    FROM scores s JOIN public.gp_sol_members m ON m.id=s.member_id
    JOIN public.gp_sol_identities i ON i.wallet_address=m.wallet_address AND NOT i.banned
    ORDER BY s.return_bps DESC,s.member_id LIMIT 100
  ) ranked;
$$;
REVOKE ALL ON FUNCTION public.gp_member_rankings_at(timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.gp_member_rankings_at(timestamptz,timestamptz) OWNER TO gp_member_executor;

CREATE FUNCTION public.gp_member_paper_rankings(p_period text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.gp_member_rankings_at(CASE WHEN p_period='weekly' THEN date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
 WHEN p_period='monthly' THEN date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
 ELSE date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' END, clock_timestamp());
$$;

-- Closed competition snapshots preserve immutable IDs, period scores and display
-- labels at close. No application role can finalize, edit or delete these records.
CREATE TABLE public.gp_member_paper_rank_archives (
 period text NOT NULL CHECK(period IN ('daily','weekly','monthly')),
 start_at timestamptz NOT NULL, end_at timestamptz NOT NULL CHECK(end_at>start_at),
 rows jsonb NOT NULL CHECK(jsonb_typeof(rows)='array'),
 formula text NOT NULL DEFAULT 'net-liquidation-sol-v1' CHECK(formula='net-liquidation-sol-v1'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by text NOT NULL DEFAULT session_user,
 PRIMARY KEY(period,start_at)
);
ALTER TABLE public.gp_member_paper_rank_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_member_paper_rank_archives FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.gp_member_paper_rank_archives FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.gp_member_paper_rank_archives TO gp_member_executor;
CREATE POLICY executor_access ON public.gp_member_paper_rank_archives TO gp_member_executor USING(true) WITH CHECK(true);
CREATE FUNCTION public.gp_member_freeze_rankings(p_period text,p_start timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cutoff timestamptz; duration interval; rankings jsonb; asset text; boundary timestamptz;
BEGIN
 IF p_period NOT IN ('daily','weekly','monthly') OR p_start IS NULL THEN RAISE EXCEPTION 'Invalid period'; END IF;
 IF p_start IS DISTINCT FROM (date_trunc(CASE p_period WHEN 'daily' THEN 'day' WHEN 'weekly' THEN 'week' ELSE 'month' END,p_start AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') THEN RAISE EXCEPTION 'UTC period boundary required'; END IF;
 duration := CASE p_period WHEN 'daily' THEN interval '1 day' WHEN 'weekly' THEN interval '7 days' ELSE interval '1 month' END;
 cutoff := ((p_start AT TIME ZONE 'UTC') + duration) AT TIME ZONE 'UTC';
 IF cutoff>clock_timestamp() THEN RAISE EXCEPTION 'Period is not closed'; END IF;
 -- Fail closed until every supported asset has an archived contemporaneous mark
 -- at both cutoffs. An operator must provision/monitor observation collection.
 FOREACH boundary IN ARRAY ARRAY[p_start,cutoff] LOOP
  FOREACH asset IN ARRAY ARRAY['BTC','ETH','JUP','RAY'] LOOP
   IF NOT EXISTS (SELECT 1 FROM public.gp_member_price_observations o WHERE o.symbol=asset
    AND o.observed_at BETWEEN boundary-interval '60 seconds' AND boundary
    AND o.sol_observed_at BETWEEN boundary-interval '60 seconds' AND boundary AND o.received_at<=boundary)
   THEN RAISE EXCEPTION 'Complete archived boundary marks required'; END IF;
  END LOOP;
 END LOOP;
 rankings := public.gp_member_rankings_at(p_start,cutoff);
 INSERT INTO public.gp_member_paper_rank_archives(period,start_at,end_at,rows) VALUES(p_period,p_start,cutoff,rankings);
END $$;
REVOKE ALL ON FUNCTION public.gp_member_freeze_rankings(text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.gp_member_freeze_rankings(text,timestamptz) OWNER TO gp_member_executor;
GRANT EXECUTE ON FUNCTION public.gp_member_freeze_rankings(text,timestamptz) TO CURRENT_USER;
CREATE FUNCTION public.gp_member_rank_archive(p_period text,p_start timestamptz)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 SELECT jsonb_build_object('period',period,'startAt',start_at,'endAt',end_at,'rows',rows,'formula',formula,'finalizedAt',created_at)
 FROM public.gp_member_paper_rank_archives WHERE period=p_period AND start_at=p_start;
$$;
REVOKE ALL ON FUNCTION public.gp_member_rank_archive(text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gp_member_rank_archive(text,timestamptz) TO service_role;
ALTER FUNCTION public.gp_member_rank_archive(text,timestamptz) OWNER TO gp_member_executor;

REVOKE ALL ON FUNCTION public.gp_member_guard_paper_write() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gp_member_workspace(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_member_record_paper_fill(text, text, text, bigint, bigint, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_member_save_ad_draft(text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_member_paper_rankings(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gp_member_workspace(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gp_member_record_paper_fill(text, text, text, bigint, bigint, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gp_member_save_ad_draft(text, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.gp_member_paper_rankings(text) TO service_role;


-- All defaults are explicitly revoked, including Supabase service-role default grants.
DO $permissions$
DECLARE t text; f regprocedure;
BEGIN
 FOR t IN SELECT unnest(ARRAY['gp_member_paper_accounts','gp_member_paper_positions','gp_member_paper_fills','gp_member_ad_drafts','gp_member_audit','gp_member_price_observations','gp_member_ranking_decisions']) LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
   EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
   EXECUTE format('GRANT SELECT ON public.%I TO gp_member_executor', t);
   EXECUTE format('CREATE POLICY executor_access ON public.%I TO gp_member_executor USING (true) WITH CHECK (true)', t);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('gp_member_workspace','gp_member_record_paper_fill','gp_member_save_ad_draft','gp_member_paper_rankings') LOOP
   EXECUTE format('ALTER FUNCTION %s OWNER TO gp_member_executor', f);
 END LOOP;
END $permissions$;
GRANT INSERT, UPDATE ON public.gp_member_paper_accounts TO gp_member_executor;
GRANT INSERT, UPDATE, DELETE ON public.gp_member_paper_positions TO gp_member_executor;
GRANT INSERT ON public.gp_member_paper_fills, public.gp_member_ad_drafts, public.gp_member_audit TO gp_member_executor;
GRANT INSERT ON public.gp_member_price_observations TO gp_member_price_publisher;
CREATE POLICY publisher_insert ON public.gp_member_price_observations FOR INSERT TO gp_member_price_publisher WITH CHECK (
 observed_at BETWEEN clock_timestamp() - interval '60 seconds' AND clock_timestamp()
 AND sol_observed_at BETWEEN clock_timestamp() - interval '60 seconds' AND clock_timestamp()
);
CREATE FUNCTION public.gp_member_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Append-only security record'; END $$;
REVOKE ALL ON FUNCTION public.gp_member_immutable() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.gp_member_price_observations FOR EACH ROW EXECUTE FUNCTION public.gp_member_immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.gp_member_ranking_decisions FOR EACH ROW EXECUTE FUNCTION public.gp_member_immutable();
-- Stamp privileged append operations in the database; callers cannot backdate eligibility.
CREATE FUNCTION public.gp_member_stamp_record() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_TABLE_NAME = 'gp_member_price_observations' THEN
   NEW.received_at := clock_timestamp();
 ELSIF TG_TABLE_NAME = 'gp_member_ranking_decisions' THEN
   NEW.decided_at := clock_timestamp();
   NEW.decided_by := session_user;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.gp_member_stamp_record() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER stamp_record BEFORE INSERT ON public.gp_member_price_observations FOR EACH ROW EXECUTE FUNCTION public.gp_member_stamp_record();
CREATE TRIGGER stamp_record BEFORE INSERT ON public.gp_member_ranking_decisions FOR EACH ROW EXECUTE FUNCTION public.gp_member_stamp_record();
DO $truncate_guards$
DECLARE t text;
BEGIN
 FOR t IN SELECT unnest(ARRAY['gp_member_paper_accounts','gp_member_paper_positions','gp_member_paper_fills','gp_member_ad_drafts','gp_member_audit','gp_member_price_observations','gp_member_ranking_decisions']) LOOP
   EXECUTE format('CREATE TRIGGER no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.gp_member_immutable()', t);
 END LOOP;
END $truncate_guards$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.gp_member_paper_rank_archives FOR EACH ROW EXECUTE FUNCTION public.gp_member_immutable();
CREATE TRIGGER no_truncate BEFORE TRUNCATE ON public.gp_member_paper_rank_archives FOR EACH STATEMENT EXECUTE FUNCTION public.gp_member_immutable();
ALTER TABLE public.gp_member_ad_drafts ADD CHECK (price_microusd = CASE tier
 WHEN 'seconds5' THEN 9990000 WHEN 'seconds15' THEN 9990000 WHEN 'seconds30' THEN 14990000 WHEN 'seconds60' THEN 24990000 END);

COMMENT ON TABLE public.gp_member_paper_accounts IS
  'Virtual paper cash for one verified gp_sol member. Starts at 10 SOL lamports. Not a withdrawable balance.';
COMMENT ON TABLE public.gp_member_ad_drafts IS
  'Unpaid advertising drafts. 1000 views or clicks. payment_enabled cannot be true.';

REVOKE CREATE ON SCHEMA public FROM gp_member_executor;
REVOKE gp_member_executor FROM CURRENT_USER;
COMMIT;
