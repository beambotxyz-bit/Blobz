'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { config } = require('./config');
const { pool, query, transaction } = require('./db');
const { issueSession, verifySession, readBearerToken, verifyAdminToken, verifyInternalToken } = require('./auth');
const { validateTelegramInitData } = require('./telegram');
const { httpError } = require('./http-error');
const {
  getPlayerProfile,
  upsertTelegramPlayer,
  getInventory,
  equipSkin
} = require('./services/players');
const {
  finalizeMatch,
  grantItem,
  mintSkinForPlayer
} = require('./services/economy');
const {
  assignWorld,
  createWorld,
  deleteWorld,
  getAdminSummary,
  heartbeatWorld,
  listPlayers,
  listRecentMatches,
  listWorlds,
  updateWorld
} = require('./services/worlds');
const { WorldSupervisor } = require('./services/world-supervisor');

const JSON_LIMIT_BYTES = 1024 * 1024;
const ADMIN_DIR = path.join(__dirname, '..', 'public', 'admin');
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};
let worldSupervisor = null;

function originAllowed(origin) {
  if (!origin) return true;
  return config.corsOrigins.includes('*') || config.corsOrigins.includes(origin);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || config.corsOrigins[0] || '*');
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Internal-Token, X-Admin-Token');
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendBuffer(res, status, buffer, contentType) {
  res.writeHead(status, {
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Length': buffer.length
  });
  res.end(buffer);
}

function isDatabaseUnavailable(error) {
  return error && (
    error.code === 'ECONNREFUSED' ||
    error.code === 'ENOTFOUND' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ECONNRESET'
  );
}

function fallbackMainWorld() {
  return {
    id: null,
    slug: 'main',
    name: 'Main Arena',
    mode: 'classic',
    region: 'eu',
    status: 'fallback',
    softCap: 70,
    hardCap: 100,
    currentPlayers: 0,
    currentBots: 0,
    currentSpectators: 0,
    capacityPercent: 0,
    host: '127.0.0.1',
    port: 9999,
    wsUrl: 'ws://127.0.0.1:9999/ws1/',
    publicUrl: 'http://127.0.0.1:8082/',
    lastHeartbeatAt: null,
    metadata: { source: 'api_database_fallback' }
  };
}

function fallbackAdminSummary() {
  return {
    database: false,
    players: { total: 0 },
    worlds: { total: 1, active: 1, currentPlayers: 0, currentBots: 0 },
    matchesToday: { total: 0, xp: 0, gems: 0, cups: 0 },
    events: [{
      id: 'database-unavailable',
      worldId: null,
      worldSlug: 'main',
      worldName: 'Main Arena',
      type: 'offline',
      message: 'Database is unavailable; showing local fallback routing.',
      metadata: {},
      createdAt: new Date().toISOString()
    }]
  };
}

async function serveAdminAsset(method, pathname, res) {
  if (method !== 'GET') return false;
  if (pathname !== '/admin' && !pathname.startsWith('/admin/')) return false;

  const relativePath = pathname === '/admin'
    ? 'index.html'
    : pathname.slice('/admin/'.length) || 'index.html';
  const resolved = path.resolve(ADMIN_DIR, relativePath);
  if (!resolved.startsWith(ADMIN_DIR)) {
    throw httpError(400, 'Invalid admin asset path.', 'invalid_asset_path');
  }

  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) return false;

  const buffer = await fs.promises.readFile(resolved);
  sendBuffer(res, 200, buffer, CONTENT_TYPES[path.extname(resolved).toLowerCase()] || 'application/octet-stream');
  return true;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > JSON_LIMIT_BYTES) {
        reject(httpError(413, 'JSON body is too large.', 'json_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(httpError(400, 'Request body must be valid JSON.', 'invalid_json'));
      }
    });

    req.on('error', reject);
  });
}

function requireInternal(req) {
  const token = req.headers['x-internal-token'];
  if (!verifyInternalToken(token)) {
    throw httpError(403, 'Internal token is invalid.', 'internal_token_invalid');
  }
}

function requireAdmin(req) {
  const token = req.headers['x-admin-token'] || req.headers['x-internal-token'];
  if (!verifyAdminToken(token)) {
    throw httpError(403, 'Admin token is invalid.', 'admin_token_invalid');
  }
}

async function requirePlayer(req) {
  const token = readBearerToken(req);
  if (!token) throw httpError(401, 'Bearer token is required.', 'session_required');

  const session = verifySession(token);
  const player = await getPlayerProfile({ query }, session.sub);
  if (!player) throw httpError(401, 'Session player no longer exists.', 'session_player_missing');

  return player;
}

async function route(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (await serveAdminAsset(method, pathname, res)) return;

  if (method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { ok: true, service: 'blobz-api' });
    return;
  }

  if (method === 'GET' && pathname === '/ready') {
    await query('select 1');
    sendJson(res, 200, { ok: true, database: true });
    return;
  }

  if (method === 'GET' && pathname === '/economy/settings') {
    const result = await query('select key, value, version, updated_at from economy_settings order by key');
    sendJson(res, 200, {
      settings: result.rows.map((row) => ({
        key: row.key,
        value: row.value,
        version: row.version,
        updatedAt: row.updated_at
      }))
    });
    return;
  }

  if (method === 'POST' && pathname === '/worlds/assign') {
    const body = await readJson(req);
    let result;
    try {
      result = await transaction((client) => assignWorld(client, body));
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      result = {
        world: fallbackMainWorld(),
        assigned: true,
        overflow: false,
        provisioning: false,
        fallback: true,
        warning: 'database_unavailable'
      };
    }
    sendJson(res, 200, result);
    return;
  }

  if (method === 'POST' && pathname === '/auth/telegram') {
    const body = await readJson(req);
    const telegram = validateTelegramInitData(body.initData, config.telegramBotToken, {
      maxAgeSeconds: config.telegramInitDataMaxAgeSeconds
    });

    const player = await transaction((client) => upsertTelegramPlayer(client, telegram.user));
    sendJson(res, 200, {
      token: issueSession({
        id: player.id,
        telegram_id: player.telegramId,
        username: player.username
      }),
      player
    });
    return;
  }

  if (method === 'GET' && pathname === '/me') {
    sendJson(res, 200, { player: await requirePlayer(req) });
    return;
  }

  if (method === 'GET' && pathname === '/me/inventory') {
    const player = await requirePlayer(req);
    const inventory = await getInventory({ query }, player.id);
    sendJson(res, 200, { inventory });
    return;
  }

  if (method === 'POST' && pathname === '/me/skin/equip') {
    const player = await requirePlayer(req);
    const body = await readJson(req);
    const updatedPlayer = await transaction((client) => equipSkin(client, player.id, body.playerSkinId));
    sendJson(res, 200, { player: updatedPlayer });
    return;
  }

  if (method === 'POST' && pathname === '/internal/matches/finalize') {
    requireInternal(req);
    const body = await readJson(req);
    const result = await transaction((client) => finalizeMatch(client, body));
    sendJson(res, 200, result);
    return;
  }

  if (method === 'POST' && pathname === '/internal/worlds/heartbeat') {
    requireInternal(req);
    const body = await readJson(req);
    let world;
    try {
      world = await transaction((client) => heartbeatWorld(client, body));
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      world = Object.assign(fallbackMainWorld(), {
        slug: body.slug || body.worldSlug || 'main',
        name: body.name || 'Main Arena',
        port: body.port || 9999,
        wsUrl: body.wsUrl || body.ws_url || fallbackMainWorld().wsUrl,
        currentPlayers: body.currentPlayers || body.players || 0,
        currentBots: body.currentBots || body.bots || 0,
        currentSpectators: body.currentSpectators || body.spectators || 0,
        status: 'fallback',
        lastHeartbeatAt: new Date().toISOString()
      });
    }
    sendJson(res, 200, { world });
    return;
  }

  if (method === 'POST' && pathname === '/internal/skins/mint') {
    requireInternal(req);
    const body = await readJson(req);
    const result = await transaction((client) => mintSkinForPlayer(client, body));
    sendJson(res, 200, { skin: result });
    return;
  }

  if (method === 'POST' && pathname === '/internal/items/grant') {
    requireInternal(req);
    const body = await readJson(req);
    const result = await transaction((client) => grantItem(client, body));
    sendJson(res, 200, { item: result });
    return;
  }

  if (method === 'GET' && pathname === '/admin/summary') {
    requireAdmin(req);
    try {
      const summary = await getAdminSummary({ query });
      summary.supervisor = worldSupervisor ? worldSupervisor.getState() : null;
      sendJson(res, 200, { summary });
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      const summary = fallbackAdminSummary();
      summary.supervisor = worldSupervisor ? worldSupervisor.getState() : null;
      sendJson(res, 200, { summary, warning: 'database_unavailable' });
    }
    return;
  }

  if (method === 'GET' && pathname === '/admin/config') {
    requireAdmin(req);
    sendJson(res, 200, {
      config: {
        clientPublicBase: config.clientPublicBase,
        apiPublicBase: config.apiPublicBase,
        worldWsHost: config.worldWsHost,
        worldWsProtocol: config.worldWsProtocol
      }
    });
    return;
  }

  if (method === 'GET' && pathname === '/admin/worlds') {
    requireAdmin(req);
    try {
      sendJson(res, 200, { worlds: await listWorlds({ query }) });
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      sendJson(res, 200, { worlds: [fallbackMainWorld()], warning: 'database_unavailable' });
    }
    return;
  }

  if (method === 'POST' && pathname === '/admin/worlds') {
    requireAdmin(req);
    const body = await readJson(req);
    const world = await transaction((client) => createWorld(client, body));
    sendJson(res, 201, { world });
    return;
  }

  const worldRoute = pathname.match(/^\/admin\/worlds\/([0-9a-f-]{36})$/i);
  if (worldRoute && method === 'PATCH') {
    requireAdmin(req);
    const body = await readJson(req);
    const world = await transaction((client) => updateWorld(client, worldRoute[1], body));
    sendJson(res, 200, { world });
    return;
  }

  if (worldRoute && method === 'DELETE') {
    requireAdmin(req);
    const world = await transaction((client) => deleteWorld(client, worldRoute[1]));
    sendJson(res, 200, { world });
    return;
  }

  if (method === 'GET' && pathname === '/admin/players') {
    requireAdmin(req);
    try {
      sendJson(res, 200, {
        players: await listPlayers({ query }, {
          limit: url.searchParams.get('limit'),
          search: url.searchParams.get('search')
        })
      });
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      sendJson(res, 200, { players: [], warning: 'database_unavailable' });
    }
    return;
  }

  if (method === 'GET' && pathname === '/admin/matches') {
    requireAdmin(req);
    try {
      sendJson(res, 200, {
        matches: await listRecentMatches({ query }, {
          limit: url.searchParams.get('limit')
        })
      });
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      sendJson(res, 200, { matches: [], warning: 'database_unavailable' });
    }
    return;
  }

  throw httpError(404, 'Route was not found.', 'not_found');
}

const server = http.createServer(async (req, res) => {
  applyCors(req, res);

  try {
    await route(req, res);
  } catch (error) {
    const status = error.status || 500;
    sendJson(res, status, {
      error: {
        code: error.code || 'server_error',
        message: status >= 500 ? 'Server error.' : error.message
      }
    });

    if (status >= 500) console.error(error);
  }
});

server.listen(config.port, () => {
  console.log(`Blobz API listening on http://127.0.0.1:${config.port}`);
  worldSupervisor = new WorldSupervisor({ query });
  worldSupervisor.start();
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down Blobz API.`);
  server.close(async () => {
    if (worldSupervisor) await worldSupervisor.stop();
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
