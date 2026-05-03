'use strict';

const crypto = require('crypto');
const { config } = require('./config');
const { httpError } = require('./http-error');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function decodeBase64url(input) {
  const normalized = String(input).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function sign(value) {
  return base64url(crypto.createHmac('sha256', config.sessionSecret).update(value).digest());
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyTokenValue(token, expected) {
  if (!token || !expected) return false;
  return safeEqual(token, expected);
}

function verifyInternalToken(token) {
  return verifyTokenValue(token, config.internalApiToken);
}

function verifyAdminToken(token) {
  if (!token) return false;
  if (config.adminTokenHash) {
    return safeEqual(sha256Hex(token), config.adminTokenHash);
  }
  return verifyTokenValue(token, config.adminToken);
}

function issueSession(player) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: player.id,
    tg: player.telegram_id || null,
    username: player.username || null,
    iat: now,
    exp: now + config.sessionTtlSeconds
  }));
  const body = `${header}.${payload}`;
  return `${body}.${sign(body)}`;
}

function verifySession(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw httpError(401, 'Invalid session token.', 'invalid_session');

  const body = `${parts[0]}.${parts[1]}`;
  if (!safeEqual(sign(body), parts[2])) {
    throw httpError(401, 'Invalid session signature.', 'invalid_session_signature');
  }

  let payload;
  try {
    payload = JSON.parse(decodeBase64url(parts[1]));
  } catch (error) {
    throw httpError(401, 'Invalid session payload.', 'invalid_session_payload');
  }

  if (!payload.sub) throw httpError(401, 'Session has no player.', 'session_missing_player');
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw httpError(401, 'Session expired.', 'session_expired');
  }

  return payload;
}

function readBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}

module.exports = {
  issueSession,
  verifySession,
  readBearerToken,
  verifyAdminToken,
  verifyInternalToken,
  sha256Hex,
  safeEqual
};
