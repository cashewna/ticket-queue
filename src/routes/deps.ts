import type { Pool } from 'pg';

export interface RouteDeps {
  pool: Pool;
  now: () => Date;
  demo: boolean;
  demoPassword: string;
  cookieSecure: boolean;
  sessionTtlHours: number;
}
