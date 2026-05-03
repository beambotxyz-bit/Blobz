create extension if not exists pgcrypto;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique,
  username text,
  first_name text,
  last_name text,
  photo_url text,
  display_name text not null,
  level int not null default 0 check (level >= 0 and level <= 50),
  xp bigint not null default 0 check (xp >= 0),
  gems bigint not null default 0 check (gems >= 0),
  cups bigint not null default 0 check (cups >= 0),
  selected_player_skin_id uuid,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists level_curve (
  level int primary key check (level >= 0 and level <= 50),
  total_xp_required bigint not null unique check (total_xp_required >= 0)
);

insert into level_curve (level, total_xp_required)
select
  gs.level,
  case
    when gs.level = 0 then 0
    else (700 * gs.level + 60 * gs.level * (gs.level - 1))::bigint
  end
from generate_series(0, 50) as gs(level)
on conflict (level) do nothing;

create table if not exists skins (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  rarity text not null default 'common',
  image_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists skin_mint_counters (
  skin_id uuid primary key references skins(id) on delete cascade,
  next_serial bigint not null default 1 check (next_serial > 0),
  updated_at timestamptz not null default now()
);

insert into skins (slug, name, rarity, image_path)
values ('base', 'Base', 'common', '/skins/Base.png')
on conflict (slug) do update
set name = excluded.name,
    rarity = excluded.rarity,
    image_path = excluded.image_path,
    updated_at = now();

insert into skin_mint_counters (skin_id, next_serial)
select id, 1 from skins
on conflict (skin_id) do nothing;

create table if not exists worlds (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  mode text not null default 'classic',
  region text not null default 'eu',
  status text not null default 'active',
  soft_cap int not null default 70 check (soft_cap > 0),
  hard_cap int not null default 100 check (hard_cap >= soft_cap),
  current_players int not null default 0 check (current_players >= 0),
  server_url text,
  metadata jsonb not null default '{}',
  created_by_admin_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  world_id uuid references worlds(id) on delete set null,
  player_id uuid not null references players(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  exit_reason text,
  survival_seconds int not null default 0 check (survival_seconds >= 0),
  food_eaten int not null default 0 check (food_eaten >= 0),
  xp_pickups int not null default 0 check (xp_pickups >= 0),
  gem_pickups int not null default 0 check (gem_pickups >= 0),
  kills int not null default 0 check (kills >= 0),
  deaths int not null default 0 check (deaths >= 0),
  max_mass numeric not null default 0 check (max_mass >= 0),
  final_mass numeric not null default 0 check (final_mass >= 0),
  xp_earned bigint not null default 0 check (xp_earned >= 0),
  gems_earned bigint not null default 0 check (gems_earned >= 0),
  cups_earned bigint not null default 0 check (cups_earned >= 0),
  metadata jsonb not null default '{}',
  finalized_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists player_skins (
  id uuid primary key default gen_random_uuid(),
  owner_player_id uuid not null references players(id) on delete cascade,
  skin_id uuid not null references skins(id) on delete restrict,
  serial_number bigint not null check (serial_number > 0),
  acquired_from text not null,
  acquired_match_id uuid references matches(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (skin_id, serial_number)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'players_selected_player_skin_id_fkey'
  ) then
    alter table players
      add constraint players_selected_player_skin_id_fkey
      foreign key (selected_player_skin_id)
      references player_skins(id)
      on delete set null;
  end if;
end $$;

create table if not exists item_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null,
  is_stackable boolean not null default true,
  is_active boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into item_types (slug, name, kind, is_stackable)
values
  ('shield', 'Shield', 'boost', true),
  ('spike', 'Spike', 'boost', true),
  ('freeze', 'Freeze', 'boost', true)
on conflict (slug) do update
set name = excluded.name,
    kind = excluded.kind,
    is_stackable = excluded.is_stackable,
    updated_at = now();

create table if not exists player_items (
  player_id uuid not null references players(id) on delete cascade,
  item_type_id uuid not null references item_types(id) on delete restrict,
  quantity bigint not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, item_type_id)
);

create table if not exists reward_ledger (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  match_id uuid references matches(id) on delete set null,
  currency text,
  amount bigint not null,
  reason text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists economy_settings (
  key text primary key,
  value jsonb not null,
  version int not null default 1 check (version > 0),
  updated_by_admin_id uuid,
  updated_at timestamptz not null default now()
);

insert into economy_settings (key, value)
values
  ('player_start', '{"mass":10,"level":0,"maxLevel":50}'::jsonb),
  ('world_caps', '{"softCap":70,"hardCap":100,"targetTickRate":20}'::jsonb),
  ('reward_formula', '{"xpPerSecond":1,"xpPerFood":1,"xpPerXpPickup":25,"xpPerKill":120,"gemsPerGemPickup":1,"gemsPerKill":2,"cupsPerMinute":1,"cupsPerKill":4,"maxXpPerMatch":5000,"maxGemsPerMatch":250,"maxCupsPerMatch":500}'::jsonb)
on conflict (key) do nothing;

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete set null,
  email text unique,
  role text not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references admin_users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  before_value jsonb,
  after_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create or replace function blobz_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists players_set_updated_at on players;
create trigger players_set_updated_at
before update on players
for each row execute function blobz_set_updated_at();

drop trigger if exists skins_set_updated_at on skins;
create trigger skins_set_updated_at
before update on skins
for each row execute function blobz_set_updated_at();

drop trigger if exists worlds_set_updated_at on worlds;
create trigger worlds_set_updated_at
before update on worlds
for each row execute function blobz_set_updated_at();

drop trigger if exists item_types_set_updated_at on item_types;
create trigger item_types_set_updated_at
before update on item_types
for each row execute function blobz_set_updated_at();
