'use strict';

const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function run() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => /\.sql$/i.test(file))
    .sort();

  const client = await pool.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    for (const file of files) {
      const alreadyApplied = await client.query(
        'select 1 from schema_migrations where filename = $1',
        [file]
      );

      if (alreadyApplied.rowCount) {
        console.log(`Skipping ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query('begin');
      try {
        console.log(`Applying ${file}`);
        await client.query(sql);
        await client.query(
          'insert into schema_migrations (filename) values ($1)',
          [file]
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
