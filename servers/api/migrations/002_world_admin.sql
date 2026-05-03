alter table worlds
  add column if not exists name text,
  add column if not exists host text,
  add column if not exists port int check (port is null or (port > 0 and port < 65536)),
  add column if not exists ws_url text,
  add column if not exists public_url text,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists pid int,
  add column if not exists current_bots int not null default 0 check (current_bots >= 0),
  add column if not exists current_spectators int not null default 0 check (current_spectators >= 0),
  add column if not exists tick_rate numeric not null default 0 check (tick_rate >= 0),
  add column if not exists load_score numeric not null default 0 check (load_score >= 0),
  add column if not exists auto_created boolean not null default false,
  add column if not exists drain_at timestamptz,
  add column if not exists last_error text,
  add column if not exists sort_order int not null default 0;

update worlds
set name = initcap(replace(slug, '-', ' '))
where name is null;

alter table worlds
  alter column name set not null,
  alter column name set default 'Blobz World';

create index if not exists worlds_status_capacity_idx
  on worlds (status, current_players, hard_cap, load_score);

create index if not exists worlds_last_heartbeat_idx
  on worlds (last_heartbeat_at desc);

create table if not exists world_events (
  id uuid primary key default gen_random_uuid(),
  world_id uuid references worlds(id) on delete set null,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists world_events_world_created_idx
  on world_events (world_id, created_at desc);

insert into worlds (
  slug,
  name,
  mode,
  region,
  status,
  soft_cap,
  hard_cap,
  current_players,
  current_bots,
  current_spectators,
  host,
  port,
  ws_url,
  public_url,
  server_url,
  auto_created,
  metadata
)
values (
  'main',
  'Main Arena',
  'classic',
  'eu',
  'active',
  70,
  100,
  0,
  0,
  0,
  '127.0.0.1',
  9999,
  'ws://127.0.0.1:9999/ws1/',
  'http://127.0.0.1:8082/',
  'ws://127.0.0.1:9999/ws1/',
  false,
  '{"kind":"default"}'::jsonb
)
on conflict (slug) do update
set name = excluded.name,
    mode = excluded.mode,
    region = excluded.region,
    soft_cap = excluded.soft_cap,
    hard_cap = excluded.hard_cap,
    host = coalesce(worlds.host, excluded.host),
    port = coalesce(worlds.port, excluded.port),
    ws_url = coalesce(worlds.ws_url, excluded.ws_url),
    public_url = coalesce(worlds.public_url, excluded.public_url),
    server_url = coalesce(worlds.server_url, excluded.server_url),
    updated_at = now();
