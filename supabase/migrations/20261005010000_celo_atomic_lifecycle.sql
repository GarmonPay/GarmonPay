-- Additive C-Lo lifecycle repair. No existing rows/balances are rewritten.
BEGIN;
ALTER TABLE public.celo_rounds ADD COLUMN IF NOT EXISTS entry_snapshot jsonb;
ALTER TABLE public.celo_rounds ADD COLUMN IF NOT EXISTS settlement_snapshot jsonb;
ALTER TABLE public.celo_rounds ADD COLUMN IF NOT EXISTS roll_seq integer NOT NULL DEFAULT 0;
ALTER TABLE public.celo_rounds ADD COLUMN IF NOT EXISTS pending_roll_id uuid;
ALTER TABLE public.celo_rounds ADD COLUMN IF NOT EXISTS pending_roll_payload jsonb;
ALTER TABLE public.celo_rounds ADD COLUMN IF NOT EXISTS pending_roll_user_id uuid;
ALTER TABLE public.celo_rounds ADD COLUMN IF NOT EXISTS last_roll_dice integer[];
ALTER TABLE public.celo_rounds ADD COLUMN IF NOT EXISTS last_roll_user_id uuid;
ALTER TABLE public.celo_rounds ADD COLUMN IF NOT EXISTS last_roll_name text;
ALTER TABLE public.celo_rounds ADD COLUMN IF NOT EXISTS last_roll_point integer;
ALTER TABLE public.celo_rounds ADD COLUMN IF NOT EXISTS last_roll_outcome text;
ALTER TABLE public.celo_side_bets ADD COLUMN IF NOT EXISTS creator_debit_ref text;
ALTER TABLE public.celo_side_bets ADD COLUMN IF NOT EXISTS acceptor_debit_ref text;
CREATE TABLE IF NOT EXISTS public.celo_action_receipts (
 request_id uuid PRIMARY KEY, user_id uuid NOT NULL, room_id uuid, action text NOT NULL,
 input_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.celo_action_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.celo_action_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.celo_action_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.celo_wallet_move(p_user uuid,p_amount integer,p_reference text,p_type text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb;
BEGIN
 IF p_amount=0 THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM coin_transactions WHERE reference=p_reference) THEN RAISE EXCEPTION 'Duplicate C-Lo ledger reference'; END IF;
 IF p_amount<0 THEN
  UPDATE users SET gpay_coins=gpay_coins+p_amount WHERE id=p_user AND gpay_coins>=-p_amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient GPC balance'; END IF;
  INSERT INTO coin_transactions(user_id,type,gold_coins,gpay_coins,description,reference) VALUES(p_user,p_type,0,p_amount,'C-Lo escrow transfer',p_reference);
 ELSE
  v_result:=credit_coins_with_ledger(p_user,0,p_amount,p_type,'C-Lo escrow transfer',p_reference);
  IF (v_result->>'success') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION '%',COALESCE(v_result->>'message','C-Lo credit failed'); END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.celo_wallet_move(uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.celo_wallet_move(uuid,integer,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.celo_room_action_atomic(p_user uuid,p_room uuid,p_action text,p_request uuid,p_input jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r celo_rooms%ROWTYPE; a celo_rounds%ROWTYPE; p celo_room_players%ROWTYPE;
 v_receipt celo_action_receipts%ROWTYPE; v_hash text; v_response jsonb; v_amount integer; v_min integer; v_seat integer; v_count integer; v_prize integer; v_round integer; v_name text; v_role text;
BEGIN
 IF p_user IS NULL OR p_request IS NULL THEN RAISE EXCEPTION 'Authenticated user and request id required'; END IF;
 -- Serialize request retries. Game actions use table -> round -> wallet lock order.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 PERFORM 1 FROM users WHERE id=p_user;
 IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
 v_hash:=md5(COALESCE(p_room::text,'')||p_action||p_input::text);
 SELECT * INTO v_receipt FROM celo_action_receipts WHERE request_id=p_request;
 IF FOUND THEN
  IF v_receipt.user_id<>p_user OR v_receipt.action<>p_action OR v_receipt.input_hash<>v_hash THEN RAISE EXCEPTION 'Request id belongs to a different action'; END IF;
  RETURN v_receipt.response || jsonb_build_object('idempotent',true);
 END IF;
 IF p_action='create' THEN
  v_min:=(p_input->>'minimum_entry_sc')::integer;v_amount:=(p_input->>'starting_bank_sc')::integer;v_name:=trim(p_input->>'name');v_count:=(p_input->>'max_players')::integer;
  IF v_min IS NULL OR v_min<500 OR v_amount IS NULL OR v_amount<v_min OR v_amount%v_min<>0 OR v_count IS NULL OR v_count NOT IN(2,4,6,10) OR COALESCE(v_name,'')='' THEN RAISE EXCEPTION 'Invalid room settings'; END IF;
  PERFORM celo_wallet_move(p_user,-v_amount,'celo:create:'||p_request,'celo_entry');
  INSERT INTO celo_rooms(name,creator_id,banker_id,status,room_type,max_players,min_bet_cents,max_bet_cents,minimum_entry_sc,current_bank_sc,current_bank_cents,platform_fee_pct,last_activity)
  VALUES(v_name,p_user,p_user,'waiting','public',v_count,v_min,GREATEST(10000,v_amount*4),v_min,v_amount,v_amount,10,now()) RETURNING * INTO r;
  INSERT INTO celo_room_players(room_id,user_id,role,seat_number,entry_sc,bet_cents,dice_type) VALUES(r.id,p_user,'banker',0,0,0,'standard') RETURNING * INTO p;
 ELSE
  SELECT * INTO r FROM celo_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  SELECT * INTO a FROM celo_rounds WHERE room_id=r.id AND status IN('banker_rolling','player_rolling','betting') ORDER BY round_number DESC LIMIT 1 FOR UPDATE;
  SELECT * INTO p FROM celo_room_players WHERE room_id=r.id AND user_id=p_user;
  IF p_action='join' AND p.id IS NOT NULL THEN
   v_response:=jsonb_build_object('ok',true,'room',to_jsonb(r),'player',to_jsonb(p),'already_seated',true);
  ELSE
   IF r.status IN('cancelled','closed','completed') THEN RAISE EXCEPTION 'Room is closed'; END IF;
   IF p_action NOT IN('resume','leave','delete') AND r.paused_at IS NOT NULL THEN RAISE EXCEPTION 'Room is paused'; END IF;
   IF a.id IS NOT NULL THEN
    IF p_action='start' AND r.banker_id=p_user THEN v_response:=jsonb_build_object('ok',true,'room',to_jsonb(r),'round',to_jsonb(a),'idempotent',true);
    ELSE RAISE EXCEPTION 'A round is already in progress'; END IF;
   ELSIF p_action='join' THEN
    v_role:=COALESCE(p_input->>'role','player');IF v_role NOT IN('player','spectator') THEN RAISE EXCEPTION 'Invalid role'; END IF;
    SELECT count(*) INTO v_count FROM celo_room_players WHERE room_id=r.id;
    IF v_count>=r.max_players THEN RAISE EXCEPTION 'Table is full'; END IF;
    SELECT s INTO v_seat FROM generate_series(1,r.max_players-1) s WHERE NOT EXISTS(SELECT 1 FROM celo_room_players WHERE room_id=r.id AND seat_number=s) ORDER BY s LIMIT 1;
    IF v_seat IS NULL THEN RAISE EXCEPTION 'Table is full'; END IF;
    INSERT INTO celo_room_players(room_id,user_id,role,seat_number,entry_sc,bet_cents,dice_type) VALUES(r.id,p_user,v_role,v_seat,0,0,'standard') RETURNING * INTO p;
   ELSIF p_action='entry' THEN
    v_amount:=(p_input->>'amount')::integer;v_min:=GREATEST(500,COALESCE(r.minimum_entry_sc,r.min_bet_cents,500));
    IF p.id IS NULL OR p.role<>'player' OR r.banker_id=p_user THEN RAISE EXCEPTION 'Only a seated player may post entry'; END IF;
    IF v_amount IS NULL OR v_amount<v_min OR v_amount>r.current_bank_sc THEN RAISE EXCEPTION 'Entry must be between the minimum and current bank'; END IF;
    IF p.entry_posted OR GREATEST(p.entry_sc,p.stake_amount_sc,p.bet_cents)>0 THEN RAISE EXCEPTION 'Entry already posted'; END IF;
    SELECT COALESCE(sum(GREATEST(entry_sc,stake_amount_sc,bet_cents)),0) INTO v_prize FROM celo_room_players WHERE room_id=r.id AND role='player' AND entry_posted;
    IF v_prize+v_amount>r.current_bank_sc THEN RAISE EXCEPTION 'Remaining bank coverage is insufficient for this entry'; END IF;
    PERFORM celo_wallet_move(p_user,-v_amount,'celo:entry:'||p_request,'celo_entry');
    UPDATE celo_room_players SET entry_sc=v_amount,stake_amount_sc=v_amount,bet_cents=v_amount,entry_posted=true,status='active',player_seat_status='active' WHERE id=p.id RETURNING * INTO p;
    UPDATE celo_rooms SET status='active',last_activity=now() WHERE id=r.id RETURNING * INTO r;
   ELSIF p_action='start' THEN
    IF r.banker_id IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'Only the banker can start a round'; END IF;
    IF r.current_bank_sc<=0 OR r.bank_busted THEN RAISE EXCEPTION 'Fund the bank before starting'; END IF;
    SELECT COALESCE(sum(GREATEST(entry_sc,stake_amount_sc,bet_cents)),0),count(*) INTO v_prize,v_count FROM celo_room_players WHERE room_id=r.id AND role='player' AND user_id<>r.banker_id AND entry_posted AND GREATEST(entry_sc,stake_amount_sc,bet_cents)>0;
    IF v_count<1 THEN RAISE EXCEPTION 'At least one posted entry is required'; END IF;
    IF v_prize>r.current_bank_sc THEN RAISE EXCEPTION 'Entries exceed bank coverage'; END IF;
    SELECT COALESCE(max(round_number),0)+1 INTO v_round FROM celo_rounds WHERE room_id=r.id;
    INSERT INTO celo_rounds(room_id,round_number,banker_id,status,prize_pool_sc,platform_fee_sc,bank_covered,bank_at_round_start_sc,settlement_version)
    VALUES(r.id,v_round,p_user,'banker_rolling',v_prize,0,false,r.current_bank_sc,2) RETURNING * INTO a;
    UPDATE celo_rounds SET entry_snapshot=(SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'stake_sc',stake_amount_sc,'seat',seat_number) ORDER BY seat_number) FROM celo_room_players WHERE room_id=r.id AND role='player' AND entry_posted) WHERE id=a.id RETURNING * INTO a;
    UPDATE celo_rooms SET status='rolling',last_activity=now() WHERE id=r.id RETURNING * INTO r;
   ELSIF p_action='fund' THEN
    IF r.banker_id IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'Only the banker can fund the bank'; END IF;
    v_amount:=(p_input->>'amount')::integer;v_min:=GREATEST(500,COALESCE(r.minimum_entry_sc,r.min_bet_cents,500));
    IF v_amount IS NULL OR v_amount<v_min OR v_amount%v_min<>0 THEN RAISE EXCEPTION 'Invalid bank funding amount'; END IF;
    PERFORM celo_wallet_move(p_user,-v_amount,'celo:fund:'||p_request,'celo_entry');
    UPDATE celo_rooms SET current_bank_sc=current_bank_sc+v_amount,current_bank_cents=current_bank_sc+v_amount,bank_busted=false,status='waiting',last_activity=now() WHERE id=r.id RETURNING * INTO r;
   ELSIF p_action='vote' THEN
    IF p.id IS NULL OR p.role<>'player' OR r.banker_id=p_user THEN RAISE EXCEPTION 'Only a seated player may vote'; END IF;
    v_role:=p_input->>'vote';IF v_role NOT IN('request','approve') THEN RAISE EXCEPTION 'Invalid pause vote'; END IF;
    INSERT INTO celo_pause_votes(room_id,user_id,vote) VALUES(r.id,p_user,v_role) ON CONFLICT(room_id,user_id,vote) DO NOTHING;
    SELECT count(*) INTO v_count FROM celo_room_players WHERE room_id=r.id AND role='player' AND user_id<>r.banker_id AND seat_number IS NOT NULL;
    SELECT count(*) INTO v_prize FROM celo_pause_votes v JOIN celo_room_players p ON p.room_id=v.room_id AND p.user_id=v.user_id WHERE v.room_id=r.id AND v.vote='approve' AND p.role='player';
    IF v_role='approve' AND v_count>0 AND v_prize>=floor(v_count/2.0)+1 THEN UPDATE celo_rooms SET paused_at=now(),paused_by=p_user,pause_reason='majority_player_vote',pause_expires_at=now()+interval '5 minutes',last_activity=now() WHERE id=r.id RETURNING * INTO r; END IF;
   ELSIF p_action='reset-votes' THEN
    IF r.banker_id IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'Only the banker may reject pause requests';END IF;
    DELETE FROM celo_pause_votes WHERE room_id=r.id;
   ELSIF p_action='rules' THEN
    IF r.banker_id IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'Only the banker may edit room settings'; END IF;
    IF r.current_bank_sc>0 OR EXISTS(SELECT 1 FROM celo_room_players WHERE room_id=r.id AND entry_posted) THEN RAISE EXCEPTION 'Room settings require an unfunded bank without entries'; END IF;
    v_min:=(p_input->>'minimum_entry_sc')::integer;v_name:=trim(p_input->>'name');v_count:=(p_input->>'max_players')::integer;
    IF v_min IS NULL OR v_min<500 OR v_count IS NULL OR v_count NOT IN(2,4,6,10) OR COALESCE(v_name,'')='' OR length(v_name)>40 OR v_count<(SELECT count(*) FROM celo_room_players WHERE room_id=r.id) THEN RAISE EXCEPTION 'Invalid room settings'; END IF;
    UPDATE celo_rooms SET name=v_name,minimum_entry_sc=v_min,min_bet_cents=v_min,max_players=v_count,last_activity=now() WHERE id=r.id RETURNING * INTO r;
   ELSIF p_action='takeover' THEN
    SELECT * INTO a FROM celo_rounds WHERE id=(p_input->>'round_id')::uuid AND room_id=r.id FOR UPDATE;
    IF a.id IS NULL OR NOT a.player_celo_offer OR a.player_celo_expires_at<now() THEN RAISE EXCEPTION 'No current C-Lo banker offer'; END IF;
    IF p.id IS NULL OR NOT EXISTS(SELECT 1 FROM celo_player_rolls WHERE round_id=a.id AND user_id=p_user AND outcome='win' AND (SELECT array_agg(d ORDER BY d) FROM unnest(dice) d)=ARRAY[4,5,6]) THEN RAISE EXCEPTION 'Only the winning C-Lo roller may accept'; END IF;
    IF COALESCE((p_input->>'accept')::boolean,false) THEN
     IF a.status<>'completed' OR EXISTS(SELECT 1 FROM celo_room_players WHERE room_id=r.id AND entry_posted) THEN RAISE EXCEPTION 'Finish current entries before takeover'; END IF;
     IF r.banker_id=p_user THEN RAISE EXCEPTION 'Already the banker'; END IF;
     -- Swap occupied seats through NULL so the unique room/seat index remains valid.
     UPDATE celo_room_players SET seat_number=NULL WHERE room_id=r.id AND user_id IN(r.banker_id,p_user);
     UPDATE celo_room_players SET seat_number=p.seat_number,role='player' WHERE room_id=r.id AND user_id=r.banker_id;
     UPDATE celo_room_players SET seat_number=0,role='banker' WHERE id=p.id RETURNING * INTO p;
     UPDATE celo_rooms SET banker_id=p_user,bank_busted=(current_bank_sc<=0),last_activity=now() WHERE id=r.id RETURNING * INTO r;
    END IF;
    UPDATE celo_rounds SET player_celo_offer=false,player_celo_expires_at=NULL WHERE id=a.id RETURNING * INTO a;
   ELSIF p_action='setup' THEN
    IF r.banker_id IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'Only the banker can set up the bank'; END IF;
    IF r.current_bank_sc>0 THEN RAISE EXCEPTION 'Bank is already funded'; END IF;
    v_min:=(p_input->>'minimum_entry_sc')::integer;v_amount:=(p_input->>'funding_amount_sc')::integer;v_name:=trim(p_input->>'name');v_count:=(p_input->>'max_players')::integer;
    IF v_min IS NULL OR v_min<500 OR v_amount IS NULL OR v_amount<v_min OR v_amount%v_min<>0 OR v_count IS NULL OR v_count NOT IN(2,4,6,10) OR COALESCE(v_name,'')='' THEN RAISE EXCEPTION 'Invalid room settings'; END IF;
    IF EXISTS(SELECT 1 FROM celo_room_players WHERE room_id=r.id AND entry_posted) THEN RAISE EXCEPTION 'Posted entries must finish before setup'; END IF;
    PERFORM celo_wallet_move(p_user,-v_amount,'celo:setup:'||p_request,'celo_entry');
    UPDATE celo_rooms SET name=v_name,minimum_entry_sc=v_min,min_bet_cents=v_min,max_players=v_count,current_bank_sc=v_amount,current_bank_cents=v_amount,bank_busted=false,status='waiting',last_activity=now() WHERE id=r.id RETURNING * INTO r;
   ELSIF p_action='lower' THEN
    IF r.banker_id IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'Only the banker can lower the bank'; END IF;
    IF NOT r.last_round_was_celo OR r.banker_celo_at IS NULL OR r.banker_celo_at<now()-interval '60 seconds' THEN RAISE EXCEPTION 'Lower bank is only available within one minute of C-Lo'; END IF;
    v_amount:=(p_input->>'new_bank_sc')::integer;v_min:=GREATEST(500,COALESCE(r.minimum_entry_sc,r.min_bet_cents,500));
    IF v_amount IS NULL OR v_amount<v_min OR v_amount>=r.current_bank_sc OR v_amount%v_min<>0 THEN RAISE EXCEPTION 'Invalid lower bank amount'; END IF;
    SELECT COALESCE(sum(stake_amount_sc),0) INTO v_prize FROM celo_room_players WHERE room_id=r.id AND entry_posted;
    IF v_amount<v_prize THEN RAISE EXCEPTION 'Posted entries exceed new bank coverage'; END IF;
    PERFORM celo_wallet_move(p_user,r.current_bank_sc-v_amount,'celo:lower:'||p_request,'celo_bank_refund');
    UPDATE celo_rooms SET current_bank_sc=v_amount,current_bank_cents=v_amount,last_round_was_celo=false,last_activity=now() WHERE id=r.id RETURNING * INTO r;
   ELSIF p_action='pause' OR p_action='resume' THEN
    IF r.banker_id IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'Only the banker may pause or resume'; END IF;
    UPDATE celo_rooms SET paused_at=CASE WHEN p_action='pause' THEN now() ELSE NULL END,paused_by=CASE WHEN p_action='pause' THEN p_user ELSE NULL END,pause_expires_at=CASE WHEN p_action='pause' THEN now()+interval '5 minutes' ELSE NULL END,last_activity=now() WHERE id=r.id RETURNING * INTO r;
    DELETE FROM celo_pause_votes WHERE room_id=r.id;
   ELSIF p_action='leave' THEN
    IF p.id IS NULL THEN RAISE EXCEPTION 'Not seated'; END IF;
    IF r.banker_id=p_user THEN RAISE EXCEPTION 'Banker must close the table before leaving'; END IF;
    IF p.entry_posted AND p.stake_amount_sc>0 THEN PERFORM celo_wallet_move(p_user,p.stake_amount_sc,'celo:leave:'||p_request,'celo_bank_refund'); END IF;
    DELETE FROM celo_room_players WHERE id=p.id;p:=NULL;
   ELSIF p_action='delete' THEN
    IF r.banker_id IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'Only the banker can close the table'; END IF;
    IF EXISTS(SELECT 1 FROM celo_room_players WHERE room_id=r.id AND entry_posted AND stake_amount_sc>0) THEN RAISE EXCEPTION 'Posted entries must finish before closing'; END IF;
    IF EXISTS(SELECT 1 FROM celo_side_bets WHERE room_id=r.id AND status IN('open','matched')) THEN RAISE EXCEPTION 'Side bets must finish before closing'; END IF;
    PERFORM celo_wallet_move(p_user,r.current_bank_sc,'celo:close:'||p_request,'celo_bank_refund');
    UPDATE celo_rooms SET status='cancelled',current_bank_sc=0,current_bank_cents=0,last_activity=now() WHERE id=r.id RETURNING * INTO r;
    DELETE FROM celo_room_players WHERE room_id=r.id;
   ELSE RAISE EXCEPTION 'Unknown C-Lo action'; END IF;
  END IF;
 END IF;
 v_response:=COALESCE(v_response,jsonb_build_object('ok',true,'room',to_jsonb(r),'player',to_jsonb(p),'round',to_jsonb(a)));
 INSERT INTO celo_action_receipts(request_id,user_id,room_id,action,input_hash,response) VALUES(p_request,p_user,r.id,p_action,v_hash,v_response);
 RETURN v_response;
END $$;
REVOKE ALL ON FUNCTION public.celo_room_action_atomic(uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.celo_room_action_atomic(uuid,uuid,text,uuid,jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.celo_claim_roll_atomic(p_user uuid,p_room uuid,p_round uuid,p_request uuid,p_seq integer,p_timeout boolean DEFAULT false,p_payload jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r celo_rooms%ROWTYPE;a celo_rounds%ROWTYPE;p celo_room_players%ROWTYPE; v_saved jsonb;
BEGIN
 SELECT * INTO r FROM celo_rooms WHERE id=p_room FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
 SELECT * INTO a FROM celo_rounds WHERE id=p_round AND room_id=p_room FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Round not found'; END IF;
 IF r.status='cancelled' THEN RAISE EXCEPTION 'Room is closed'; END IF;
 IF r.paused_at IS NOT NULL THEN RAISE EXCEPTION 'Room is paused'; END IF;
 SELECT response INTO v_saved FROM celo_action_receipts WHERE request_id=p_request AND user_id=p_user AND action='roll';
 IF FOUND THEN RETURN jsonb_build_object('replay',v_saved); END IF;
 IF a.status NOT IN('banker_rolling','player_rolling') THEN RAISE EXCEPTION 'No active round'; END IF;
 SELECT * INTO p FROM celo_room_players WHERE room_id=p_room AND user_id=p_user;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Not seated'; END IF;
 IF p_timeout THEN
  IF a.pending_roll_payload->'dice' IS NOT NULL AND a.pending_roll_payload->'dice'<>'null'::jsonb THEN RAISE EXCEPTION 'Accepted player roll must settle before timeout'; END IF;
  IF a.status<>'player_rolling' OR a.player_roll_deadline_at IS NULL OR a.player_roll_deadline_at>now() THEN RAISE EXCEPTION 'Player deadline has not expired'; END IF;
 ELSE
  IF p_seq IS NULL OR p_seq<>a.roll_seq THEN RAISE EXCEPTION 'Stale roll version; synchronize table'; END IF;
  IF a.status='banker_rolling' THEN
   IF r.banker_id IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'Only the banker may roll now'; END IF;
  ELSIF p.user_id IS DISTINCT FROM a.roller_user_id OR p.role<>'player' OR NOT p.entry_posted OR p.stake_amount_sc<=0 THEN RAISE EXCEPTION 'Not your turn'; END IF;
 END IF;
 IF a.pending_roll_id=p_request THEN RETURN jsonb_build_object('round',to_jsonb(a),'room',to_jsonb(r),'payload',a.pending_roll_payload); END IF;
 IF a.pending_roll_id IS NOT NULL AND a.roll_animation_start_at>now()-interval '30 seconds' THEN RAISE EXCEPTION 'Roll already in progress'; END IF;
 UPDATE celo_rooms SET last_activity=now() WHERE id=r.id;
 UPDATE celo_rounds SET pending_roll_id=p_request,pending_roll_user_id=p_user,pending_roll_payload=COALESCE(pending_roll_payload,p_payload),banker_roll_in_flight=(status='banker_rolling'),roll_processing=(status='player_rolling'),roll_animation_start_at=now(),roll_animation_duration_ms=1500 WHERE id=a.id RETURNING * INTO a;
 RETURN jsonb_build_object('round',to_jsonb(a),'room',to_jsonb(r),'payload',a.pending_roll_payload);
END $$;
REVOKE ALL ON FUNCTION public.celo_claim_roll_atomic(uuid,uuid,uuid,uuid,integer,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.celo_claim_roll_atomic(uuid,uuid,uuid,uuid,integer,boolean,jsonb) TO service_role;

-- The existing server-only TypeScript evaluator supplies the result; the browser never supplies dice.
-- All matched stake, wallet, fee, result and next-turn changes commit or roll back together.
CREATE OR REPLACE FUNCTION public.celo_settle_roll_atomic(p_user uuid,p_room uuid,p_round uuid,p_request uuid,p_dice integer[],p_result text,p_name text,p_point integer,p_is_celo boolean,p_timeout boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r celo_rooms%ROWTYPE;a celo_rounds%ROWTYPE;p celo_room_players%ROWTYPE;s celo_room_players%ROWTYPE;
 v_outcome text;v_entry integer;v_fee integer;v_net integer;v_payout integer:=0;v_total_fee integer:=0;v_delta integer:=0;v_winner uuid;v_best integer:=-1;v_next celo_room_players%ROWTYPE;v_receipt jsonb;v_complete boolean:=false;v_roll celo_player_rolls%ROWTYPE;v_old_banker uuid;v_response jsonb;v_target uuid;v_winners jsonb:='[]'::jsonb;
BEGIN
 SELECT * INTO r FROM celo_rooms WHERE id=p_room FOR UPDATE;
 SELECT * INTO a FROM celo_rounds WHERE id=p_round AND room_id=p_room FOR UPDATE;
 SELECT response INTO v_receipt FROM celo_action_receipts WHERE request_id=p_request AND user_id=p_user AND action='roll';
 IF FOUND THEN RETURN v_receipt||jsonb_build_object('idempotent',true); END IF;
 IF a.id IS NULL OR a.pending_roll_id IS DISTINCT FROM p_request OR a.status NOT IN('banker_rolling','player_rolling') THEN RAISE EXCEPTION 'Roll claim is no longer valid'; END IF;
 IF p_result NOT IN('instant_win','instant_loss','point','no_count') OR (NOT p_timeout AND (array_length(p_dice,1)<>3 OR EXISTS(SELECT 1 FROM unnest(p_dice) d WHERE d NOT BETWEEN 1 AND 6))) THEN RAISE EXCEPTION 'Invalid trusted roll'; END IF;
 IF a.pending_roll_payload IS NOT NULL AND (a.pending_roll_payload->'dice' IS DISTINCT FROM COALESCE(to_jsonb(p_dice),'null'::jsonb) OR a.pending_roll_payload->>'result' IS DISTINCT FROM p_result OR a.pending_roll_payload->>'rollName' IS DISTINCT FROM p_name OR (a.pending_roll_payload->>'point')::integer IS DISTINCT FROM p_point OR (a.pending_roll_payload->>'isCelo')::boolean IS DISTINCT FROM p_is_celo) THEN RAISE EXCEPTION 'Settlement differs from accepted server roll'; END IF;
 -- Lock affected wallets in UUID order across tables to avoid opposite-player deadlocks.
 PERFORM 1 FROM users WHERE id IN(SELECT user_id FROM celo_room_players WHERE room_id=r.id UNION SELECT creator_id FROM celo_side_bets WHERE room_id=r.id AND status IN('open','matched') UNION SELECT acceptor_id FROM celo_side_bets WHERE room_id=r.id AND status='matched') ORDER BY id FOR UPDATE;
 v_old_banker:=r.banker_id;v_target:=CASE WHEN p_timeout THEN a.roller_user_id ELSE p_user END;
 SELECT * INTO p FROM celo_room_players WHERE room_id=r.id AND user_id=v_target;
 IF a.status='banker_rolling' THEN
  IF r.banker_id IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'Banker identity changed'; END IF;
  UPDATE celo_rounds SET banker_dice=p_dice,banker_dice_name=p_name,banker_dice_result=p_result,banker_point=p_point,banker_rerolls=banker_rerolls+CASE WHEN p_result='no_count' THEN 1 ELSE 0 END WHERE id=a.id;
  IF p_result IN('instant_win','instant_loss') THEN
   FOR s IN SELECT * FROM celo_room_players WHERE room_id=r.id AND role='player' AND entry_posted AND stake_amount_sc>0 ORDER BY seat_number,user_id FOR UPDATE LOOP
    v_entry:=s.stake_amount_sc;v_fee:=floor(v_entry*.1);v_net:=v_entry-v_fee;v_total_fee:=v_total_fee+v_fee;
    IF p_result='instant_win' THEN v_delta:=v_delta+v_net;
    ELSE
     PERFORM celo_wallet_move(s.user_id,v_entry+v_net,'celo:roll:'||p_request||':'||s.user_id,'celo_payout');
     v_winners:=v_winners||jsonb_build_array(jsonb_build_object('user_id',s.user_id,'payout_sc',v_entry+v_net));
     v_delta:=v_delta-CASE WHEN a.settlement_version>=2 THEN v_entry ELSE v_net END;
     IF v_entry>v_best THEN v_best:=v_entry;v_winner:=s.user_id; END IF;
    END IF;
   END LOOP;
   v_outcome:=CASE WHEN p_result='instant_win' THEN 'banker_win' ELSE 'players_win' END;v_complete:=true;
   UPDATE celo_rounds SET banker_winnings_sc=CASE WHEN p_result='instant_win' THEN v_delta ELSE v_delta+v_total_fee END,platform_fee_sc=v_total_fee WHERE id=a.id;
  ELSIF p_result='point' THEN
   SELECT * INTO v_next FROM celo_room_players WHERE room_id=r.id AND role='player' AND entry_posted AND stake_amount_sc>0 ORDER BY seat_number,user_id LIMIT 1;
   IF v_next.id IS NULL THEN RAISE EXCEPTION 'No funded player for banker point'; END IF;
   UPDATE celo_rounds SET status='player_rolling',current_player_seat=v_next.seat_number,roller_user_id=v_next.user_id,player_roll_deadline_at=now()+interval '30 seconds' WHERE id=a.id;
   v_outcome:='point';
  ELSE v_outcome:='reroll'; END IF;
 ELSE
  IF p.id IS NULL OR p.user_id IS DISTINCT FROM a.roller_user_id OR p.stake_amount_sc<=0 OR NOT p.entry_posted THEN RAISE EXCEPTION 'Player state changed'; END IF;
  v_entry:=p.stake_amount_sc;v_fee:=floor(v_entry*.1);v_net:=v_entry-v_fee;
  v_outcome:=CASE WHEN p_timeout THEN 'loss' WHEN p_result='no_count' THEN 'reroll' WHEN p_result='instant_win' THEN 'win' WHEN p_result='instant_loss' THEN 'loss' WHEN p_point=a.banker_point THEN 'push' WHEN p_point>a.banker_point THEN 'win' ELSE 'loss' END;
  IF v_outcome='push' THEN
   FOR s IN SELECT * FROM celo_room_players WHERE room_id=r.id AND role='player' AND entry_posted AND stake_amount_sc>0 ORDER BY seat_number,user_id FOR UPDATE LOOP
    PERFORM celo_wallet_move(s.user_id,s.stake_amount_sc,'celo:push:'||p_request||':'||s.user_id,'celo_payout');
   END LOOP;
   v_payout:=v_entry;v_fee:=0;v_complete:=true;
   UPDATE celo_rounds SET push=true WHERE id=a.id;
  ELSIF v_outcome='win' THEN
   v_payout:=v_entry+v_net;PERFORM celo_wallet_move(p.user_id,v_payout,'celo:roll:'||p_request||':'||p.user_id,'celo_payout');
   v_delta:=-CASE WHEN a.settlement_version>=2 THEN v_entry ELSE v_net END;v_winner:=p.user_id;
   UPDATE celo_rounds SET banker_winnings_sc=banker_winnings_sc-v_net,platform_fee_sc=platform_fee_sc+v_fee,player_celo_offer=player_celo_offer OR p_is_celo,player_celo_expires_at=CASE WHEN p_is_celo THEN now()+interval '30 seconds' ELSE player_celo_expires_at END WHERE id=a.id;
  ELSIF v_outcome='loss' THEN
   v_delta:=v_net;UPDATE celo_rounds SET banker_winnings_sc=banker_winnings_sc+v_net,platform_fee_sc=platform_fee_sc+v_fee WHERE id=a.id;
  END IF;
  INSERT INTO celo_player_rolls(round_id,room_id,user_id,dice,roll_name,roll_result,point,entry_sc,outcome,payout_sc,platform_fee_sc)
  VALUES(a.id,r.id,p.user_id,COALESCE(p_dice,ARRAY[]::integer[]),p_name,p_result,p_point,v_entry,v_outcome,v_payout,CASE WHEN v_outcome IN('win','loss') THEN v_fee ELSE 0 END) RETURNING * INTO v_roll;
  IF v_outcome<>'reroll' THEN
   UPDATE celo_room_players SET entry_sc=0,bet_cents=0,stake_amount_sc=0,entry_posted=false,status='seated',player_seat_status='seated' WHERE id=p.id;
   SELECT * INTO v_next FROM celo_room_players WHERE room_id=r.id AND role='player' AND entry_posted AND stake_amount_sc>0 ORDER BY seat_number,user_id LIMIT 1;
   IF v_next.id IS NULL THEN v_complete:=true;
   ELSIF NOT v_complete THEN UPDATE celo_rounds SET current_player_seat=v_next.seat_number,roller_user_id=v_next.user_id,player_roll_deadline_at=now()+interval '30 seconds' WHERE id=a.id; END IF;
  END IF;
 END IF;
 IF r.current_bank_sc+v_delta<0 THEN RAISE EXCEPTION 'Insufficient table escrow for settlement'; END IF;
 UPDATE celo_rooms SET current_bank_sc=current_bank_sc+v_delta,current_bank_cents=current_bank_sc+v_delta,last_activity=now() WHERE id=r.id RETURNING * INTO r;
 IF r.current_bank_sc=0 AND v_winner IS NOT NULL THEN
  PERFORM celo_handle_bank_bust_and_transfer(r.id,v_winner,0,'atomic_roll');
  SELECT * INTO r FROM celo_rooms WHERE id=r.id;
 END IF;
 IF v_complete THEN
  UPDATE celo_rounds SET status='completed',completed_at=now(),player_celo_offer=player_celo_offer AND r.current_bank_sc>0,player_celo_expires_at=CASE WHEN player_celo_offer AND r.current_bank_sc>0 THEN now()+interval '30 seconds' ELSE NULL END,player_roll_deadline_at=NULL,terminal_room_bank_applied=true,terminal_bank_delta_sc=v_delta WHERE id=a.id;
  UPDATE celo_room_players SET entry_sc=0,bet_cents=0,stake_amount_sc=0,entry_posted=false,status='seated',player_seat_status='seated' WHERE room_id=r.id;
  UPDATE celo_rooms SET status=CASE WHEN current_bank_sc<=0 AND banker_id IS NOT NULL THEN 'bank_takeover' ELSE 'waiting' END,bank_busted=(current_bank_sc<=0),last_round_was_celo=(p_is_celo AND a.status='banker_rolling'),banker_celo_at=CASE WHEN p_is_celo AND a.status='banker_rolling' THEN now() ELSE NULL END,last_activity=now() WHERE id=r.id RETURNING * INTO r;
  SELECT * INTO a FROM celo_rounds WHERE id=a.id;
  IF a.banker_dice_result='instant_win' THEN v_winners:=jsonb_build_array(jsonb_build_object('user_id',a.banker_id,'payout_sc',a.banker_winnings_sc,'in_table_escrow',true));
  ELSIF a.banker_dice_result='point' THEN
   SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id',user_id,'payout_sc',payout_sc)),'[]'::jsonb) INTO v_winners FROM celo_player_rolls WHERE round_id=a.id AND outcome='win';
   IF a.banker_winnings_sc>0 THEN v_winners:=v_winners||jsonb_build_array(jsonb_build_object('user_id',a.banker_id,'payout_sc',a.banker_winnings_sc,'in_table_escrow',true));END IF;
  END IF;
  UPDATE celo_rounds SET settlement_snapshot=jsonb_build_object('banker_id',a.banker_id,'entries',a.entry_snapshot,'winners',v_winners,'fee_sc',a.platform_fee_sc,'bank_sc',r.current_bank_sc) WHERE id=a.id RETURNING * INTO a;
  PERFORM celo_record_platform_fee(a.id,'celo_main_fee',a.platform_fee_sc,'C-Lo main table fee',NULL,'celo:atomic:fee:'||a.id);
  PERFORM celo_settle_sidebets_atomic(r.id,a.id);
 END IF;
 UPDATE celo_rounds SET roll_seq=roll_seq+1,last_roll_dice=p_dice,last_roll_user_id=v_target,last_roll_name=p_name,last_roll_point=p_point,last_roll_outcome=v_outcome,pending_roll_id=NULL,pending_roll_user_id=NULL,pending_roll_payload=NULL,banker_roll_in_flight=false,roll_processing=false,updated_at=now() WHERE id=a.id RETURNING * INTO a;
 v_response:=jsonb_build_object('ok',true,'room',to_jsonb(r),'round',to_jsonb(a),'currentRound',to_jsonb(a),'roll',to_jsonb(v_roll),'dice',p_dice,'rollName',p_name,'result',p_result,'point',p_point,'outcome',v_outcome,'isCelo',p_is_celo,'payoutSc',v_payout,'roundComplete',v_complete,'player_can_become_banker',p_is_celo AND a.player_celo_offer,'bank_stopped',r.current_bank_sc=0,'oldBankerId',v_old_banker,'newBankerId',r.banker_id,'player_user_id',v_target,'newBalance',(SELECT gpay_coins FROM users WHERE id=p_user));
 INSERT INTO celo_action_receipts(request_id,user_id,room_id,action,input_hash,response) VALUES(p_request,p_user,r.id,'roll',md5(p_request::text),v_response);
 RETURN v_response;
END $$;
REVOKE ALL ON FUNCTION public.celo_settle_roll_atomic(uuid,uuid,uuid,uuid,integer[],text,text,integer,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.celo_settle_roll_atomic(uuid,uuid,uuid,uuid,integer[],text,text,integer,boolean,boolean) TO service_role;


-- Side entries use the same table lock and atomic wallet/ledger boundary.
CREATE OR REPLACE FUNCTION public.celo_sidebet_action_atomic(p_user uuid,p_room uuid,p_action text,p_request uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r celo_rooms%ROWTYPE;b celo_side_bets%ROWTYPE;a celo_rounds%ROWTYPE;v_amount integer;v_type text;v_mult numeric;v_saved celo_action_receipts%ROWTYPE;v_response jsonb;v_hash text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 v_hash:=md5(COALESCE(p_room::text,'')||p_action||p_input::text);
 SELECT * INTO v_saved FROM celo_action_receipts WHERE request_id=p_request;
 IF FOUND THEN IF v_saved.user_id<>p_user OR v_saved.input_hash<>v_hash THEN RAISE EXCEPTION 'Request id belongs to another action'; END IF;RETURN v_saved.response;END IF;
 IF p_action='accept' THEN SELECT room_id INTO p_room FROM celo_side_bets WHERE id=(p_input->>'bet_id')::uuid; END IF;
 SELECT * INTO r FROM celo_rooms WHERE id=p_room FOR UPDATE;
 IF NOT FOUND OR r.status IN('cancelled','completed') OR r.paused_at IS NOT NULL THEN RAISE EXCEPTION 'Table is unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM celo_room_players WHERE room_id=r.id AND user_id=p_user) THEN RAISE EXCEPTION 'Not seated'; END IF;
 IF p_action='create' THEN
  v_amount:=(p_input->>'amount_sc')::integer;v_type:=p_input->>'bet_type';v_mult:=CASE v_type WHEN 'celo' THEN 8 WHEN 'shit' THEN 8 WHEN 'trips' THEN 8 WHEN 'hand_crack' THEN 4.5 WHEN 'banker_wins' THEN 1.8 WHEN 'player_wins' THEN 1.8 ELSE NULL END;
  IF v_amount IS NULL OR v_amount<100 OR v_amount%100<>0 OR v_mult IS NULL THEN RAISE EXCEPTION 'Invalid side entry'; END IF;
  SELECT * INTO a FROM celo_rounds WHERE id=NULLIF(p_input->>'round_id','')::uuid AND room_id=r.id FOR UPDATE;
  IF a.id IS NULL OR a.status NOT IN('banker_rolling','betting') OR a.roll_seq>0 OR a.pending_roll_id IS NOT NULL THEN RAISE EXCEPTION 'Side entries require an unrolled current round'; END IF;
  PERFORM celo_wallet_move(p_user,-v_amount,'celo:side:create:'||p_request,'celo_sidebet');
  INSERT INTO celo_side_bets(room_id,round_id,creator_id,bet_type,amount_sc,odds_multiplier,status,expires_at,creator_debit_ref) VALUES(r.id,a.id,p_user,v_type,v_amount,v_mult,'open',now()+interval '60 seconds','celo:side:create:'||p_request) RETURNING * INTO b;
 ELSIF p_action='accept' THEN
  SELECT * INTO b FROM celo_side_bets WHERE id=(p_input->>'bet_id')::uuid FOR UPDATE;
  SELECT * INTO a FROM celo_rounds WHERE id=b.round_id FOR UPDATE;
  IF b.status='matched' AND b.acceptor_id=p_user THEN RETURN jsonb_build_object('ok',true,'sideBet',to_jsonb(b),'idempotent',true); END IF;
  IF b.status<>'open' OR b.expires_at<now() OR b.creator_id=p_user OR a.status NOT IN('banker_rolling','betting') OR a.roll_seq>0 OR a.pending_roll_id IS NOT NULL THEN RAISE EXCEPTION 'Side entry is no longer available'; END IF;
  PERFORM celo_wallet_move(p_user,-b.amount_sc,'celo:side:accept:'||p_request,'celo_sidebet');
  UPDATE celo_side_bets SET acceptor_id=p_user,status='matched',acceptor_debit_ref='celo:side:accept:'||p_request WHERE id=b.id RETURNING * INTO b;
 ELSE RAISE EXCEPTION 'Invalid side action';END IF;
 v_response:=jsonb_build_object('ok',true,'sideBet',to_jsonb(b),'side_bet',to_jsonb(b));
 INSERT INTO celo_action_receipts(request_id,user_id,room_id,action,input_hash,response) VALUES(p_request,p_user,r.id,'side_'||p_action,v_hash,v_response);RETURN v_response;
END $$;
REVOKE ALL ON FUNCTION public.celo_sidebet_action_atomic(uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.celo_sidebet_action_atomic(uuid,uuid,text,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.celo_settle_sidebets_atomic(p_room uuid,p_round uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r celo_rooms%ROWTYPE;a celo_rounds%ROWTYPE;b celo_side_bets%ROWTYPE;v_banker boolean;v_creator boolean;v_push boolean;v_winner uuid;v_fee integer;v_name text;
BEGIN
 SELECT * INTO r FROM celo_rooms WHERE id=p_room FOR UPDATE;
 SELECT * INTO a FROM celo_rounds WHERE id=p_round AND room_id=p_room FOR UPDATE;
 IF a.status<>'completed' THEN RETURN;END IF;
 SELECT EXISTS(SELECT 1 FROM celo_player_rolls WHERE round_id=a.id AND outcome='push') INTO v_push;
 v_banker:=CASE WHEN v_push THEN NULL WHEN a.banker_dice_result='instant_win' THEN true WHEN a.banker_dice_result='instant_loss' THEN false WHEN a.banker_dice_result='point' THEN NOT EXISTS(SELECT 1 FROM celo_player_rolls WHERE round_id=a.id AND outcome='win') ELSE NULL END;
 v_name:=upper(COALESCE(a.banker_dice_name,''));
 FOR b IN SELECT * FROM celo_side_bets WHERE room_id=r.id AND round_id=a.id AND status IN('open','matched') ORDER BY id FOR UPDATE LOOP
  v_creator:=CASE WHEN v_push OR b.status='open' THEN NULL WHEN b.bet_type='banker_wins' THEN v_banker WHEN b.bet_type='player_wins' THEN NOT v_banker WHEN b.bet_type='celo' THEN a.banker_dice_result='instant_win' AND v_name LIKE '%C-LO%' WHEN b.bet_type='trips' THEN a.banker_dice_result='instant_win' AND (v_name LIKE '%TRIP%' OR v_name LIKE '%ACE OUT%') WHEN b.bet_type='hand_crack' THEN a.banker_dice_result='instant_win' AND v_name LIKE '%HAND CRACK%' WHEN b.bet_type='shit' THEN a.banker_dice_result='instant_loss' AND (v_name LIKE '%SHIT%' OR v_name LIKE '%DICK%' OR v_name LIKE '%DICE%' OR v_name LIKE '%ACE-DEUCE-TREY%') ELSE NULL END;
  IF v_creator IS NULL THEN
   PERFORM celo_wallet_move(b.creator_id,b.amount_sc,'celo:side:void:'||b.id||':creator','celo_bank_refund');
   IF b.acceptor_id IS NOT NULL THEN PERFORM celo_wallet_move(b.acceptor_id,b.amount_sc,'celo:side:void:'||b.id||':acceptor','celo_bank_refund'); END IF;
   UPDATE celo_side_bets SET status='cancelled',winner_id=NULL,payout_sc=0,platform_fee_sc=0,settled_at=now() WHERE id=b.id;
  ELSE
   v_winner:=CASE WHEN v_creator THEN b.creator_id ELSE b.acceptor_id END;v_fee:=floor((b.amount_sc*2)*LEAST(100,GREATEST(0,r.platform_fee_pct))/100.0);
   PERFORM celo_wallet_move(v_winner,b.amount_sc*2-v_fee,'celo:side:payout:'||b.id,'celo_payout');
   PERFORM celo_record_platform_fee(a.id,'celo_side_fee',v_fee,'C-Lo side entry fee',v_winner,'celo:atomic:sidefee:'||b.id);
   UPDATE celo_side_bets SET status=CASE WHEN v_creator THEN 'won' ELSE 'lost' END,winner_id=v_winner,payout_sc=b.amount_sc*2-v_fee,platform_fee_sc=v_fee,settled_at=now() WHERE id=b.id;
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.celo_settle_sidebets_atomic(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.celo_settle_sidebets_atomic(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.celo_cleanup_room_atomic(p_room uuid,p_pause boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r celo_rooms%ROWTYPE;p celo_room_players%ROWTYPE;b celo_side_bets%ROWTYPE;v_count integer;v_fee integer:=0;
BEGIN
 SELECT * INTO r FROM celo_rooms WHERE id=p_room FOR UPDATE;
 IF NOT FOUND OR r.status='cancelled' THEN RETURN jsonb_build_object('ok',true,'idempotent',true);END IF;
 IF p_pause THEN
  IF r.paused_at IS NULL OR r.pause_expires_at IS NULL OR r.pause_expires_at>now() THEN RAISE EXCEPTION 'Pause has not expired';END IF;
 ELSE
  IF r.paused_at IS NOT NULL OR r.last_activity>now()-interval '10 minutes' THEN RAISE EXCEPTION 'Table is not abandoned';END IF;
 END IF;
 SELECT count(*) INTO v_count FROM celo_room_players WHERE room_id=r.id AND role='player' AND entry_posted AND stake_amount_sc>0;
 IF NOT p_pause AND v_count=0 THEN RETURN jsonb_build_object('ok',false,'reason','no_posted_players');END IF;
 -- Same room -> round -> wallet order as rolls; cancellation cannot interleave settlement.
 PERFORM 1 FROM celo_rounds WHERE room_id=r.id AND status IN('banker_rolling','player_rolling','betting') ORDER BY round_number FOR UPDATE;
 FOR p IN SELECT * FROM celo_room_players WHERE room_id=r.id AND role='player' AND entry_posted AND stake_amount_sc>0 ORDER BY user_id FOR UPDATE LOOP
  PERFORM celo_wallet_move(p.user_id,p.stake_amount_sc,'celo:cleanup:entry:'||r.id||':'||p.user_id,'celo_bank_refund');
 END LOOP;
 FOR b IN SELECT * FROM celo_side_bets WHERE room_id=r.id AND status IN('open','matched') ORDER BY id FOR UPDATE LOOP
  PERFORM celo_wallet_move(b.creator_id,b.amount_sc,'celo:cleanup:side:'||b.id||':creator','celo_bank_refund');
  IF b.acceptor_id IS NOT NULL THEN PERFORM celo_wallet_move(b.acceptor_id,b.amount_sc,'celo:cleanup:side:'||b.id||':acceptor','celo_bank_refund');END IF;
  UPDATE celo_side_bets SET status='cancelled',settled_at=now() WHERE id=b.id;
 END LOOP;
 IF v_count>0 AND (NOT p_pause OR r.paused_by=r.banker_id) THEN
  SELECT LEAST(500,GREATEST(0,gpay_coins)) INTO v_fee FROM users WHERE id=r.banker_id FOR UPDATE;
  PERFORM celo_wallet_move(r.banker_id,-v_fee,'celo:cleanup:fee:'||r.id,'celo_abandon_fee');
  IF v_fee>0 THEN PERFORM celo_record_platform_fee(NULL,'celo_abandon_fee',v_fee,'C-Lo abandonment fee',r.banker_id,'celo:atomic:cleanupfee:'||r.id);END IF;
 END IF;
 PERFORM celo_wallet_move(r.banker_id,r.current_bank_sc,'celo:cleanup:bank:'||r.id,'celo_bank_refund');
 UPDATE celo_rounds SET status='cancelled',completed_at=now(),pending_roll_id=NULL,pending_roll_user_id=NULL,pending_roll_payload=NULL,roll_processing=false,banker_roll_in_flight=false WHERE room_id=r.id AND status IN('banker_rolling','player_rolling','betting');
 UPDATE celo_room_players SET entry_sc=0,bet_cents=0,stake_amount_sc=0,entry_posted=false,status='seated',player_seat_status='seated' WHERE room_id=r.id;
 DELETE FROM celo_pause_votes WHERE room_id=r.id;
 UPDATE celo_rooms SET status='cancelled',current_bank_sc=0,current_bank_cents=0,abandoned_at=now(),abandonment_fee_charged=(v_fee>0),paused_at=NULL,paused_by=NULL,pause_reason=NULL,pause_expires_at=NULL,last_activity=now() WHERE id=r.id;
 RETURN jsonb_build_object('ok',true,'feeCharged',v_fee);
END $$;
REVOKE ALL ON FUNCTION public.celo_cleanup_room_atomic(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.celo_cleanup_room_atomic(uuid,boolean) TO service_role;

-- Completes already accepted server rolls and established timeout/refund rules.
-- Does not generate dice or accept any browser-supplied outcome.
CREATE OR REPLACE FUNCTION public.celo_recover_due_actions() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET lock_timeout='2s' AS $$
DECLARE a celo_rounds%ROWTYPE;r celo_rooms%ROWTYPE;v_payload jsonb;v_actor uuid;v_request uuid;v_dice integer[];v_count integer:=0;v_errors integer:=0;
BEGIN
 FOR a IN SELECT * FROM celo_rounds WHERE status IN('banker_rolling','player_rolling') AND ((pending_roll_id IS NOT NULL AND roll_animation_start_at<now()-interval '30 seconds') OR (status='player_rolling' AND player_roll_deadline_at<now() AND pending_roll_id IS NULL)) ORDER BY room_id LIMIT 25 LOOP
  BEGIN
   SELECT * INTO r FROM celo_rooms WHERE id=a.room_id;
   IF r.status='cancelled' OR r.paused_at IS NOT NULL THEN CONTINUE;END IF;
   IF a.pending_roll_id IS NOT NULL THEN
    v_payload:=a.pending_roll_payload;v_request:=a.pending_roll_id;v_actor:=COALESCE(a.pending_roll_user_id,CASE WHEN a.status='banker_rolling' THEN r.banker_id ELSE a.roller_user_id END);
    IF v_payload IS NULL THEN RAISE EXCEPTION 'Accepted roll has no trusted payload';END IF;
    SELECT array_agg(d::integer) INTO v_dice FROM jsonb_array_elements_text(CASE WHEN v_payload->'dice'='null'::jsonb THEN '[]'::jsonb ELSE v_payload->'dice' END) d;
    PERFORM celo_settle_roll_atomic(v_actor,r.id,a.id,v_request,v_dice,v_payload->>'result',v_payload->>'rollName',(v_payload->>'point')::integer,(v_payload->>'isCelo')::boolean,v_payload->'dice'='null'::jsonb);
   ELSE
    v_request:=gen_random_uuid();v_payload:=jsonb_build_object('dice',NULL,'result','instant_loss','rollName','TIMEOUT — FORFEIT','point',NULL,'isCelo',false);
    PERFORM celo_claim_roll_atomic(r.banker_id,r.id,a.id,v_request,NULL,true,v_payload);
    PERFORM celo_settle_roll_atomic(r.banker_id,r.id,a.id,v_request,NULL,'instant_loss','TIMEOUT — FORFEIT',NULL,false,true);
   END IF;
   v_count:=v_count+1;
  EXCEPTION WHEN OTHERS THEN v_errors:=v_errors+1;RAISE WARNING 'C-Lo recovery skipped round %: %',a.id,SQLERRM;
  END;
 END LOOP;
 FOR r IN SELECT * FROM celo_rooms WHERE status<>'cancelled' AND ((paused_at IS NOT NULL AND pause_expires_at<now()) OR (paused_at IS NULL AND last_activity<now()-interval '10 minutes' AND EXISTS(SELECT 1 FROM celo_room_players p WHERE p.room_id=celo_rooms.id AND p.role='player' AND p.entry_posted AND p.stake_amount_sc>0))) ORDER BY id LIMIT 25 LOOP
  BEGIN
   PERFORM celo_cleanup_room_atomic(r.id,r.paused_at IS NOT NULL);v_count:=v_count+1;
  EXCEPTION WHEN OTHERS THEN v_errors:=v_errors+1;RAISE WARNING 'C-Lo cleanup skipped room %: %',r.id,SQLERRM;
  END;
 END LOOP;
 RETURN jsonb_build_object('processed',v_count,'errors',v_errors);
END $$;
REVOKE ALL ON FUNCTION public.celo_recover_due_actions() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.celo_recover_due_actions() TO service_role;

-- Single-statement MVCC snapshot: clients never combine unrelated RLS reads into game state.
CREATE OR REPLACE FUNCTION public.celo_room_snapshot(p_user uuid,p_room uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('room',to_jsonb(r),'viewerBalance',(SELECT gpay_coins FROM users WHERE id=p_user),'players',COALESCE((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('users',jsonb_build_object('id',u.id,'full_name',u.full_name,'username',u.username,'avatar_url',u.avatar_url)) ORDER BY p.seat_number) FROM celo_room_players p JOIN users u ON u.id=p.user_id WHERE p.room_id=r.id),'[]'::jsonb),
 'activeRound',(SELECT to_jsonb(a) FROM celo_rounds a WHERE a.room_id=r.id AND (a.status IN('banker_rolling','player_rolling','betting') OR (a.status='completed' AND a.completed_at>now()-interval '12 seconds')) ORDER BY a.round_number DESC LIMIT 1),
 'playerRolls',COALESCE((SELECT jsonb_agg(to_jsonb(pr) ORDER BY pr.created_at DESC) FROM celo_player_rolls pr WHERE pr.round_id=(SELECT a.id FROM celo_rounds a WHERE a.room_id=r.id ORDER BY a.round_number DESC LIMIT 1)),'[]'::jsonb),
 'postedPrize',(SELECT COALESCE(sum(p.stake_amount_sc),0) FROM celo_room_players p WHERE p.room_id=r.id AND p.entry_posted AND p.role='player'),
 'pauseVotes',jsonb_build_object('requestCount',(SELECT count(*) FROM celo_pause_votes WHERE room_id=r.id AND vote='request'),'approveCount',(SELECT count(*) FROM celo_pause_votes WHERE room_id=r.id AND vote='approve')))
 FROM celo_rooms r WHERE r.id=p_room AND (r.room_type='public' OR r.room_type IS NULL OR r.banker_id=p_user OR EXISTS(SELECT 1 FROM celo_room_players p WHERE p.room_id=r.id AND p.user_id=p_user));
$$;
REVOKE ALL ON FUNCTION public.celo_room_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.celo_room_snapshot(uuid,uuid) TO service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.celo_rooms,public.celo_room_players,public.celo_rounds,public.celo_player_rolls,public.celo_side_bets FROM PUBLIC,anon,authenticated;
-- Retire direct execution of legacy financial writers; read helpers used by RLS remain accessible.
DO $$ DECLARE f record;c record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('celo_increment_round_banker_accounting','celo_post_entry_atomic','celo_finalize_banker_terminal_round','celo_record_platform_fee','celo_handle_bank_bust_and_transfer','celo_reconcile_terminal_room_bank') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
 FOR c IN SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN('celo_rooms','celo_room_players','celo_rounds','celo_player_rolls','celo_side_bets') LOOP
  EXECUTE format('REVOKE INSERT(%I),UPDATE(%I),REFERENCES(%I) ON public.%I FROM PUBLIC,anon,authenticated',c.column_name,c.column_name,c.column_name,c.table_name);
 END LOOP;
END $$;
COMMIT;
