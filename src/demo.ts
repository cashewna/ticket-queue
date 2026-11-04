/**
 * Seeded demo identities. The password is supplied through DEMO_PASSWORD and
 * defaults to the value below. These are deliberately obvious, non-production
 * credentials and are shown on the login page only while SEED_DEMO is on.
 */
export const DEFAULT_DEMO_PASSWORD = 'demo-pass-123';

export const DEMO_ACCOUNTS: ReadonlyArray<{
  role: 'requester' | 'agent';
  email: string;
  name: string;
}> = [
  { role: 'requester', email: 'requester@example.com', name: 'Riley Chen' },
  { role: 'agent', email: 'agent@example.com', name: 'Avery Agent' },
];

export const SECONDARY_DEMO_AGENT = {
  email: 'agent2@example.com',
  name: 'Jordan Lee',
} as const;
