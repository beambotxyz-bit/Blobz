# Blobz Server Setup

Blobz uses the preserved `agarv1` server base in this folder.

## Requirements

- Node.js
- npm

## Install

From `servers/agarv1/`:

```sh
npm install
```

## Run

From `servers/agarv1/`:

```sh
node src/index.js --noconsole
```

By default the websocket server listens on port `3000`.

## Local Client

Serve the repository `docs/` folder on a local web server, then open the client in a browser. In this workspace the local client runs on `http://127.0.0.1:8081/`.

## Notes

- This rebrand step changes product naming only.
- Gameplay, mechanics, and core server behavior stay on the preserved v1 base.
