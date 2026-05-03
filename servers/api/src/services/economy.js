'use strict';

const { makeId } = require('../ids');
const { httpError } = require('../http-error');
const { getPlayerProfile, numberValue } = require('./players');

function nonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback || 0;
  return Math.max(0, parsed);
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback || 0;
  return Math.max(0, parsed);
}

function stringOrNull(value, maxLength) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength || 120);
}

function normalizeStats(stats) {
  const safe = stats || {};
  return {
    survivalSeconds: nonNegativeInt(safe.survivalSeconds || safe.survival_seconds, 0),
    foodEaten: nonNegativeInt(safe.foodEaten || safe.food_eaten, 0),
    xpPickups: nonNegativeInt(safe.xpPickups || safe.xp_pickups, 0),
    gemPickups: nonNegativeInt(safe.gemPickups || safe.gem_pickups, 0),
    kills: nonNegativeInt(safe.kills, 0),
    deaths: nonNegativeInt(safe.deaths, 0),
    maxMass: nonNegativeNumber(safe.maxMass || safe.max_mass, 0),
    finalMass: nonNegativeNumber(safe.finalMass || safe.final_mass, 0)
  };
}

function normalizeRewards(rewards) {
  const safe = rewards || {};
  return {
    xp: nonNegativeInt(safe.xp || safe.xpEarned || safe.xp_earned, 0),
    gems: nonNegativeInt(safe.gems || safe.gemsEarned || safe.gems_earned, 0),
    cups: nonNegativeInt(safe.cups || safe.cupsEarned || safe.cups_earned, 0)
  };
}

const DEFAULT_REWARD_FORMULA = {
  xpPerSecond: 1,
  xpPerFood: 1,
  xpPerXpPickup: 25,
  xpPerKill: 120,
  gemsPerGemPickup: 1,
  gemsPerKill: 2,
  cupsPerMinute: 1,
  cupsPerKill: 4,
  maxXpPerMatch: 5000,
  maxGemsPerMatch: 250,
  maxCupsPerMatch: 500
};

function formulaNumber(formula, key) {
  const parsed = Number(formula[key]);
  if (Number.isFinite(parsed)) return parsed;
  return DEFAULT_REWARD_FORMULA[key];
}

function clampReward(value, maxValue) {
  const parsed = Math.max(0, Math.floor(Number(value) || 0));
  const max = Math.max(0, Math.floor(Number(maxValue) || 0));
  return max > 0 ? Math.min(parsed, max) : parsed;
}

async function loadRewardFormula(client) {
  const result = await client.query(
    "select value from economy_settings where key = 'reward_formula'"
  );
  return Object.assign({}, DEFAULT_REWARD_FORMULA, result.rows[0] ? result.rows[0].value : {});
}

function calculateRewards(stats, formula) {
  const xp =
    stats.survivalSeconds * formulaNumber(formula, 'xpPerSecond') +
    stats.foodEaten * formulaNumber(formula, 'xpPerFood') +
    stats.xpPickups * formulaNumber(formula, 'xpPerXpPickup') +
    stats.kills * formulaNumber(formula, 'xpPerKill');

  const gems =
    stats.gemPickups * formulaNumber(formula, 'gemsPerGemPickup') +
    stats.kills * formulaNumber(formula, 'gemsPerKill');

  const cups =
    Math.floor(stats.survivalSeconds / 60) * formulaNumber(formula, 'cupsPerMinute') +
    stats.kills * formulaNumber(formula, 'cupsPerKill');

  return {
    xp: clampReward(xp, formulaNumber(formula, 'maxXpPerMatch')),
    gems: clampReward(gems, formulaNumber(formula, 'maxGemsPerMatch')),
    cups: clampReward(cups, formulaNumber(formula, 'maxCupsPerMatch'))
  };
}

async function recalculatePlayerLevel(client, playerId) {
  const result = await client.query(
    `
      update players p
      set level = least(50, (
        select max(level) from level_curve where total_xp_required <= p.xp
      )),
      updated_at = now()
      where p.id = $1
      returning id
    `,
    [playerId]
  );

  if (!result.rowCount) throw httpError(404, 'Player was not found.', 'player_not_found');
  return getPlayerProfile(client, playerId);
}

async function mintSkinForPlayer(client, options) {
  const playerId = options.playerId;
  const skinSlug = stringOrNull(options.skinSlug || options.slug, 80);
  const acquiredFrom = stringOrNull(options.acquiredFrom || options.reason, 80) || 'reward';
  const acquiredMatchId = options.acquiredMatchId || options.matchId || null;

  if (!playerId) throw httpError(400, 'playerId is required.', 'player_required');
  if (!skinSlug) throw httpError(400, 'skinSlug is required.', 'skin_slug_required');

  const skinResult = await client.query(
    'select id, slug, name, rarity, image_path from skins where slug = $1 and is_active = true',
    [skinSlug]
  );
  const skin = skinResult.rows[0];
  if (!skin) throw httpError(404, `Skin "${skinSlug}" was not found.`, 'skin_not_found');

  await client.query(
    'insert into skin_mint_counters (skin_id, next_serial) values ($1, 1) on conflict (skin_id) do nothing',
    [skin.id]
  );

  const counterResult = await client.query(
    'select next_serial from skin_mint_counters where skin_id = $1 for update',
    [skin.id]
  );
  const serialNumber = numberValue(counterResult.rows[0].next_serial);

  await client.query(
    'update skin_mint_counters set next_serial = next_serial + 1, updated_at = now() where skin_id = $1',
    [skin.id]
  );

  const minted = await client.query(
    `
      insert into player_skins (
        id,
        owner_player_id,
        skin_id,
        serial_number,
        acquired_from,
        acquired_match_id,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      returning id, serial_number, created_at
    `,
    [
      makeId(),
      playerId,
      skin.id,
      serialNumber,
      acquiredFrom,
      acquiredMatchId,
      JSON.stringify(options.metadata || {})
    ]
  );

  return {
    id: minted.rows[0].id,
    slug: skin.slug,
    name: skin.name,
    rarity: skin.rarity,
    imagePath: skin.image_path,
    serialNumber,
    acquiredFrom,
    acquiredMatchId,
    createdAt: minted.rows[0].created_at
  };
}

async function grantItem(client, options) {
  const playerId = options.playerId;
  const slug = stringOrNull(options.slug || options.itemSlug, 80);
  const quantity = nonNegativeInt(options.quantity, 1);

  if (!playerId) throw httpError(400, 'playerId is required.', 'player_required');
  if (!slug) throw httpError(400, 'item slug is required.', 'item_slug_required');
  if (!quantity) throw httpError(400, 'quantity must be greater than zero.', 'invalid_quantity');

  const itemResult = await client.query(
    'select id, slug, name, kind from item_types where slug = $1 and is_active = true',
    [slug]
  );
  const item = itemResult.rows[0];
  if (!item) throw httpError(404, `Item "${slug}" was not found.`, 'item_not_found');

  const grantResult = await client.query(
    `
      insert into player_items (player_id, item_type_id, quantity)
      values ($1, $2, $3)
      on conflict (player_id, item_type_id) do update
      set quantity = player_items.quantity + excluded.quantity,
          updated_at = now()
      returning quantity, updated_at
    `,
    [playerId, item.id, quantity]
  );

  return {
    slug: item.slug,
    name: item.name,
    kind: item.kind,
    quantity: numberValue(grantResult.rows[0].quantity),
    granted: quantity,
    updatedAt: grantResult.rows[0].updated_at
  };
}

async function writeCurrencyLedger(client, playerId, matchId, currency, amount, reason, metadata) {
  if (!amount) return;

  await client.query(
    `
      insert into reward_ledger (id, player_id, match_id, currency, amount, reason, metadata)
      values ($1, $2, $3, $4, $5, $6, $7)
    `,
    [makeId(), playerId, matchId, currency, amount, reason, JSON.stringify(metadata || {})]
  );
}

async function finalizeMatch(client, payload) {
  const playerId = payload.playerId || payload.player_id;
  if (!playerId) throw httpError(400, 'playerId is required.', 'player_required');

  const playerExists = await client.query('select id from players where id = $1', [playerId]);
  if (!playerExists.rowCount) throw httpError(404, 'Player was not found.', 'player_not_found');

  const matchId = payload.matchId || payload.match_id || makeId();
  const existing = await client.query('select id, finalized_at from matches where id = $1', [matchId]);
  if (existing.rowCount) {
    return {
      alreadyFinalized: true,
      matchId,
      player: await getPlayerProfile(client, playerId)
    };
  }

  const stats = normalizeStats(payload.stats);
  const formula = await loadRewardFormula(client);
  const rewards = payload.useProvidedRewards === true
    ? normalizeRewards(payload.rewards)
    : calculateRewards(stats, formula);
  const startedAt = payload.startedAt || payload.started_at || new Date();
  const endedAt = payload.endedAt || payload.ended_at || new Date();
  let worldId = payload.worldId || payload.world_id || null;
  const worldSlug = stringOrNull(
    payload.worldSlug ||
    payload.world_slug ||
    (payload.metadata && payload.metadata.worldSlug) ||
    (payload.metadata && payload.metadata.world),
    80
  );
  if (!worldId && worldSlug) {
    const worldResult = await client.query('select id from worlds where slug = $1', [worldSlug]);
    worldId = worldResult.rows[0] ? worldResult.rows[0].id : null;
  }
  const exitReason = stringOrNull(payload.exitReason || payload.exit_reason, 80) || 'unknown';
  const metadata = payload.metadata || {};

  await client.query(
    `
      insert into matches (
        id,
        world_id,
        player_id,
        started_at,
        ended_at,
        exit_reason,
        survival_seconds,
        food_eaten,
        xp_pickups,
        gem_pickups,
        kills,
        deaths,
        max_mass,
        final_mass,
        xp_earned,
        gems_earned,
        cups_earned,
        metadata,
        finalized_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, now()
      )
    `,
    [
      matchId,
      worldId,
      playerId,
      startedAt,
      endedAt,
      exitReason,
      stats.survivalSeconds,
      stats.foodEaten,
      stats.xpPickups,
      stats.gemPickups,
      stats.kills,
      stats.deaths,
      stats.maxMass,
      stats.finalMass,
      rewards.xp,
      rewards.gems,
      rewards.cups,
      JSON.stringify(metadata)
    ]
  );

  await client.query(
    `
      update players
      set xp = xp + $1,
          gems = gems + $2,
          cups = cups + $3,
          updated_at = now()
      where id = $4
    `,
    [rewards.xp, rewards.gems, rewards.cups, playerId]
  );

  await writeCurrencyLedger(client, playerId, matchId, 'xp', rewards.xp, 'match_finalized', stats);
  await writeCurrencyLedger(client, playerId, matchId, 'gems', rewards.gems, 'match_finalized', stats);
  await writeCurrencyLedger(client, playerId, matchId, 'cups', rewards.cups, 'match_finalized', stats);

  const grantedItems = [];
  const itemDrops = payload.items || payload.itemDrops || payload.item_drops || [];
  for (const item of itemDrops) {
    grantedItems.push(await grantItem(client, {
      playerId,
      slug: item.slug || item.itemSlug,
      quantity: item.quantity || 1
    }));
  }

  const mintedSkins = [];
  const skinDrops = payload.skins || payload.skinDrops || payload.skin_drops || [];
  for (const skin of skinDrops) {
    mintedSkins.push(await mintSkinForPlayer(client, {
      playerId,
      skinSlug: skin.slug || skin.skinSlug,
      acquiredFrom: skin.acquiredFrom || 'match_drop',
      acquiredMatchId: matchId,
      metadata: skin.metadata || {}
    }));
  }

  const player = await recalculatePlayerLevel(client, playerId);

  return {
    alreadyFinalized: false,
    matchId,
    rewards,
    rewardSource: payload.useProvidedRewards === true ? 'provided' : 'economy_settings',
    stats,
    items: grantedItems,
    skins: mintedSkins,
    player
  };
}

module.exports = {
  finalizeMatch,
  grantItem,
  mintSkinForPlayer,
  recalculatePlayerLevel,
  calculateRewards
};
