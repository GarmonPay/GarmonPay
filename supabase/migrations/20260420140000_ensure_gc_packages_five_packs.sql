-- Ensure all five storefront packs exist and are purchasable.
-- Buy Coins UI loads GET /api/coins/packages → gc_packages WHERE is_active = true ORDER BY price_cents.

INSERT INTO public.gc_packages (name, price_cents, gold_coins, bonus_sweeps_coins, bonus_label, is_featured, is_active)
SELECT 'Starter Pack', 999, 1000, 200, '200 GPC FREE', false, true
WHERE NOT EXISTS (SELECT 1 FROM public.gc_packages WHERE name = 'Starter Pack');

INSERT INTO public.gc_packages (name, price_cents, gold_coins, bonus_sweeps_coins, bonus_label, is_featured, is_active)
SELECT 'Popular Pack', 2499, 2500, 750, '750 GPC FREE', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.gc_packages WHERE name = 'Popular Pack');

INSERT INTO public.gc_packages (name, price_cents, gold_coins, bonus_sweeps_coins, bonus_label, is_featured, is_active)
SELECT 'Pro Pack', 4999, 5000, 2000, '2,000 GPC FREE', false, true
WHERE NOT EXISTS (SELECT 1 FROM public.gc_packages WHERE name = 'Pro Pack');

INSERT INTO public.gc_packages (name, price_cents, gold_coins, bonus_sweeps_coins, bonus_label, is_featured, is_active)
SELECT 'Elite Pack', 9999, 10000, 5000, '5,000 GPC FREE', false, true
WHERE NOT EXISTS (SELECT 1 FROM public.gc_packages WHERE name = 'Elite Pack');

INSERT INTO public.gc_packages (name, price_cents, gold_coins, bonus_sweeps_coins, bonus_label, is_featured, is_active)
SELECT 'VIP Pack', 24999, 25000, 15000, '15,000 GPC FREE', false, true
WHERE NOT EXISTS (SELECT 1 FROM public.gc_packages WHERE name = 'VIP Pack');

-- If VIP was hidden with is_active = false, show it again (other packs unchanged).
UPDATE public.gc_packages
SET is_active = true
WHERE name = 'VIP Pack';
