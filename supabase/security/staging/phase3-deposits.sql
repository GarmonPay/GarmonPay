-- LOCAL SYNTHETIC STAGING ONLY. Outside the production migration queue.
-- Apply on top of the unapplied SOL foundation, never to legacy balances.
BEGIN;
CREATE TABLE public.gp_sol_settlement_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_wallet text NOT NULL REFERENCES public.gp_sol_identities,
 source_wallet text NOT NULL, destination_wallet text NOT NULL, genesis_hash text NOT NULL,
 amount_lamports bigint NOT NULL CHECK(amount_lamports>0), minimum_slot bigint NOT NULL CHECK(minimum_slot>=0),
 treasury_account uuid NOT NULL REFERENCES public.gp_sol_accounts, liability_account uuid NOT NULL REFERENCES public.gp_sol_accounts,
 authorization_reference text NOT NULL CHECK(length(authorization_reference) BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','posted')),
 CHECK(source_wallet=actor_wallet AND source_wallet<>destination_wallet AND treasury_account<>liability_account),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '5 minutes 5 seconds')
);
CREATE TABLE public.gp_sol_settlement_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), intent_id uuid UNIQUE NOT NULL REFERENCES public.gp_sol_settlement_intents,
 genesis_hash text NOT NULL, signature text NOT NULL, instruction_index integer NOT NULL CHECK(instruction_index>=0),
 finalized_slot bigint NOT NULL CHECK(finalized_slot>=0), block_time timestamptz NOT NULL,
 amount_lamports bigint NOT NULL CHECK(amount_lamports>0), source_wallet text NOT NULL, destination_wallet text NOT NULL,
 journal_id uuid UNIQUE NOT NULL REFERENCES public.gp_sol_journals DEFERRABLE INITIALLY DEFERRED,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(genesis_hash,signature,instruction_index)
);
CREATE TRIGGER gp_sol_receipts_immutable BEFORE UPDATE OR DELETE ON public.gp_sol_settlement_receipts FOR EACH ROW EXECUTE FUNCTION public.gp_sol_immutable();
CREATE FUNCTION public.gp_sol_intent_immutable_binding() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Settlement intent history is immutable'; END IF;
 IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR OLD.status<>'pending' OR NEW.status<>'posted' THEN RAISE EXCEPTION 'Settlement authorization binding is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gp_sol_intent_binding BEFORE UPDATE OR DELETE ON public.gp_sol_settlement_intents FOR EACH ROW EXECUTE FUNCTION public.gp_sol_intent_immutable_binding();
-- Trusted server must decode real finalized RPC evidence and call the TS validator
-- before this function. SQL fields are not themselves proof of chain finality.
CREATE FUNCTION public.gp_sol_post_verified_deposit(
 p_intent uuid,p_genesis text,p_signature text,p_instruction integer,p_slot bigint,p_block_time timestamptz,
 p_source text,p_destination text,p_amount bigint,p_finalized boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE intent public.gp_sol_settlement_intents; prior public.gp_sol_settlement_receipts; journal uuid;
BEGIN
 SELECT * INTO intent FROM public.gp_sol_settlement_intents WHERE id=p_intent FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Settlement intent unavailable'; END IF;
 IF p_finalized IS DISTINCT FROM true OR p_signature IS NULL OR length(p_signature)<32 OR length(p_signature)>100 OR p_instruction IS NULL OR p_instruction<0 OR p_slot IS NULL OR p_block_time IS NULL THEN RAISE EXCEPTION 'Complete finalized evidence required'; END IF;
 IF p_genesis IS DISTINCT FROM intent.genesis_hash OR p_source IS DISTINCT FROM intent.source_wallet OR p_destination IS DISTINCT FROM intent.destination_wallet OR p_amount IS DISTINCT FROM intent.amount_lamports OR p_slot<intent.minimum_slot OR p_block_time<intent.created_at OR p_block_time>intent.expires_at THEN RAISE EXCEPTION 'Settlement evidence conflicts with authorization'; END IF;
 SELECT * INTO prior FROM public.gp_sol_settlement_receipts WHERE intent_id=p_intent;
 IF FOUND THEN
  IF prior.genesis_hash IS DISTINCT FROM p_genesis OR prior.signature IS DISTINCT FROM p_signature OR prior.instruction_index IS DISTINCT FROM p_instruction OR prior.finalized_slot IS DISTINCT FROM p_slot OR prior.block_time IS DISTINCT FROM p_block_time THEN RAISE EXCEPTION 'Settlement replay conflicts'; END IF;
  RETURN prior.journal_id;
 END IF;
 IF intent.status<>'pending' OR intent.expires_at<=now() THEN RAISE EXCEPTION 'Pending unexpired authorization required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.gp_sol_identities WHERE wallet_address=intent.actor_wallet AND NOT banned) THEN RAISE EXCEPTION 'Wallet authorization unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.gp_sol_accounts WHERE id=intent.treasury_account AND category='treasury_asset' AND owner_wallet IS NULL AND chain_wallet=intent.destination_wallet) OR NOT EXISTS(SELECT 1 FROM public.gp_sol_accounts WHERE id=intent.liability_account AND category='member_liability' AND owner_wallet=intent.actor_wallet) THEN RAISE EXCEPTION 'Account authorization mismatch'; END IF;
 journal:=gen_random_uuid();
 INSERT INTO public.gp_sol_settlement_receipts(intent_id,genesis_hash,signature,instruction_index,finalized_slot,block_time,amount_lamports,source_wallet,destination_wallet,journal_id)
 VALUES(p_intent,p_genesis,p_signature,p_instruction,p_slot,p_block_time,p_amount,p_source,p_destination,journal);
 INSERT INTO public.gp_sol_journals(id,idempotency_key,event_type,debit_account,credit_account,amount_lamports,chain_signature,metadata)
 VALUES(journal,'deposit:'||p_intent::text,'gp_sol_deposit',intent.treasury_account,intent.liability_account,p_amount,p_signature,jsonb_build_object('intent_id',p_intent,'actor_wallet',intent.actor_wallet,'authorization_reference',intent.authorization_reference,'instruction_index',p_instruction,'genesis_hash',p_genesis));
 UPDATE public.gp_sol_settlement_intents SET status='posted' WHERE id=p_intent;
 RETURN journal;
END $$;
CREATE VIEW public.gp_sol_deposit_reconciliation WITH(security_invoker=true) AS
 SELECT
  (SELECT count(*) FROM public.gp_sol_settlement_receipts)::text AS receipt_count,
  (SELECT count(*) FROM public.gp_sol_journals WHERE event_type='gp_sol_deposit')::text AS journal_count,
  (SELECT count(*) FROM public.gp_sol_settlement_intents WHERE status='posted')::text AS posted_intent_count,
  (SELECT count(*) FROM public.gp_sol_journals j LEFT JOIN public.gp_sol_settlement_receipts r ON r.journal_id=j.id WHERE j.event_type='gp_sol_deposit' AND r.id IS NULL)::text AS orphan_journal_count,
  (SELECT count(*) FROM public.gp_sol_settlement_receipts r LEFT JOIN public.gp_sol_journals j ON j.id=r.journal_id JOIN public.gp_sol_settlement_intents i ON i.id=r.intent_id WHERE j.id IS NULL OR j.event_type<>'gp_sol_deposit' OR j.amount_lamports<>r.amount_lamports OR j.debit_account<>i.treasury_account OR j.credit_account<>i.liability_account OR j.chain_signature<>r.signature OR i.status<>'posted')::text AS mismatch_count;
ALTER TABLE public.gp_sol_settlement_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_sol_settlement_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gp_sol_settlement_intents,public.gp_sol_settlement_receipts,public.gp_sol_deposit_reconciliation FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.gp_sol_settlement_intents,public.gp_sol_settlement_receipts,public.gp_sol_deposit_reconciliation FROM service_role;
GRANT SELECT,INSERT,UPDATE ON public.gp_sol_settlement_intents TO service_role;
GRANT SELECT,INSERT ON public.gp_sol_settlement_receipts TO service_role;
GRANT SELECT ON public.gp_sol_deposit_reconciliation TO service_role;
REVOKE ALL ON FUNCTION public.gp_sol_intent_immutable_binding(),public.gp_sol_post_verified_deposit(uuid,text,text,integer,bigint,timestamptz,text,text,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gp_sol_post_verified_deposit(uuid,text,text,integer,bigint,timestamptz,text,text,bigint,boolean) TO service_role;
COMMIT;
