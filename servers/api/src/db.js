'use strict';

const { Pool } = require('pg');
const { config } = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false
});

function query(text, params) {
  return pool.query(text, params);
}

async function transaction(work) {
  const client = await pool.connect();

  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, transaction };
