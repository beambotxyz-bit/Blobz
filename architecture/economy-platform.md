# Blobz Economy and Platform Blueprint

This document is the implementation contract for turning Blobz from a local browser game into a persistent Telegram and browser game with player-owned rewards, inventory, lobbies, and admin controls.

## Core Rules

- The game client only displays state and sends player intent.
- The game server is authoritative for match events: food eaten, kills, pickups, boost use, deaths, exits, and disconnects.
- PostgreSQL is the permanent source of truth for players, currencies, inventory, skins, rewards, worlds, and admin changes.
- Redis is the fast runtime registry for active worlds, player counts, matchmaking, short-lived sessions, and server heartbeats.
- Rewards are finalized once per match, on death, manual exit, disconnect timeout, or server shutdown recovery.
- Players start at level 0 with 10 mass.
- Player level is capped at 50.
- XP, gems, cups, skins, shields, spikes, freezes, and boosts belong to individual players.
- Admin changes must be audited so economy mistakes can be traced and rolled back.

## Player Identity

Telegram is the primary identity provider.

- The frontend receives Telegram WebApp `initData`.
- The backend validates `initData` using the Telegram bot token.
- The backend creates or updates one player profile for the Telegram user id.
- The in-game name defaults to the Telegram username, then first name, then a generated Blobz name if no username exists.
- Browser-only guests can play test sessions, but persistent rewards should require a verified Telegram or account session.

Required player fields:

- `telegram_id`: stable Telegram user id.
- `username`: latest Telegram username snapshot.
- `display_name`: game display name.
- `level`: current level, from 0 to 50.
- `xp`: total XP.
- `gems`: spendable premium or soft currency.
- `cups`: ranking or trophy currency.
- `selected_skin_id`: equipped owned skin.
- `created_at` / `updated_at`.

## Match Lifecycle

Every player session should have a match record.

1. Player authenticates.
2. Matchmaker assigns a world.
3. Game server starts a match session with `start_mass = 10`.
4. Game server tracks match stats in memory.
5. Game server emits reward events during play, but does not trust the client for reward totals.
6. On exit, death, disconnect timeout, or world shutdown, the server finalizes rewards exactly once.
7. Backend stores the match result, reward events, currency changes, item drops, and any skin mints.

Tracked match stats:

- survival seconds
- food dots eaten
- XP pickups collected
- gem pickups collected
- kills
- deaths
- max mass reached
- final mass
- boosts used
- boosts earned
- skins earned
- disconnect or exit reason

## Reward Economy

Reward formulas should live in database-backed config, not hardcoded inside the client.

Base XP inputs:

- time played
- food dots eaten
- XP pickups collected
- kills
- match placement or survival bonus

Base gem inputs:

- gem pickups collected
- kill bonus
- rare drop bonus
- daily or event modifiers

Cup inputs:

- placement
- kills
- survival
- lobby strength
- anti-farming adjustments

Example configurable formula:

```text
xp_earned =
  survival_seconds * xp_per_second
  + food_eaten * xp_per_food
  + xp_pickups
  + kills * xp_per_kill

gems_earned =
  gem_pickups
  + kills * gems_per_kill
  + placement_bonus
```

Important limits:

- Set per-match reward caps.
- Set per-day soft caps for XP/gems if needed.
- Apply anti-farming rules for repeated kills against the same player.
- Store every reward as a ledger entry so balances can be rebuilt.

## Leveling

Players start at level 0 and can reach level 50.

Levels should come from a `level_curve` table:

- level 0: 0 XP
- level 1: configured XP
- ...
- level 50: maximum level

Recommended rule:

- Levels should unlock cosmetics, boost slots, quests, or profile status first.
- If levels affect gameplay power, the bonus must be small, capped, and visible in admin balancing tools.
- Start mass remains 10 unless a special mode or admin-configured event changes it.

## Personalized Skin Numbering

Skins are minted per skin type with permanent serial numbers.

Example:

- First player to earn the Neon skin gets `Neon #1`.
- Second player to earn the Neon skin gets `Neon #2`.
- The serial number stays attached to that owned skin forever.

This must be done with an atomic database transaction.

Transaction rule:

1. Lock the skin counter row for the skin type.
2. Increment `next_serial`.
3. Insert the owned skin with that serial.
4. Commit.

Database guarantees:

- `player_skins.skin_id + serial_number` must be unique.
- `player_skins.owner_player_id` controls who can equip it.
- If trading is added later, ownership may move, but the serial number never changes.

## Personal Inventory

All economy objects belong to the player.

Permanent or ledger-backed:

- XP
- gems
- cups
- skins
- achievements
- season records

Consumable or stackable:

- shields
- spikes
- freezes
- boosts
- event tickets

Boost rules:

- The client can request boost use.
- The game server validates ownership, cooldown, and current match state.
- The backend decrements inventory only after the server accepts the use.
- Match effects are server-side so clients cannot fake shields, spikes, or freezes.

## Worlds and Lobbies

A world is one running game map.

World manager responsibilities:

- Keep active world registry in Redis.
- Track current player count and health.
- Assign players to the best world by region, mode, player count, and capacity.
- Create a new world automatically when active worlds pass the soft cap.
- Block joins when a world hits the hard cap.
- Let admins create, pause, delete, drain, or restart worlds.

Recommended first caps:

- soft cap: 70 players per world
- hard cap: 100 players per world
- target server update rate: 20 Hz minimum, 30 Hz ideal if stable

For international players:

- Start with one region while prototyping.
- Add region-aware world pools later: EU, US, Asia.
- Keep player sessions sticky to one world until match exit.

## Admin Panel

The admin panel should control the economy and worlds without editing code.

Admin features:

- Player search by Telegram id, username, display name.
- View player inventory, level, XP, gems, cups, skins, and match history.
- Grant or remove gems, cups, skins, and boosts.
- Edit level curve and reward formulas.
- Edit drop rates for skins, XP pickups, gems, shields, spikes, freezes, and boosts.
- Create, delete, pause, drain, and restart game worlds.
- Spectate active worlds.
- View active player counts and server health.
- Review economy audit logs.

Admin safety:

- Every admin action writes an audit log.
- High-impact changes require a reason.
- Economy config changes should be versioned.

## Suggested PostgreSQL Tables

```sql
create table players (
  id uuid primary key,
  telegram_id bigint unique,
  username text,
  display_name text not null,
  level int not null default 0 check (level >= 0 and level <= 50),
  xp bigint not null default 0 check (xp >= 0),
  gems bigint not null default 0 check (gems >= 0),
  cups bigint not null default 0 check (cups >= 0),
  selected_skin_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table skins (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  rarity text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table skin_mint_counters (
  skin_id uuid primary key references skins(id),
  next_serial bigint not null default 1
);

create table player_skins (
  id uuid primary key,
  owner_player_id uuid not null references players(id),
  skin_id uuid not null references skins(id),
  serial_number bigint not null,
  acquired_from text not null,
  acquired_match_id uuid,
  equipped boolean not null default false,
  created_at timestamptz not null default now(),
  unique (skin_id, serial_number)
);

create table item_types (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  kind text not null,
  is_stackable boolean not null default true,
  is_active boolean not null default true
);

create table player_items (
  player_id uuid not null references players(id),
  item_type_id uuid not null references item_types(id),
  quantity bigint not null default 0 check (quantity >= 0),
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (player_id, item_type_id, expires_at)
);

create table worlds (
  id uuid primary key,
  slug text not null unique,
  mode text not null,
  region text not null,
  status text not null,
  soft_cap int not null,
  hard_cap int not null,
  server_url text,
  created_by_admin_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table matches (
  id uuid primary key,
  world_id uuid references worlds(id),
  player_id uuid not null references players(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  exit_reason text,
  survival_seconds int not null default 0,
  food_eaten int not null default 0,
  xp_pickups int not null default 0,
  gem_pickups int not null default 0,
  kills int not null default 0,
  deaths int not null default 0,
  max_mass numeric not null default 0,
  final_mass numeric not null default 0,
  xp_earned bigint not null default 0,
  gems_earned bigint not null default 0,
  cups_earned bigint not null default 0,
  finalized_at timestamptz,
  unique (id, player_id)
);

create table reward_ledger (
  id uuid primary key,
  player_id uuid not null references players(id),
  match_id uuid references matches(id),
  currency text,
  amount bigint not null,
  reason text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table economy_settings (
  key text primary key,
  value jsonb not null,
  version int not null default 1,
  updated_by_admin_id uuid,
  updated_at timestamptz not null default now()
);

create table admin_audit_log (
  id uuid primary key,
  admin_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  before_value jsonb,
  after_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);
```

## First Implementation Slice

Build this in layers:

1. Add backend API service with PostgreSQL connection, migrations, and environment config.
2. Add Telegram auth validation and player profile creation.
3. Add player profile endpoint for lobby display.
4. Add server-side match session tracking in the Agar server.
5. Add match finalization and reward ledger writes.
6. Add skin minting transaction and personal inventory.
7. Add admin panel for players, economy settings, and worlds.
8. Add world manager and multi-world routing.
9. Add spectate mode for admins.

The first code milestone should not change the current game feel. It should only create the persistent identity and economy foundation behind the existing game.
