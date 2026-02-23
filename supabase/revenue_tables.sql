create table if not exists advertisers (
  id uuid primary key default uuid_generate_v4(),
  email text,
  balance numeric default 0,
  created_at timestamp default now()
);

create table if not exists earnings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid,
  amount numeric,
  platform_fee numeric,
  user_amount numeric,
  created_at timestamp default now()
);

create table if not exists withdrawals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid,
  amount numeric,
  status text default 'pending',
  created_at timestamp default now()
);

create table if not exists platform_revenue (
  id uuid primary key default uuid_generate_v4(),
  amount numeric,
  source text,
  created_at timestamp default now()
);
