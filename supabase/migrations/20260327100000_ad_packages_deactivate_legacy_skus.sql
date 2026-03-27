-- Hide pre-catalog legacy advertiser SKUs when the canonical *_reach packages exist.
-- Prevents duplicate "Starter" cards (legacy seed used id `starter` + name `Starter` alongside newer rows).

UPDATE public.ad_packages legacy
SET is_active = false
WHERE legacy.id IN ('starter', 'creator', 'pro', 'business', 'enterprise')
  AND EXISTS (
    SELECT 1 FROM public.ad_packages c
    WHERE c.id = 'basic_reach' AND COALESCE(c.is_active, true) = true
  );
