# Blobz

Blobz is the branded game base in this repository. This pass keeps the preserved v1 gameplay intact while updating the product name, player-facing copy, and project metadata to Blobz.

## Project Layout

- `docs/` contains the active browser client we use for local play.
- `servers/agarv1/` contains the preserved v1 game server base.
- `servers/api/` contains the persistent identity, economy, inventory, world-management, reward, and admin API.
- `clients/agarv1/` contains the legacy standalone client copy kept for reference.

## Local Run

1. Start the API with `npm run api:start`.
2. Start the game server from `servers/agarv1/src` with `node index.js --noconsole --world=main --port=9999`.
3. Serve `docs/` and open the page in a browser.

In this workspace, local play runs with the client on `http://127.0.0.1:8082/`, the websocket server on `ws://127.0.0.1:9999/ws1/`, and the admin panel on `http://127.0.0.1:8787/admin`. The admin panel uses `CLIENT_PUBLIC_BASE` to open spectate links back into the playable client.

The API world supervisor starts worlds marked `provisioning` from the admin panel or overflow assignment. Extra worlds use the same game server entry point with distinct ports, for example:

```powershell
cd servers/agarv1/src
node index.js --noconsole --world=eu-2 --port=10000
```

For persistent economy/admin data, run PostgreSQL and apply the API migrations:

```powershell
cd servers/api
npm run migrate
```

For launch preparation, use [DEPLOYMENT.md](DEPLOYMENT.md). It covers production secrets, PostgreSQL, PM2, HTTPS/WSS, world supervisor behavior, and the final verification checklist.

## Rebrand Scope

This rebrand step changes branding, metadata, and player-facing copy only. Gameplay, mechanics, and core server behavior remain on the preserved v1 base so we have a stable platform for later UI and feature work.
