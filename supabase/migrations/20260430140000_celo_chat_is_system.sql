-- System messages in C-Lo chat (gold centered lines; no avatar in UI)
ALTER TABLE public.celo_chat
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
