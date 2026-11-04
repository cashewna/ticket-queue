import { config } from '../config.js';
import { migrate } from '../db/migrate.js';
import { createPool } from '../db/pool.js';

const pool = createPool(config.DATABASE_URL);
try {
  const result = await migrate(pool, { log: (message) => console.log(message) });
  console.log(
    `Migrations complete: ${result.applied.length} applied, ${result.skipped} already up to date.`,
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
