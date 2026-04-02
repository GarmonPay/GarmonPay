-- Ensure authenticated users can insert rooms they create (idempotent).
DROP POLICY IF EXISTS "Users create rooms" ON public.celo_rooms;
CREATE POLICY "Users create rooms"
  ON public.celo_rooms FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());
