import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { createPool } from './db/pool.js';
import { seedDemoData } from './db/seed.js';

const pool = createPool(config.DATABASE_URL);

try {
  const migration = await migrate(pool, {
    log: (message) => console.log(`[migrate] ${message}`),
  });
  console.log(
    `[migrate] ${migration.applied.length} applied, ${migration.skipped} already up to date`,
  );

  if (config.SEED_DEMO) {
    const seeded = await seedDemoData(pool, { password: config.DEMO_PASSWORD });
    console.log(
      seeded
        ? '[seed] demo users and tickets inserted (non-production)'
        : '[seed] skipped: users already exist',
    );
  }

  const app = await buildApp({
    pool,
    demo: config.SEED_DEMO,
    demoPassword: config.DEMO_PASSWORD,
    cookieSecure: config.COOKIE_SECURE,
    sessionTtlHours: config.SESSION_TTL_HOURS,
    trustProxy: config.TRUST_PROXY,
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: {
              paths: ['req.headers.cookie', 'res.headers["set-cookie"]'],
              censor: '[REDACTED]',
            },
          },
  });

  await app.listen({ port: config.PORT, host: config.HOST });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down`);
    try {
      await app.close();
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error('[server] shutdown failed', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
} catch (error) {
  console.error('[server] failed to start', error);
  await pool.end().catch(() => {});
  process.exit(1);
}
