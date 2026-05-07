-- Enforce usernames on public.users and expose availability RPC.

DO $$
DECLARE
  v_row RECORD;
  v_base text;
  v_candidate text;
  v_suffix int;
  v_missing int;
  v_reserved text[] := ARRAY[
    'admin', 'garmonpay', 'support', 'mod', 'moderator', 'system',
    'official', 'bishop', 'anthropic', 'claude', 'root', 'null'
  ];
BEGIN
  LOOP
    SELECT id, email
    INTO v_row
    FROM public.users
    WHERE username IS NULL OR trim(username) = ''
    LIMIT 1;

    EXIT WHEN NOT FOUND;

    v_base := lower(
      regexp_replace(
        split_part(COALESCE(v_row.email, ''), '@', 1),
        '[^a-zA-Z0-9_]+',
        '',
        'g'
      )
    );

    IF v_base IS NULL OR v_base = '' THEN
      v_base := 'user' || right(replace(v_row.id::text, '-', ''), 4);
    END IF;

    v_base := left(v_base, 20);
    IF length(v_base) < 3 THEN
      v_base := rpad(v_base, 3, '0');
    END IF;

    v_candidate := v_base;
    v_suffix := 1;

    LOOP
      EXIT WHEN
        v_candidate ~ '^[a-zA-Z0-9_]{3,20}$'
        AND NOT (lower(v_candidate) = ANY(v_reserved))
        AND NOT EXISTS (
          SELECT 1
          FROM public.users u
          WHERE lower(u.username) = lower(v_candidate)
            AND u.id <> v_row.id
        );

      v_suffix := v_suffix + 1;
      v_candidate := left(v_base, GREATEST(1, 20 - length(v_suffix::text))) || v_suffix::text;
      IF length(v_candidate) < 3 THEN
        v_candidate := rpad(v_candidate, 3, '0');
      END IF;
    END LOOP;

    UPDATE public.users
    SET username = v_candidate
    WHERE id = v_row.id;
  END LOOP;

  SELECT count(*) INTO v_missing
  FROM public.users
  WHERE username IS NULL OR trim(username) = '';

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'username backfill incomplete; % rows still null/empty', v_missing;
  END IF;
END
$$;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_username_format_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_username_format_check
  CHECK (username ~ '^[a-zA-Z0-9_]{3,20}$');

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
  ON public.users (lower(username));

DO $$
DECLARE
  v_missing int;
BEGIN
  SELECT count(*) INTO v_missing
  FROM public.users
  WHERE username IS NULL OR trim(username) = '';

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'cannot set username NOT NULL; % rows still null/empty', v_missing;
  END IF;
END
$$;

ALTER TABLE public.users
  ALTER COLUMN username SET NOT NULL;

CREATE OR REPLACE FUNCTION public.check_username_available(candidate text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_candidate text := lower(trim(COALESCE(candidate, '')));
  v_reserved text[] := ARRAY[
    'admin', 'garmonpay', 'support', 'mod', 'moderator', 'system',
    'official', 'bishop', 'anthropic', 'claude', 'root', 'null'
  ];
BEGIN
  IF v_candidate = '' THEN
    RETURN false;
  END IF;
  IF length(v_candidate) < 3 OR length(v_candidate) > 20 THEN
    RETURN false;
  END IF;
  IF v_candidate !~ '^[a-zA-Z0-9_]+$' THEN
    RETURN false;
  END IF;
  IF v_candidate = ANY(v_reserved) THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(username) = v_candidate
  ) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO service_role;
