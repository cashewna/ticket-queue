import type { Pool } from 'pg';
import { verifyPassword } from './password.js';
import type { User } from '../domain/types.js';

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: 'requester' | 'agent';
  password_hash: string;
}

/**
 * Resolves credentials to a user. Unknown email and wrong password produce
 * the same `null` so the caller can return one indistinguishable message.
 */
export async function authenticate(
  pool: Pool,
  email: string,
  password: string,
): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    `SELECT id, email, name, role, password_hash
       FROM users
      WHERE lower(email) = lower($1)`,
    [email.trim()],
  );

  const row = rows[0];
  if (row === undefined) return null;

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return null;

  return { id: row.id, email: row.email, name: row.name, role: row.role };
}
