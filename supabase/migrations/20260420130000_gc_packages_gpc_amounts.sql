-- Align gc_packages with product copy: GC + bonus GPC per pack (Stripe checkout uses these rows).

UPDATE public.gc_packages
SET
  price_cents = 999,
  gold_coins = 1000,
  bonus_sweeps_coins = 200,
  bonus_label = '200 GPC FREE'
WHERE name = 'Starter Pack';

UPDATE public.gc_packages
SET
  price_cents = 2499,
  gold_coins = 2500,
  bonus_sweeps_coins = 750,
  bonus_label = '750 GPC FREE',
  is_featured = true
WHERE name = 'Popular Pack';

UPDATE public.gc_packages
SET
  price_cents = 4999,
  gold_coins = 5000,
  bonus_sweeps_coins = 2000,
  bonus_label = '2,000 GPC FREE',
  is_featured = false
WHERE name = 'Pro Pack';

UPDATE public.gc_packages
SET
  price_cents = 9999,
  gold_coins = 10000,
  bonus_sweeps_coins = 5000,
  bonus_label = '5,000 GPC FREE',
  is_featured = false
WHERE name = 'Elite Pack';

UPDATE public.gc_packages
SET
  price_cents = 24999,
  gold_coins = 25000,
  bonus_sweeps_coins = 15000,
  bonus_label = '15,000 GPC FREE',
  is_featured = false
WHERE name = 'VIP Pack';
