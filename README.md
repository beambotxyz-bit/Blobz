# Blobz

Blobz is the branded game base in this repository. This pass keeps the preserved v1 gameplay intact while updating the product name, player-facing copy, and project metadata to Blobz.

## Project Layout

- `docs/` contains the active browser client we use for local play.
- `servers/agarv1/` contains the preserved v1 game server base.
- `clients/agarv1/` contains the legacy standalone client copy kept for reference.

## Local Run

1. Install dependencies inside `servers/agarv1/`.
2. Start the server from `servers/agarv1/` with `node src/index.js --noconsole`.
3. Serve `docs/` on a local web server and open the page in a browser.

In this workspace, local play runs with the client on `http://127.0.0.1:8081/` and the websocket server on `ws://127.0.0.1:3000/ws1/`.

## Rebrand Scope

This rebrand step changes branding, metadata, and player-facing copy only. Gameplay, mechanics, and core server behavior remain on the preserved v1 base so we have a stable platform for later UI and feature work.
