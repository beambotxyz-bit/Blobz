'use strict';

const { httpError } = require('../http-error');

function cleanText(value, maxLength) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function cleanUsername(value) {
  const cleaned = cleanText(value, 64);
  return cleaned ? cleaned.replace(/^@+/, '') : null;
}

function buildDisplayName(user) {
  const username = cleanUsername(user.username);
  if (username) return username;

  const fullName = [cleanText(user.first_name, 64), cleanText(user.last_name, 64)]
    .filter(Boolean)
    .join(' ');
  if (fullName) return fullName.slice(0, 80);

  return `Blobz${String(user.id).slice(-6)}`;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function serializeSelectedSkin(row) {
  if (!row.selected_owned_skin_id) return null;

  return {
    id: row.selected_owned_skin_id,
    slug: row.selected_skin_slug,
    name: row.selected_skin_name,
    rarity: row.selected_skin_rarity,
    imagePath: row.selected_skin_image_path,
    serialNumber: numberValue(row.selected_skin_serial_number)
  };
}

function serializePlayer(row) {
  if (!row) return null;

  return {
    id: row.id,
    telegramId: row.telegram_id ? String(row.telegram_id) : null,
    username: row.username || null,
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    photoUrl: row.photo_url || null,
    displayName: row.display_name,
    level: numberValue(row.level),
    xp: numberValue(row.xp),
    gems: numberValue(row.gems),
    cups: numberValue(row.cups),
    selectedSkin: serializeSelectedSkin(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getPlayerProfile(client, playerId) {
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
      where p.id = $1
    `,
    [playerId]
  );

  return serializePlayer(result.rows[0]);
}

async function upsertTelegramPlayer(client, telegramUser) {
  const telegramId = String(telegramUser.id);
  const username = cleanUsername(telegramUser.username);
  const firstName = cleanText(telegramUser.first_name, 64);
  const lastName = cleanText(telegramUser.last_name, 64);
  const photoUrl = cleanText(telegramUser.photo_url, 512);
  const displayName = buildDisplayName(telegramUser);

  const result = await client.query(
    `
      insert into players (
        telegram_id,
        username,
        first_name,
        last_name,
        photo_url,
        display_name,
        last_login_at
      )
      values ($1, $2, $3, $4, $5, $6, now())
      on conflict (telegram_id) do update
      set username = excluded.username,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          photo_url = excluded.photo_url,
          display_name = excluded.display_name,
          last_login_at = now(),
          updated_at = now()
      returning id
    `,
    [telegramId, username, firstName, lastName, photoUrl, displayName]
  );

  return getPlayerProfile(client, result.rows[0].id);
}

async function getInventory(client, playerId) {
  const skins = await client.query(
    `
      select
        ps.id,
        ps.serial_number,
        ps.acquired_from,
        ps.acquired_match_id,
        ps.created_at,
        s.slug,
        s.name,
        s.rarity,
        s.image_path
      from player_skins ps
      join skins s on s.id = ps.skin_id
      where ps.owner_player_id = $1
      order by ps.created_at desc
    `,
    [playerId]
  );

  const items = await client.query(
    `
      select
        it.slug,
        it.name,
        it.kind,
        pi.quantity,
        pi.updated_at
      from player_items pi
      join item_types it on it.id = pi.item_type_id
      where pi.player_id = $1
      order by it.kind, it.name
    `,
    [playerId]
  );

  return {
    skins: skins.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      rarity: row.rarity,
      imagePath: row.image_path,
      serialNumber: numberValue(row.serial_number),
      acquiredFrom: row.acquired_from,
      acquiredMatchId: row.acquired_match_id,
      createdAt: row.created_at
    })),
    items: items.rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      quantity: numberValue(row.quantity),
      updatedAt: row.updated_at
    }))
  };
}

async function equipSkin(client, playerId, playerSkinId) {
  if (!playerSkinId) {
    await client.query(
      'update players set selected_player_skin_id = null, updated_at = now() where id = $1',
      [playerId]
    );
    return getPlayerProfile(client, playerId);
  }

  const owned = await client.query(
    'select id from player_skins where id = $1 and owner_player_id = $2',
    [playerSkinId, playerId]
  );
  if (!owned.rowCount) throw httpError(404, 'Owned skin was not found.', 'owned_skin_not_found');

  await client.query(
    'update players set selected_player_skin_id = $1, updated_at = now() where id = $2',
    [playerSkinId, playerId]
  );

  return getPlayerProfile(client, playerId);
}

module.exports = {
  getPlayerProfile,
  upsertTelegramPlayer,
  getInventory,
  equipSkin,
  serializePlayer,
  numberValue
};
