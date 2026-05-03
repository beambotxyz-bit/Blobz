'use strict';

const { config } = require('../config');
const { httpError } = require('../http-error');
const { makeId } = require('../ids');
const { numberValue, serializePlayer } = require('./players');

const WORLD_STATUSES = {
  active: true,
  draining: true,
  paused: true,
  offline: true,
  provisioning: true,
  deleted: true
};

function cleanText(value, maxLength) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength || 120);
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNonNegativeInt(value, fallback) {
  return Math.max(0, toInt(value, fallback || 0));
}

function toPositiveInt(value, fallback) {
  const parsed = toInt(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function slugify(value, fallback) {
  const raw = cleanText(value, 80) || fallback || 'world';
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || fallback || 'world';
}

function normalizeStatus(value, fallback) {
  const status = cleanText(value, 32);
  if (status && WORLD_STATUSES[status]) return status;
  return fallback || 'active';
}

function normalizePort(value) {
  const port = Number.parseInt(value, 10);
  return Number.isFinite(port) && port > 0 && port < 65536 ? port : null;
}

function normalizeCap(value, fallback) {
  return Math.max(1, toInt(value, fallback));
}

function normalizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function buildWsUrl(host, port) {
  if (!host || !port) return null;
  const protocol = config.worldWsProtocol || 'ws';
  return protocol + '://' + host + ':' + port + '/ws1/';
}

function serializeWorld(row) {
  if (!row) return null;
  const currentPlayers = numberValue(row.current_players);
  const hardCap = numberValue(row.hard_cap);
  const softCap = numberValue(row.soft_cap);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    mode: row.mode,
    region: row.region,
    status: row.status,
    softCap,
    hardCap,
    currentPlayers,
    currentBots: numberValue(row.current_bots),
    currentSpectators: numberValue(row.current_spectators),
    capacityPercent: hardCap > 0 ? Math.min(100, Math.round(currentPlayers / hardCap * 100)) : 0,
    host: row.host || null,
    port: row.port ? numberValue(row.port) : null,
    wsUrl: row.ws_url || row.server_url || null,
    publicUrl: row.public_url || null,
    serverUrl: row.server_url || null,
    pid: row.pid ? numberValue(row.pid) : null,
    tickRate: numberValue(row.tick_rate),
    loadScore: numberValue(row.load_score),
    autoCreated: !!row.auto_created,
    drainAt: row.drain_at || null,
    lastHeartbeatAt: row.last_heartbeat_at || null,
    lastError: row.last_error || null,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function writeWorldEvent(client, worldId, eventType, message, metadata) {
  await client.query(
    `
      insert into world_events (id, world_id, event_type, message, metadata)
      values ($1, $2, $3, $4, $5)
    `,
    [makeId(), worldId || null, eventType, cleanText(message, 240), JSON.stringify(metadata || {})]
  );
}

async function getNextPort(client) {
  const result = await client.query(
    'select max(port) as max_port from worlds where port is not null'
  );
  const maxPort = toInt(result.rows[0] && result.rows[0].max_port, config.worldBasePort - 1);
  return Math.max(config.worldBasePort, maxPort + 1);
}

async function listWorlds(client) {
  const result = await client.query(
    `
      select *
      from worlds
      where status <> 'deleted'
      order by sort_order asc, auto_created asc, created_at asc
    `
  );
  return result.rows.map(serializeWorld);
}

async function getWorld(client, worldId) {
  const result = await client.query('select * from worlds where id = $1', [worldId]);
  return serializeWorld(result.rows[0]);
}

async function createWorld(client, input, options) {
  const body = input || {};
  const autoCreated = !!(options && options.autoCreated);
  const name = cleanText(body.name, 80) || cleanText(body.slug, 80) || (autoCreated ? 'Auto Arena' : 'New Arena');
  const slugBase = slugify(body.slug || name, autoCreated ? 'auto-arena' : 'arena');
  const port = normalizePort(body.port) || await getNextPort(client);
  const host = cleanText(body.host, 120) || config.worldWsHost;
  const softCap = normalizeCap(body.softCap || body.soft_cap, 70);
  const hardCap = Math.max(softCap, normalizeCap(body.hardCap || body.hard_cap, 100));
  const wsUrl = cleanText(body.wsUrl || body.ws_url || body.serverUrl || body.server_url, 300) || buildWsUrl(host, port);
  const publicUrl = cleanText(body.publicUrl || body.public_url, 300);
  const mode = cleanText(body.mode, 40) || 'classic';
  const region = cleanText(body.region, 40) || 'eu';
  const status = normalizeStatus(body.status, autoCreated ? 'provisioning' : 'active');
  let slug = slugBase;

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? slugBase : slugBase + '-' + (attempt + 1);
    const existing = await client.query('select 1 from worlds where slug = $1', [candidate]);
    if (!existing.rowCount) {
      slug = candidate;
      break;
    }
  }

  const result = await client.query(
    `
      insert into worlds (
        id,
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
        $1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 0,
        $9, $10, $11, $12, $11, $13, $14
      )
      returning *
    `,
    [
      makeId(),
      slug,
      name,
      mode,
      region,
      status,
      softCap,
      hardCap,
      host,
      port,
      wsUrl,
      publicUrl,
      autoCreated,
      JSON.stringify(normalizeMetadata(body.metadata))
    ]
  );

  const world = serializeWorld(result.rows[0]);
  await writeWorldEvent(client, world.id, 'created', 'World created.', {
    source: autoCreated ? 'assignment' : 'admin',
    status: world.status,
    port: world.port
  });
  return world;
}

async function updateWorld(client, worldId, input) {
  const body = input || {};
  const current = await getWorld(client, worldId);
  if (!current || current.status === 'deleted') {
    throw httpError(404, 'World was not found.', 'world_not_found');
  }

  const name = cleanText(body.name, 80) || current.name;
  const mode = cleanText(body.mode, 40) || current.mode;
  const region = cleanText(body.region, 40) || current.region;
  const status = normalizeStatus(body.status, current.status);
  const softCap = normalizeCap(body.softCap || body.soft_cap, current.softCap || 70);
  const hardCap = Math.max(softCap, normalizeCap(body.hardCap || body.hard_cap, current.hardCap || 100));
  const host = cleanText(body.host, 120) || current.host || config.worldWsHost;
  const port = normalizePort(body.port) || current.port;
  const wsUrl = cleanText(body.wsUrl || body.ws_url || body.serverUrl || body.server_url, 300) || current.wsUrl || buildWsUrl(host, port);
  const publicUrl = cleanText(body.publicUrl || body.public_url, 300) || current.publicUrl;
  const drainAt = status === 'draining' ? (body.drainAt || body.drain_at || current.drainAt || new Date()) : null;
  const metadata = body.metadata ? normalizeMetadata(body.metadata) : current.metadata || {};

  const result = await client.query(
    `
      update worlds
      set name = $2,
          mode = $3,
          region = $4,
          status = $5,
          soft_cap = $6,
          hard_cap = $7,
          host = $8,
          port = $9,
          ws_url = $10,
          public_url = $11,
          server_url = $10,
          drain_at = $12,
          metadata = $13,
          updated_at = now()
      where id = $1
      returning *
    `,
    [
      worldId,
      name,
      mode,
      region,
      status,
      softCap,
      hardCap,
      host,
      port,
      wsUrl,
      publicUrl,
      drainAt,
      JSON.stringify(metadata)
    ]
  );

  const world = serializeWorld(result.rows[0]);
  await writeWorldEvent(client, world.id, 'updated', 'World settings updated.', {
    status: world.status,
    softCap: world.softCap,
    hardCap: world.hardCap
  });
  return world;
}

async function deleteWorld(client, worldId) {
  const current = await getWorld(client, worldId);
  if (!current || current.status === 'deleted') {
    throw httpError(404, 'World was not found.', 'world_not_found');
  }
  if (current.slug === 'main') {
    throw httpError(400, 'Main arena cannot be deleted; set it to paused or draining instead.', 'main_world_protected');
  }

  const result = await client.query(
    `
      update worlds
      set status = 'deleted',
          drain_at = now(),
          updated_at = now()
      where id = $1
      returning *
    `,
    [worldId]
  );
  const world = serializeWorld(result.rows[0]);
  await writeWorldEvent(client, world.id, 'deleted', 'World deleted from active rotation.', {});
  return world;
}

async function heartbeatWorld(client, input) {
  const body = input || {};
  const slug = slugify(body.slug || body.worldSlug || body.world, 'main');
  const name = cleanText(body.name, 80) || slug;
  const port = normalizePort(body.port);
  const host = cleanText(body.host, 120) || config.worldWsHost;
  const currentPlayers = toNonNegativeInt(body.currentPlayers || body.players || body.current_players, 0);
  const currentBots = toNonNegativeInt(body.currentBots || body.bots || body.current_bots, 0);
  const currentSpectators = toNonNegativeInt(body.currentSpectators || body.spectators || body.current_spectators, 0);
  const tickRate = Math.max(0, Number(body.tickRate || body.tick_rate || 0) || 0);
  const loadScore = Math.max(0, Number(body.loadScore || body.load_score || currentPlayers) || 0);
  const wsUrl = cleanText(body.wsUrl || body.ws_url || body.serverUrl || body.server_url, 300) || buildWsUrl(host, port);
  const metadata = normalizeMetadata(body.metadata);
  const status = normalizeStatus(body.status, 'active');

  const result = await client.query(
    `
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
        server_url,
        pid,
        tick_rate,
        load_score,
        last_heartbeat_at,
        metadata
      )
      values (
        $1, $2, $3, $4, $5,
        70, 100, $6, $7, $8,
        $9, $10, $11, $11, $12, $13, $14, now(), $15
      )
      on conflict (slug) do update
      set name = coalesce(worlds.name, excluded.name),
          status = case when worlds.status in ('deleted', 'paused', 'draining') then worlds.status else excluded.status end,
          current_players = excluded.current_players,
          current_bots = excluded.current_bots,
          current_spectators = excluded.current_spectators,
          host = coalesce(excluded.host, worlds.host),
          port = coalesce(excluded.port, worlds.port),
          ws_url = coalesce(excluded.ws_url, worlds.ws_url),
          server_url = coalesce(excluded.server_url, worlds.server_url),
          pid = excluded.pid,
          tick_rate = excluded.tick_rate,
          load_score = excluded.load_score,
          last_heartbeat_at = now(),
          metadata = worlds.metadata || excluded.metadata,
          last_error = null,
          updated_at = now()
      returning *
    `,
    [
      slug,
      name,
      cleanText(body.mode, 40) || 'classic',
      cleanText(body.region, 40) || 'eu',
      status,
      currentPlayers,
      currentBots,
      currentSpectators,
      host,
      port,
      wsUrl,
      body.pid ? toPositiveInt(body.pid, null) : null,
      tickRate,
      loadScore,
      JSON.stringify(metadata)
    ]
  );

  return serializeWorld(result.rows[0]);
}

async function assignWorld(client, input) {
  const body = input || {};
  const region = cleanText(body.region, 40);
  const mode = cleanText(body.mode, 40) || 'classic';
  const params = [mode];
  let regionClause = '';
  if (region) {
    params.push(region);
    regionClause = 'and region = $2';
  }

  const result = await client.query(
    `
      select *
      from worlds
      where status = 'active'
        and mode = $1
        ${regionClause}
        and current_players < hard_cap
      order by
        case when current_players < soft_cap then 0 else 1 end asc,
        load_score asc,
        current_players asc,
        coalesce(last_heartbeat_at, created_at) asc
      limit 1
    `,
    params
  );

  if (result.rowCount) {
    return {
      world: serializeWorld(result.rows[0]),
      assigned: true,
      overflow: false,
      provisioning: false
    };
  }

  const created = await createWorld(client, {
    name: 'Auto Arena',
    slug: 'auto-' + Date.now().toString(36),
    mode,
    region: region || 'eu',
    status: 'provisioning',
    softCap: 70,
    hardCap: 100,
    metadata: { reason: 'capacity_overflow' }
  }, { autoCreated: true });

  const fallback = await client.query(
    `
      select *
      from worlds
      where status in ('active', 'draining')
        and mode = $1
      order by current_players asc, updated_at asc
      limit 1
    `,
    [mode]
  );

  await writeWorldEvent(client, created.id, 'provisioning', 'Overflow world record created; start a game process for this port.', {
    mode,
    region: region || 'eu'
  });

  return {
    world: serializeWorld(fallback.rows[0]) || created,
    queuedWorld: created,
    assigned: !!fallback.rowCount,
    overflow: true,
    provisioning: true
  };
}

async function getAdminSummary(client) {
  const players = await client.query('select count(*)::int as count from players');
  const worlds = await client.query(
    `
      select
        count(*)::int as total,
        coalesce(sum(case when status = 'active' then 1 else 0 end), 0)::int as active,
        coalesce(sum(current_players), 0)::int as current_players,
        coalesce(sum(current_bots), 0)::int as current_bots
      from worlds
      where status <> 'deleted'
    `
  );
  const matches = await client.query(
    `
      select
        count(*)::int as today,
        coalesce(sum(xp_earned), 0)::bigint as xp,
        coalesce(sum(gems_earned), 0)::bigint as gems,
        coalesce(sum(cups_earned), 0)::bigint as cups
      from matches
      where created_at >= date_trunc('day', now())
    `
  );
  const recentEvents = await client.query(
    `
      select we.*, w.slug as world_slug, w.name as world_name
      from world_events we
      left join worlds w on w.id = we.world_id
      order by we.created_at desc
      limit 8
    `
  );

  return {
    players: { total: numberValue(players.rows[0].count) },
    worlds: {
      total: numberValue(worlds.rows[0].total),
      active: numberValue(worlds.rows[0].active),
      currentPlayers: numberValue(worlds.rows[0].current_players),
      currentBots: numberValue(worlds.rows[0].current_bots)
    },
    matchesToday: {
      total: numberValue(matches.rows[0].today),
      xp: numberValue(matches.rows[0].xp),
      gems: numberValue(matches.rows[0].gems),
      cups: numberValue(matches.rows[0].cups)
    },
    events: recentEvents.rows.map((row) => ({
      id: row.id,
      worldId: row.world_id,
      worldSlug: row.world_slug,
      worldName: row.world_name,
      type: row.event_type,
      message: row.message,
      metadata: row.metadata || {},
      createdAt: row.created_at
    }))
  };
}

async function listPlayers(client, options) {
  const opts = options || {};
  const limit = Math.max(1, Math.min(200, toInt(opts.limit, 50)));
  const search = cleanText(opts.search, 80);
  const params = [limit];
  let where = '';
  if (search) {
    params.push('%' + search.toLowerCase() + '%');
    where = 'where lower(coalesce(p.display_name, \'\') || \' \' || coalesce(p.username, \'\')) like $2';
  }

  const result = await client.query(
    `
      select
        p.*,
        ps.id as selected_owned_skin_id,
        ps.serial_number as selected_skin_serial_number,
        s.slug as selected_skin_slug,
        s.name as selected_skin_name,
        s.rarity as selected_skin_rarity,
        s.image_path as selected_skin_image_path
      from players p
      left join player_skins ps on ps.id = p.selected_player_skin_id
      left join skins s on s.id = ps.skin_id
      ${where}
      order by p.updated_at desc
      limit $1
    `,
    params
  );

  return result.rows.map(serializePlayer);
}

async function listRecentMatches(client, options) {
  const limit = Math.max(1, Math.min(100, toInt(options && options.limit, 30)));
  const result = await client.query(
    `
      select
        m.id,
        m.started_at,
        m.ended_at,
        m.exit_reason,
        m.survival_seconds,
        m.food_eaten,
        m.kills,
        m.deaths,
        m.max_mass,
        m.final_mass,
        m.xp_earned,
        m.gems_earned,
        m.cups_earned,
        p.id as player_id,
        p.display_name,
        p.username,
        w.slug as world_slug,
        w.name as world_name
      from matches m
      join players p on p.id = m.player_id
      left join worlds w on w.id = m.world_id
      order by m.created_at desc
      limit $1
    `,
    [limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    player: {
      id: row.player_id,
      displayName: row.display_name,
      username: row.username || null
    },
    world: row.world_slug ? {
      slug: row.world_slug,
      name: row.world_name
    } : null,
    exitReason: row.exit_reason,
    survivalSeconds: numberValue(row.survival_seconds),
    foodEaten: numberValue(row.food_eaten),
    kills: numberValue(row.kills),
    deaths: numberValue(row.deaths),
    maxMass: numberValue(row.max_mass),
    finalMass: numberValue(row.final_mass),
    rewards: {
      xp: numberValue(row.xp_earned),
      gems: numberValue(row.gems_earned),
      cups: numberValue(row.cups_earned)
    },
    startedAt: row.started_at,
    endedAt: row.ended_at
  }));
}

module.exports = {
  assignWorld,
  createWorld,
  deleteWorld,
  getAdminSummary,
  heartbeatWorld,
  listPlayers,
  listRecentMatches,
  listWorlds,
  serializeWorld,
  updateWorld,
  writeWorldEvent
};
