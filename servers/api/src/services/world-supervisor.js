'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { config } = require('../config');

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : (fallback || 0);
}

function slugSafe(value) {
  return String(value || 'world')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'world';
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

class WorldSupervisor {
  constructor(db) {
    this.db = db;
    this.children = new Map();
    this.timer = null;
    this.running = false;
    this.tickInProgress = false;
    this.failures = 0;
    this.lastError = null;
  }

  start() {
    if (!config.worldSupervisorEnabled || this.timer) return;
    this.running = true;
    ensureDir(config.gameServerLogDir);
    this.tick();
    this.timer = setInterval(() => this.tick(), Math.max(1000, config.worldSupervisorIntervalMs));
    console.log('[World Supervisor] Enabled.');
  }

  async stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const stops = [];
    for (const childInfo of this.children.values()) {
      stops.push(this.stopChild(childInfo, 'api_shutdown'));
    }
    await Promise.allSettled(stops);
    console.log('[World Supervisor] Stopped.');
  }

  getState() {
    return {
      enabled: !!config.worldSupervisorEnabled,
      running: this.running,
      childCount: this.children.size,
      lastError: this.lastError,
      worlds: Array.from(this.children.values()).map((childInfo) => ({
        worldId: childInfo.worldId,
        slug: childInfo.slug,
        port: childInfo.port,
        pid: childInfo.child && childInfo.child.pid ? childInfo.child.pid : childInfo.pid,
        startedAt: childInfo.startedAt,
        stopping: !!childInfo.stopping,
        expectedExit: !!childInfo.expectedExit
      }))
    };
  }

  async tick() {
    if (!this.running || this.tickInProgress) return;
    this.tickInProgress = true;

    try {
      const result = await this.db.query(
        `
          select id, slug, name, mode, region, status, port, host, ws_url, current_players, metadata
          from worlds
          where status in ('provisioning', 'active', 'paused', 'offline', 'draining', 'deleted')
          order by created_at asc
        `
      );
      this.failures = 0;
      this.lastError = null;
      await this.reconcile(result.rows);
    } catch (error) {
      this.failures++;
      this.lastError = error.code || error.message || 'supervisor_error';
      if (this.failures === 1 || this.failures % 12 === 0) {
        console.log('[World Supervisor] Waiting for database: ' + this.lastError);
      }
    } finally {
      this.tickInProgress = false;
    }
  }

  async reconcile(worlds) {
    const seen = new Set();

    for (const world of worlds) {
      seen.add(world.id);
      const childInfo = this.children.get(world.id);

      if (this.shouldStopWorld(world, childInfo)) {
        await this.stopChild(childInfo, world.status);
        continue;
      }

      if (world.status === 'provisioning' && !childInfo) {
        await this.startWorld(world);
      }
    }

    for (const [worldId, childInfo] of this.children.entries()) {
      if (!seen.has(worldId)) await this.stopChild(childInfo, 'world_missing');
    }
  }

  shouldStopWorld(world, childInfo) {
    if (!childInfo) return false;
    if (world.status === 'deleted' || world.status === 'paused' || world.status === 'offline') return true;
    if (world.status === 'draining' && numberValue(world.current_players, 0) <= 0) return true;
    return false;
  }

  startWorld(world) {
    return new Promise((resolve) => {
      const port = Number.parseInt(world.port, 10);
      if (!Number.isFinite(port) || port <= 0) {
        this.markWorldFailed(world, 'World port is missing.').finally(resolve);
        return;
      }

      const slug = slugSafe(world.slug);
      const logPrefix = path.join(config.gameServerLogDir, slug + '-' + port);
      const out = fs.openSync(logPrefix + '.out.log', 'a');
      const err = fs.openSync(logPrefix + '.err.log', 'a');
      const args = [
        config.gameServerEntry,
        '--noconsole',
        '--world=' + slug,
        '--port=' + port,
        '--region=' + (world.region || 'eu')
      ];
      const env = Object.assign({}, process.env, {
        BLOBZ_API_BASE: config.apiPublicBase,
        BLOBZ_INTERNAL_API_TOKEN: config.internalApiToken,
        INTERNAL_API_TOKEN: config.internalApiToken,
        BLOBZ_WORLD_SLUG: slug,
        BLOBZ_WORLD_PORT: String(port),
        BLOBZ_WORLD_REGION: world.region || 'eu',
        BLOBZ_WORLD_HOST: world.host || config.worldWsHost,
        BLOBZ_WORLD_BIND_HOST: config.gameServerBindHost,
        BLOBZ_WORLD_WS_URL: world.ws_url || (config.worldWsProtocol + '://' + (world.host || config.worldWsHost) + ':' + port + '/ws1/')
      });

      let child;
      try {
        child = spawn(config.gameServerNode, args, {
          cwd: config.gameServerCwd,
          env,
          windowsHide: true,
          stdio: ['ignore', out, err]
        });
      } catch (error) {
        fs.closeSync(out);
        fs.closeSync(err);
        this.markWorldFailed(world, error.message).finally(resolve);
        return;
      }

      const childInfo = {
        worldId: world.id,
        slug,
        port,
        child,
        pid: child.pid,
        startedAt: nowIso(),
        expectedExit: false,
        stopping: false
      };
      this.children.set(world.id, childInfo);

      child.on('error', (error) => {
        this.markWorldFailed(world, error.message);
      });

      child.on('exit', (code, signal) => {
        fs.closeSync(out);
        fs.closeSync(err);
        this.children.delete(world.id);
        this.onChildExit(world, childInfo, code, signal);
      });

      this.markWorldSpawned(world, childInfo).finally(resolve);
    });
  }

  async stopChild(childInfo, reason) {
    if (!childInfo || childInfo.stopping) return;
    childInfo.stopping = true;
    childInfo.expectedExit = true;

    if (childInfo.child && childInfo.child.exitCode === null) {
      try {
        childInfo.child.kill();
      } catch (error) {}
    }

    setTimeout(() => {
      if (childInfo.child && childInfo.child.exitCode === null) {
        try {
          childInfo.child.kill('SIGKILL');
        } catch (error) {}
      }
    }, Math.max(1000, config.worldSupervisorShutdownMs));

    await this.db.query(
      `
        update worlds
        set pid = null,
            current_players = 0,
            current_bots = 0,
            current_spectators = 0,
            last_error = null,
            updated_at = now()
        where id = $1
      `,
      [childInfo.worldId]
    ).catch(() => {});

    await this.db.query(
      `
        insert into world_events (world_id, event_type, message, metadata)
        values ($1, 'stopped', $2, $3)
      `,
      [
        childInfo.worldId,
        'World process stop requested by supervisor.',
        JSON.stringify({ reason, pid: childInfo.pid })
      ]
    ).catch(() => {});
  }

  async markWorldSpawned(world, childInfo) {
    await this.db.query(
      `
        update worlds
        set pid = $2,
            last_error = null,
            metadata = metadata || $3::jsonb,
            updated_at = now()
        where id = $1
      `,
      [
        world.id,
        childInfo.pid,
        JSON.stringify({
          supervisor: {
            owned: true,
            pid: childInfo.pid,
            startedAt: childInfo.startedAt
          }
        })
      ]
    );

    await this.db.query(
      `
        insert into world_events (world_id, event_type, message, metadata)
        values ($1, 'spawned', $2, $3)
      `,
      [
        world.id,
        'World process spawned by API supervisor.',
        JSON.stringify({
          pid: childInfo.pid,
          slug: childInfo.slug,
          port: childInfo.port
        })
      ]
    );
  }

  async markWorldFailed(world, message) {
    await this.db.query(
      `
        update worlds
        set status = 'offline',
            pid = null,
            last_error = $2,
            updated_at = now()
        where id = $1
      `,
      [world.id, String(message || 'Failed to start world process.').slice(0, 500)]
    ).catch(() => {});

    await this.db.query(
      `
        insert into world_events (world_id, event_type, message, metadata)
        values ($1, 'spawn_failed', $2, $3)
      `,
      [
        world.id,
        'World process failed to start.',
        JSON.stringify({ error: String(message || 'unknown') })
      ]
    ).catch(() => {});
  }

  async onChildExit(world, childInfo, code, signal) {
    if (childInfo.expectedExit) return;
    const reason = 'World process exited unexpectedly.';

    await this.db.query(
      `
        update worlds
        set status = 'offline',
            pid = null,
            current_players = 0,
            current_bots = 0,
            current_spectators = 0,
            last_error = $2,
            updated_at = now()
        where id = $1
      `,
      [
        world.id,
        (reason + ' code=' + code + ' signal=' + signal).slice(0, 500)
      ]
    ).catch(() => {});

    await this.db.query(
      `
        insert into world_events (world_id, event_type, message, metadata)
        values ($1, 'exited', $2, $3)
      `,
      [
        world.id,
        reason,
        JSON.stringify({ pid: childInfo.pid, code, signal })
      ]
    ).catch(() => {});
  }
}

module.exports = { WorldSupervisor };
