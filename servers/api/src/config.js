'use strict';

const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.charAt(0) === '#') return;

    const separator = trimmed.indexOf('=');
    if (separator === -1) return;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') ||
      (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'")
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) process.env[key] = value;
  });
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function toList(value, fallback) {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveFromApiDir(value, fallback) {
  const chosen = value || fallback;
  if (path.isAbsolute(chosen)) return chosen;
  return path.resolve(__dirname, '..', chosen);
}

function isDefaultSecret(value, defaultValue) {
  return !value || value === defaultValue || /change-me/i.test(String(value));
}

function isDefaultDatabaseUrl(value) {
  return String(value || '') === 'postgres://postgres:postgres@127.0.0.1:5432/blobz';
}

loadEnvFile(path.join(__dirname, '..', '.env'));

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: /^production$/i.test(process.env.NODE_ENV || ''),
  port: toInt(process.env.PORT, 8787),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/blobz',
  databaseSsl: toBool(process.env.DATABASE_SSL, false),
  dbPoolMax: toInt(process.env.DB_POOL_MAX, 10),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramInitDataMaxAgeSeconds: toInt(process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS, 86400),
  sessionSecret: process.env.SESSION_SECRET || 'blobz-dev-session-secret-change-me',
  sessionTtlSeconds: toInt(process.env.SESSION_TTL_SECONDS, 604800),
  internalApiToken: process.env.INTERNAL_API_TOKEN || 'blobz-dev-internal-token-change-me',
  adminToken: process.env.ADMIN_TOKEN || process.env.INTERNAL_API_TOKEN || 'blobz-dev-internal-token-change-me',
  adminTokenHash: process.env.ADMIN_TOKEN_HASH || process.env.ADMIN_TOKEN_SHA256 || '',
  clientPublicBase: (process.env.CLIENT_PUBLIC_BASE || process.env.BLOBZ_CLIENT_PUBLIC_BASE || 'http://127.0.0.1:8082').replace(/\/+$/, ''),
  worldBasePort: toInt(process.env.WORLD_BASE_PORT, 10000),
  worldWsHost: process.env.WORLD_WS_HOST || '127.0.0.1',
  worldWsProtocol: process.env.WORLD_WS_PROTOCOL || 'ws',
  apiPublicBase: (process.env.API_PUBLIC_BASE || `http://127.0.0.1:${toInt(process.env.PORT, 8787)}`).replace(/\/+$/, ''),
  worldSupervisorEnabled: toBool(process.env.WORLD_SUPERVISOR_ENABLED, true),
  worldSupervisorIntervalMs: toInt(process.env.WORLD_SUPERVISOR_INTERVAL_MS, 5000),
  worldSupervisorShutdownMs: toInt(process.env.WORLD_SUPERVISOR_SHUTDOWN_MS, 5000),
  gameServerCwd: resolveFromApiDir(process.env.GAME_SERVER_CWD, '../agarv1/src'),
  gameServerEntry: process.env.GAME_SERVER_ENTRY || 'index.js',
  gameServerNode: process.env.GAME_SERVER_NODE || process.execPath,
  gameServerLogDir: resolveFromApiDir(process.env.GAME_SERVER_LOG_DIR, '../../output/worlds'),
  gameServerBindHost: process.env.GAME_SERVER_BIND_HOST || '',
  corsOrigins: toList(process.env.CORS_ORIGINS, [
    'http://127.0.0.1:8082',
    'http://localhost:8082'
  ])
};

function validateProductionConfig() {
  if (!config.isProduction) return;

  const errors = [];
  if (isDefaultSecret(config.sessionSecret, 'blobz-dev-session-secret-change-me')) {
    errors.push('SESSION_SECRET must be set to a strong production secret.');
  }
  if (isDefaultSecret(config.internalApiToken, 'blobz-dev-internal-token-change-me')) {
    errors.push('INTERNAL_API_TOKEN must be set to a strong production secret.');
  }
  if (!config.adminTokenHash && isDefaultSecret(config.adminToken, 'blobz-dev-internal-token-change-me')) {
    errors.push('ADMIN_TOKEN or ADMIN_TOKEN_HASH must be set for production.');
  }
  if (!config.telegramBotToken || /replace/i.test(config.telegramBotToken)) {
    errors.push('TELEGRAM_BOT_TOKEN must be set for production.');
  }
  if (isDefaultDatabaseUrl(config.databaseUrl)) {
    errors.push('DATABASE_URL must not use the default development database credentials.');
  }
  if (config.corsOrigins.some((origin) => origin === '*' || /127\.0\.0\.1|localhost/.test(origin))) {
    errors.push('CORS_ORIGINS must be restricted to production origins.');
  }
  if (!config.clientPublicBase || /127\.0\.0\.1|localhost/.test(config.clientPublicBase)) {
    errors.push('CLIENT_PUBLIC_BASE must point to the production game client URL.');
  }

  if (errors.length) {
    throw new Error('Invalid production configuration:\n- ' + errors.join('\n- '));
  }
}

validateProductionConfig();

module.exports = { config };
