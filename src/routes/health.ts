import type { FastifyInstance, FastifyRequest } from 'fastify';
import { notFound } from '../domain/errors.js';
import type { RouteDeps } from './deps.js';

export const APP_VERSION = '1.0.0';

export function registerHealthRoutes(
  app: FastifyInstance,
  deps: Pick<RouteDeps, 'pool'>,
): void {
  app.get('/healthz', { logLevel: 'warn' }, async (_request, reply) => {
    try {
      await deps.pool.query('SELECT 1');
      return reply.code(200).send({
        status: 'ok',
        database: 'up',
        version: APP_VERSION,
        uptimeSeconds: Math.round(process.uptime()),
      });
    } catch (error) {
      app.log.error({ err: error }, 'Health check failed');
      return reply.code(503).send({
        status: 'degraded',
        database: 'down',
        version: APP_VERSION,
        uptimeSeconds: Math.round(process.uptime()),
      });
    }
  });
}

export function parseTicketId(request: FastifyRequest): number {
  const raw = (request.params as { id?: string }).id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw notFound('That ticket does not exist.');
  }
  return id;
}
