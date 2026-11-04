import type { User } from '../domain/types.js';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: User | null;
    sessionToken: string | null;
  }
}

export {};
