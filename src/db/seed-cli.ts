import { config } from '../config.js';
import { migrate } from '../db/migrate.js';
import { createPool } from '../db/pool.js';
import { seedDemoData } from './seed.js';

const pool = createPool(config.DATABASE_URL);
try {
  await migrate(pool);
  const seeded = await seedDemoData(pool, { password: config.DEMO_PASSWORD });
  if (seeded) {
    console.log('Seeded demo users and tickets (non-production).');
    console.log('  requester@example.com / agent@example.com');
    console.log(`  password: ${config.DEMO_PASSWORD}`);
  } else {
    console.log('Seed skipped: the users table is not empty.');
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
