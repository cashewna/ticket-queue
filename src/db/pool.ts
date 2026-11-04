import { Pool, type PoolClient } from 'pg';

export function createPool(connectionString: string, max = 10): Pool {
  const pool = new Pool({
    connectionString,
    max,
    application_name: 'ticket-queue',
  });

  pool.on('error', (error) => {
    // A pooled client can fail while idle; the pool replaces it. Log rather
    // than crash, but keep the failure visible.
    console.error('Unexpected idle PostgreSQL client error', error);
  });

  return pool;
}

export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
