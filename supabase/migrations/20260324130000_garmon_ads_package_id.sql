-- Optional link from a campaign row to the SKU purchased (dashboard package picker).

ALTER TABLE public.garmon_ads
  ADD COLUMN IF NOT EXISTS ad_package_id TEXT REFERENCES public.ad_packages (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS garmon_ads_ad_package_id_idx ON public.garmon_ads (ad_package_id)
  WHERE ad_package_id IS NOT NULL;
