import type { Pool } from 'pg';
import { migrate } from '../../src/db/migrate.js';
import { createPool } from '../../src/db/pool.js';

const DEFAULT_TEST_URL =
  'postgres://ticket:ticket_dev_password@localhost:5433/ticket_queue_test';

export function testDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_TEST_URL;
}

/**
 * Drops and rebuilds the public schema, then applies every migration. The
 * database name must end in `_test`; this is the guard that keeps a mistyped
 * DATABASE_URL from destroying a development or production database.
 */
export async function resetDatabase(): Promise<Pool> {
  const pool = createPool(testDatabaseUrl(), 5);
  const { rows } = await pool.query<{ name: string }>(
    'SELECT current_database() AS name',
  );
  const name = rows[0]?.name ?? '';
  if (!name.endsWith('_test')) {
    await pool.end();
    throw new Error(
      `Refusing to reset database "${name}": test databases must end in _test.`,
    );
  }

  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await migrate(pool);
  return pool;
}
