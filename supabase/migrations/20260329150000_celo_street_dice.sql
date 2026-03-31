-- C-Lo street dice: rooms, rounds, rolls, side bets, chat, audit (run in Supabase or via migration).

CREATE TABLE IF NOT EXISTS public.celo_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  creator_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  banker_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'rolling', 'completed', 'cancelled')),
  room_type text NOT NULL DEFAULT 'public' CHECK (room_type IN ('public', 'private')),
  join_code text UNIQUE,
  max_players integer NOT NULL DEFAULT 6 CHECK (max_players IN (2, 4, 6)),
  min_bet_cents integer NOT NULL DEFAULT 100 CHECK (min_bet_cents >= 100),
  max_bet_cents integer NOT NULL DEFAULT 10000 CHECK (max_bet_cents >= min_bet_cents),
  speed text NOT NULL DEFAULT 'regular' CHECK (speed IN ('regular', 'fast', 'blitz')),
  platform_fee_pct integer NOT NULL DEFAULT 10 CHECK (platform_fee_pct >= 0 AND platform_fee_pct <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS celo_rooms_status ON public.celo_rooms (status);
CREATE INDEX IF NOT EXISTS celo_rooms_banker_id ON public.celo_rooms (banker_id);
CREATE INDEX IF NOT EXISTS celo_rooms_join_code ON public.celo_rooms (join_code) WHERE join_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.celo_room_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.celo_rooms (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('banker', 'player', 'spectator')),
  bet_cents integer NOT NULL DEFAULT 0 CHECK (bet_cents >= 0),
  seat_number integer,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS celo_room_players_room ON public.celo_room_players (room_id);
CREATE INDEX IF NOT EXISTS celo_room_players_user ON public.celo_room_players (user_id);

CREATE TABLE IF NOT EXISTS public.celo_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.celo_rooms (id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  banker_id uuid REFERENCES public.users (id),
  status text NOT NULL DEFAULT 'betting' CHECK (status IN ('betting', 'banker_rolling', 'player_rolling', 'completed')),
  banker_roll integer[],
  banker_roll_name text,
  banker_roll_result text CHECK (banker_roll_result IS NULL OR banker_roll_result IN ('instant_win', 'instant_loss', 'point', 'no_count')),
  banker_point integer,
  total_pot_cents integer NOT NULL DEFAULT 0 CHECK (total_pot_cents >= 0),
  platform_fee_cents integer NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (room_id, round_number)
);

CREATE INDEX IF NOT EXISTS celo_rounds_room ON public.celo_rounds (room_id);

CREATE TABLE IF NOT EXISTS public.celo_player_rolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.celo_rounds (id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.celo_rooms (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  roll_number integer NOT NULL DEFAULT 1,
  dice integer[] NOT NULL,
  roll_name text,
  roll_result text CHECK (roll_result IS NULL OR roll_result IN ('instant_win', 'instant_loss', 'point', 'no_count')),
  point integer,
  bet_cents integer NOT NULL CHECK (bet_cents >= 0),
  outcome text CHECK (outcome IS NULL OR outcome IN ('win', 'loss', 'reroll')),
  payout_cents integer NOT NULL DEFAULT 0,
  platform_fee_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS celo_player_rolls_round ON public.celo_player_rolls (round_id);

CREATE TABLE IF NOT EXISTS public.celo_side_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.celo_rooms (id) ON DELETE CASCADE,
  round_id uuid REFERENCES public.celo_rounds (id) ON DELETE SET NULL,
  creator_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  acceptor_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  bet_type text NOT NULL,
  target_player_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  specific_point integer,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  odds_multiplier numeric NOT NULL DEFAULT 2.0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'matched', 'locked', 'won', 'lost', 'cancelled', 'expired')),
  winner_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  platform_fee_cents integer NOT NULL DEFAULT 0,
  payout_cents integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE INDEX IF NOT EXISTS celo_side_bets_room ON public.celo_side_bets (room_id);

CREATE TABLE IF NOT EXISTS public.celo_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.celo_rooms (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS celo_chat_room ON public.celo_chat (room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.celo_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES public.celo_rooms (id) ON DELETE SET NULL,
  round_id uuid REFERENCES public.celo_rounds (id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.celo_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.celo_room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.celo_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.celo_player_rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.celo_side_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.celo_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.celo_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read public rooms" ON public.celo_rooms;
DROP POLICY IF EXISTS "Members read rooms" ON public.celo_rooms;
DROP POLICY IF EXISTS "Users create rooms" ON public.celo_rooms;

CREATE POLICY "Members read rooms"
  ON public.celo_rooms FOR SELECT TO authenticated
  USING (
    room_type = 'public'
    OR creator_id = auth.uid()
    OR banker_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.celo_room_players p
      WHERE p.room_id = celo_rooms.id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users create rooms"
  ON public.celo_rooms FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "Players in room can read players" ON public.celo_room_players;
DROP POLICY IF EXISTS "Users join rooms" ON public.celo_room_players;

CREATE POLICY "Players in room can read players"
  ON public.celo_room_players FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.celo_room_players self
      WHERE self.room_id = celo_room_players.room_id AND self.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.celo_rooms r
      WHERE r.id = celo_room_players.room_id AND r.room_type = 'public'
    )
  );

CREATE POLICY "Users join rooms"
  ON public.celo_room_players FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users read rounds" ON public.celo_rounds;
CREATE POLICY "Users read rounds"
  ON public.celo_rounds FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.celo_room_players p
      WHERE p.room_id = celo_rounds.room_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.celo_rooms r
      WHERE r.id = celo_rounds.room_id AND r.room_type = 'public'
    )
  );

DROP POLICY IF EXISTS "Users read rolls" ON public.celo_player_rolls;
CREATE POLICY "Users read rolls"
  ON public.celo_player_rolls FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.celo_room_players p
      WHERE p.room_id = celo_player_rolls.room_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users read side bets" ON public.celo_side_bets;
CREATE POLICY "Users read side bets"
  ON public.celo_side_bets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.celo_room_players p
      WHERE p.room_id = celo_side_bets.room_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users create side bets" ON public.celo_side_bets;
CREATE POLICY "Users create side bets"
  ON public.celo_side_bets FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "Users read chat" ON public.celo_chat;
CREATE POLICY "Users read chat"
  ON public.celo_chat FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.celo_room_players p
      WHERE p.room_id = celo_chat.room_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users send chat" ON public.celo_chat;
CREATE POLICY "Users send chat"
  ON public.celo_chat FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin reads audit log" ON public.celo_audit_log;
CREATE POLICY "No direct audit read"
  ON public.celo_audit_log FOR SELECT TO authenticated
  USING (false);

COMMENT ON TABLE public.celo_rooms IS 'C-Lo street dice rooms; mutations should use service role / API.';
