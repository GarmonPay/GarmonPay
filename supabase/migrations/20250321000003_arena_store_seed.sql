-- Seed arena store categories and sample items. price in dollars; coin_price in arena coins.
insert into public.arena_store_items (category, name, description, price, coin_price, stat_bonuses, effect_class, emoji, is_active) values
  ('Gloves', 'Basic Gloves', '+2 Strength', 4.99, null, '{"strength": 2}', null, '🥊', true),
  ('Gloves', 'Pro Gloves', '+5 Strength', 9.99, 500, '{"strength": 5}', null, '🥊', true),
  ('Shoes', 'Speed Sneakers', '+3 Speed', 4.99, null, '{"speed": 3}', null, '👟', true),
  ('Shoes', 'Elite Boots', '+6 Speed', 12.99, 650, '{"speed": 6}', null, '👟', true),
  ('Shorts', 'Training Shorts', '+2 Stamina', 3.99, null, '{"stamina": 2}', null, '🩳', true),
  ('Shorts', 'Champion Shorts', '+5 Stamina', 8.99, 450, '{"stamina": 5}', null, '🩳', true),
  ('Headgear', 'Basic Headgear', '+2 Defense', 5.99, null, '{"defense": 2}', null, '🪖', true),
  ('Headgear', 'Titan Helmet', '+5 Defense, +2 Chin', 14.99, 700, '{"defense": 5, "chin": 2}', null, '🪖', true),
  ('Special Upgrades', 'Combo Boost', '+3 Special', 6.99, 350, '{"special": 3}', null, '⚡', true),
  ('Special Upgrades', 'Finisher Pack', '+8 Special', 19.99, 1000, '{"special": 8}', null, '💥', true),
  ('Titles', 'Rookie', 'Title: Rookie', 2.99, 200, '{}', 'title', '🏅', true),
  ('Titles', 'Champion', 'Title: Champion', 9.99, 800, '{}', 'title', '🏆', true),
  ('Recovery', 'Full Recovery', 'Remove injured/tired; +0 stats', 4.99, 250, '{}', 'recovery', '💊', true),
  ('Training Camp', 'One-Fight Buff', '+3 to one stat for next fight only', 14.99, null, '{"temp_buff": 3}', 'training_camp', '⛺', true),
  ('Arena Coins', '100 Arena Coins', 'One-way currency for store', 0.99, null, '{}', 'coins', '🪙', true),
  ('Arena Coins', '500 Arena Coins', 'One-way currency for store', 3.99, null, '{}', 'coins', '🪙', true),
  ('Arena Coins', '1200 Arena Coins', 'Best value', 7.99, null, '{}', 'coins', '🪙', true)
on conflict do nothing;
