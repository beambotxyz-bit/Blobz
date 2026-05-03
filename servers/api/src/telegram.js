'use strict';

const crypto = require('crypto');
const { httpError } = require('./http-error');

function safeHexEqual(left, right) {
  const a = Buffer.from(String(left), 'hex');
  const b = Buffer.from(String(right), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseJsonField(params, key) {
  const value = params.get(key);
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch (error) {
    throw httpError(400, `Telegram ${key} field is not valid JSON.`, 'telegram_invalid_json');
  }
}

function validateTelegramInitData(initData, botToken, options) {
  if (!botToken) {
    throw httpError(500, 'TELEGRAM_BOT_TOKEN is not configured.', 'telegram_token_missing');
  }

  if (!initData || typeof initData !== 'string') {
    throw httpError(400, 'Telegram initData is required.', 'telegram_init_data_required');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw httpError(400, 'Telegram initData hash is missing.', 'telegram_hash_missing');

  const pairs = [];
  params.forEach((value, key) => {
    if (key === 'hash' || key === 'signature') return;
    pairs.push(`${key}=${value}`);
  });
  pairs.sort();

  const dataCheckString = pairs.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (!safeHexEqual(expectedHash, hash)) {
    throw httpError(401, 'Telegram initData signature is invalid.', 'telegram_signature_invalid');
  }

  const authDate = Number.parseInt(params.get('auth_date') || '0', 10);
  const maxAgeSeconds = options && options.maxAgeSeconds;
  if (maxAgeSeconds && authDate) {
    const age = Math.floor(Date.now() / 1000) - authDate;
    if (age > maxAgeSeconds) {
      throw httpError(401, 'Telegram initData is too old.', 'telegram_init_data_expired');
    }
  }

  const user = parseJsonField(params, 'user');
  if (!user || !user.id) {
    throw httpError(400, 'Telegram initData does not include a user.', 'telegram_user_missing');
  }

  return {
    authDate,
    queryId: params.get('query_id'),
    startParam: params.get('start_param'),
    user
  };
}

module.exports = { validateTelegramInitData };
