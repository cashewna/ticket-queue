import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import type { SessionUser } from '../domain/types.js';

export const SESSION_COOKIE = 'sid';

export function createSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  pool: Pool,
  userId: number,
  ttlHours: number,
): Promise<{ token: string; expiresAt: Date }> {
  const { token, tokenHash } = createSessionToken();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [tokenHash, userId, expiresAt],
  );
  return { token, expiresAt };
}

interface SessionRow {
  id: number;
  email: string;
  name: string;
  role: 'requester' | 'agent';
  token_hash: string;
}

export async function findSession(
  pool: Pool,
  token: string,
): Promise<SessionUser | null> {
  const { rows } = await pool.query<SessionRow>(
    `SELECT u.id, u.email, u.name, u.role, s.token_hash
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()`,
    [hashSessionToken(token)],
  );

  const row = rows[0];
  if (row === undefined) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    sessionTokenHash: row.token_hash,
  };
}

export async function destroySession(pool: Pool, token: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [
    hashSessionToken(token),
  ]);
}

export async function destroyExpiredSessions(pool: Pool): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE expires_at <= now()');
}
