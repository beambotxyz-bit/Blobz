# Blobz API

This service is the persistent backend foundation for Blobz player identity, economy, inventory, skin minting, match rewards, and future admin/world controls.

The current game client and Agar websocket server can keep running while this service is developed.

## Local Setup

```powershell
cd servers/api
npm install
Copy-Item .env.example .env
```

Edit `.env` and set:

- `DATABASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `SESSION_SECRET`
- `INTERNAL_API_TOKEN`
- `CORS_ORIGINS`
- `CLIENT_PUBLIC_BASE`
- `ADMIN_TOKEN`

Then run:

```powershell
npm run migrate
npm start
```

For local database services with Docker:

```powershell
docker compose up -d postgres redis
```

Default local URL:

```text
http://127.0.0.1:8787
```

## Public Endpoints

```text
GET  /health
GET  /ready
GET  /economy/settings
POST /auth/telegram
GET  /me
GET  /me/inventory
POST /me/skin/equip
POST /worlds/assign
```

`POST /auth/telegram` expects:

```json
{
  "initData": "Telegram.WebApp.initData"
}
```

It validates the Telegram Mini App payload server-side, creates or updates the player, and returns a signed Blobz session token.

Authenticated player endpoints use:

```text
Authorization: Bearer <token>
```

## Internal Game Server Endpoints

These routes are for the authoritative game server and future admin tooling. They require:

```text
X-Internal-Token: <INTERNAL_API_TOKEN>
```

```text
POST /internal/matches/finalize
POST /internal/worlds/heartbeat
POST /internal/skins/mint
POST /internal/items/grant
```

Example match finalization:

```json
{
  "matchId": "4c74f1c0-0c40-46aa-9e8e-222e309bb835",
  "playerId": "8f6268db-0d9a-4b40-9c54-6a49b30d8699",
  "exitReason": "death",
  "stats": {
    "survivalSeconds": 420,
    "foodEaten": 180,
    "xpPickups": 4,
    "gemPickups": 2,
    "kills": 3,
    "deaths": 1,
    "maxMass": 980,
    "finalMass": 0
  },
  "items": [
    { "slug": "shield", "quantity": 1 }
  ],
  "skins": [
    { "slug": "base", "acquiredFrom": "match_drop" }
  ]
}
```

By default, XP/gems/cups are calculated by the API from `economy_settings.reward_formula`. The game server should send match stats, not client-calculated totals.

If the same `matchId` is finalized again, the API returns `alreadyFinalized: true` and does not pay rewards twice.

## Skin Serial Numbers

Every skin win is minted in a PostgreSQL transaction.

The API locks the counter for that exact skin, assigns the next serial, inserts the owned skin, and then increments the counter. This guarantees unique serials like:

```text
Base #1
Base #2
Base #3
```

The database also enforces `unique (skin_id, serial_number)`.

## Game Server Integration

The browser passes the Blobz session token to the Agar websocket as a `session` query parameter for online accounts. The Agar server verifies that token against:

```text
BLOBZ_API_BASE/me
```

When the player dies or disconnects, the Agar server posts trusted match stats to:

```text
POST /internal/matches/finalize
```

The Agar server reads:

```text
BLOBZ_API_BASE=http://127.0.0.1:8787
BLOBZ_INTERNAL_API_TOKEN=<same value as INTERNAL_API_TOKEN>
BLOBZ_WORLD_SLUG=main
BLOBZ_WORLD_PORT=9999
```

## Admin Panel

Open the admin workspace at:

```text
http://127.0.0.1:8787/admin
```

It uses `X-Admin-Token` and stores the token in browser local storage for local development.

For production, prefer `ADMIN_TOKEN_HASH` instead of a raw `ADMIN_TOKEN`. Generate it with:

```powershell
node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "your-admin-token"
```

Current admin routes:

```text
GET    /admin/summary
GET    /admin/config
GET    /admin/worlds
POST   /admin/worlds
PATCH  /admin/worlds/:id
DELETE /admin/worlds/:id
GET    /admin/players
GET    /admin/matches
```

World assignment chooses an active world below capacity. If every active world is full, the API creates a provisioning world record so an operator or future supervisor can start a matching game process.

The API includes a lightweight world supervisor. When enabled, it starts any world marked `provisioning` and keeps the spawned process attached to the API lifecycle. It only stops processes it spawned itself.

The admin panel uses `/admin/config` and `CLIENT_PUBLIC_BASE` to open a selected world in spectate mode. Locally this points at `http://127.0.0.1:8082`; in production it should be the public game client URL.

Supervisor environment:

```text
CLIENT_PUBLIC_BASE=http://127.0.0.1:8082
WORLD_SUPERVISOR_ENABLED=1
WORLD_SUPERVISOR_INTERVAL_MS=5000
GAME_SERVER_CWD=../agarv1/src
GAME_SERVER_ENTRY=index.js
GAME_SERVER_LOG_DIR=../../output/worlds
```

You can still start an extra world process manually with:

```powershell
cd servers/agarv1/src
node index.js --noconsole --world=eu-2 --port=10000
```

When PostgreSQL is unavailable in local development, `/worlds/assign`, `/internal/worlds/heartbeat`, and the read-only admin routes return a safe local fallback so browser gameplay still launches on the main arena.

## Next Integration Steps

1. Add admin authentication users/roles instead of only the shared `ADMIN_TOKEN`.
2. Add server-authoritative purchases, daily rewards, boosts, and pickup spawning.
3. Add per-world player presence detail.
4. Add process health alerts and restart policies for production hosting.
