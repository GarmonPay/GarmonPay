-- Enable RLS on public.users (idempotent; no effect if already enabled).
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own profile row (e.g. on signup).
CREATE POLICY "Allow user insert own profile"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Allow authenticated users to read their own profile.
CREATE POLICY "Allow user read own profile"
ON public.users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Allow authenticated users to update their own profile.
CREATE POLICY "Allow user update own profile"
ON public.users
FOR UPDATE
TO authenticated
USING (auth.uid() = id);
