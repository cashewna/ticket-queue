import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
);

const MIGRATION_LOCK_KEY = 918_273_645;

interface MigrationRow {
  version: string;
  checksum: string;
}

export interface MigrateResult {
  applied: string[];
  skipped: number;
}

/**
 * Applies the SQL files in `migrations/` in lexical order. Each file runs in
 * its own transaction, is recorded with a SHA-256 checksum, and a Postgres
 * advisory lock serialises concurrent boots. An edited, already-applied
 * migration fails loudly instead of being silently re-run.
 */
export async function migrate(
  pool: Pool,
  options: { dir?: string; log?: (message: string) => void } = {},
): Promise<MigrateResult> {
  const dir = options.dir ?? DEFAULT_MIGRATIONS_DIR;
  const log = options.log ?? (() => {});

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text        PRIMARY KEY,
        checksum   text        NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(dir))
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    const { rows } = await client.query<MigrationRow>(
      'SELECT version, checksum FROM schema_migrations',
    );
    const applied = new Map(rows.map((row) => [row.version, row.checksum]));

    const appliedNow: string[] = [];
    let skipped = 0;

    for (const file of files) {
      const sql = await readFile(`${dir}/${file}`, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = applied.get(file);

      if (previous !== undefined) {
        if (previous !== checksum) {
          throw new Error(
            `Migration ${file} changed after it was applied ` +
              `(recorded ${previous}, now ${checksum}). Add a new migration instead.`,
          );
        }
        skipped += 1;
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
          [file, checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${String(error)}`, {
          cause: error,
        });
      }

      appliedNow.push(file);
      log(`applied ${file}`);
    }

    return { applied: appliedNow, skipped };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}
