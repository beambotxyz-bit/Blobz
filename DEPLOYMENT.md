# Blobz Production Deployment

This is the launch checklist for the current Blobz architecture: browser client, API/economy service, PostgreSQL, and one or more Agar world processes.

## Services

- Client static app: `server/index.js`, default port `8082`.
- API/admin/economy: `servers/api/src/server.js`, default port `8787`.
- Main game world: `servers/agarv1/src/index.js --world=main --port=9999`.
- Auto worlds: created in admin as `provisioning`, then started by the API world supervisor on ports `10000+`.
- Database: PostgreSQL.

## Server Requirements

- Node.js 20 or newer.
- npm.
- PostgreSQL 15 or newer.
- PM2 for process management.
- Nginx or Caddy for HTTPS and WSS proxying.
- A domain for the Telegram Mini App client and API.

## Environment

Copy the production template:

```bash
cp servers/api/.env.production.example servers/api/.env
```

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Generate the admin token hash:

```bash
node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "your-admin-token"
```

Important production values:

- `NODE_ENV=production`
- `DATABASE_URL=postgres://...`
- `TELEGRAM_BOT_TOKEN=...`
- `SESSION_SECRET=...`
- `INTERNAL_API_TOKEN=...`
- `ADMIN_TOKEN_HASH=...`
- `CORS_ORIGINS=https://your-game-domain`
- `API_PUBLIC_BASE=https://your-api-domain`
- `CLIENT_PUBLIC_BASE=https://your-game-domain`
- `WORLD_WS_PROTOCOL=wss`
- `WORLD_WS_HOST=your-game-ws-domain`
- `GAME_SERVER_BIND_HOST=127.0.0.1` when a reverse proxy terminates WSS.

The API refuses to boot in production if dev secrets or localhost CORS/database settings are still present.

## Database

Create the database and app user:

```sql
create database blobz;
create user blobz_app with encrypted password 'replace-db-password';
grant all privileges on database blobz to blobz_app;
```

Then install and migrate:

```bash
npm --prefix servers/api install --omit=dev
npm run api:migrate
```

Backups before launch:

```bash
pg_dump "$DATABASE_URL" > "blobz-backup-$(date +%Y%m%d-%H%M).sql"
```

## PM2 Launch

Install PM2:

```bash
npm install -g pm2
```

Start everything:

```bash
./scripts/start-production.sh
```

Or manually:

```bash
set -a
. servers/api/.env
set +a
npm run api:check
npm run api:migrate
pm2 start ecosystem.config.cjs --env production
pm2 save
```

Check status:

```bash
pm2 status
pm2 logs blobz-api
pm2 logs blobz-world-main
```

## HTTPS and WSS

Telegram Mini Apps require HTTPS. If the client is served over HTTPS, game sockets must use `wss://`.

For the first launch, the simplest model is:

- `https://game.example.com` proxies to client port `8082`.
- `https://api.example.com` proxies to API port `8787`.
- `wss://ws.example.com:9999/ws1/` proxies to local world port `9999`.
- Auto worlds use `wss://ws.example.com:10000/ws1/`, `10001`, and so on.

If you use Nginx per-port WSS, make game worlds bind locally with:

```text
GAME_SERVER_BIND_HOST=127.0.0.1
```

Then configure the public WSS listener to proxy to `127.0.0.1:<world-port>`.

## Admin Flow

1. Open `https://api.example.com/admin`.
2. Enter the raw admin token, not the hash.
3. Create a world with a name, slug, and port.
4. New worlds start as `provisioning`.
5. The supervisor starts the process and the world begins heartbeating.
6. Use `Activate` to allow player assignment.
7. Use `Drain` before planned shutdowns.
8. Use `Stop` to pause and stop supervisor-owned worlds.
9. Use `Spectate` on a world row to open that arena in the game client without joining as a player.

## Launch Verification

Run these before opening the game to players:

```bash
curl https://api.example.com/health
curl https://api.example.com/ready
```

Then verify:

- Telegram opens the Mini App without warnings.
- Telegram username appears in Blobz.
- Admin panel loads with no console errors.
- Main world shows live heartbeat.
- Create a test world from admin and confirm PM2/API logs show a spawned process.
- Click `Spectate` from admin and confirm the game client opens with `spectate=1` and connects to the selected world.
- Click Play from two browsers and confirm assignment routes to an active world.
- Kill/exit a match and confirm rewards appear in `matches` and player balances.

## Load Test Target

Before launch, test one world at:

- 25 players
- 50 players
- 75 players
- 100 players

Watch:

- server CPU
- memory
- websocket disconnects
- heartbeat delay
- player movement smoothness
- match finalization latency

If one world degrades before 100 players, lower `hard_cap` and let the supervisor create more worlds earlier.
