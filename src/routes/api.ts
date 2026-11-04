import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { clearSessionCookie, setSessionCookie } from '../auth/cookies.js';
import { authenticate } from '../auth/login.js';
import { createSession, destroySession } from '../auth/session.js';
import { AppError, unauthorized, unprocessable } from '../domain/errors.js';
import { PRIORITIES, TICKET_STATUSES } from '../domain/ticket.js';
import {
  addComment,
  assignTicket,
  changePriority,
  createTicket,
  getTicketForUser,
  listAgents,
  listTickets,
  transitionTicket,
} from '../services/tickets.js';
import type { RouteDeps } from './deps.js';
import { requireAgent, requireUser } from './guards.js';
import { parseTicketId } from './health.js';
import { parseQueueQuery } from './query.js';

const loginSchema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
});

const createTicketSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(10_000),
  priority: z.enum(PRIORITIES).default('normal'),
});

const assignSchema = z.object({
  assigneeId: z.number().int().positive().nullable(),
});

const statusSchema = z.object({
  status: z.enum(TICKET_STATUSES),
});

const prioritySchema = z.object({
  priority: z.enum(PRIORITIES),
});

const commentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw unprocessable(
      'Check the request body.',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

export function registerApiRoutes(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  app.post('/api/session', async (request, reply) => {
    const { email, password } = parseBody(loginSchema, request.body);
    const user = await authenticate(deps.pool, email, password);
    if (user === null) {
      throw new AppError(
        401,
        'invalid_credentials',
        'Email or password is incorrect.',
      );
    }

    if (request.sessionToken !== null) {
      await destroySession(deps.pool, request.sessionToken);
    }
    const session = await createSession(deps.pool, user.id, deps.sessionTtlHours);
    setSessionCookie(reply, session.token, session.expiresAt, deps.cookieSecure);
    return reply.code(200).send({ user });
  });

  app.delete('/api/session', async (request, reply) => {
    if (request.sessionToken !== null) {
      await destroySession(deps.pool, request.sessionToken);
    }
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get('/api/me', async (request) => {
    return { user: requireUser(request) };
  });

  app.get('/api/tickets', async (request) => {
    const user = requireUser(request);
    const { filters, page } = parseQueueQuery(request.query);
    const result = await listTickets(
      deps.pool,
      user,
      filters,
      page,
      25,
      deps.now(),
    );
    return result;
  });

  app.post('/api/tickets', async (request, reply) => {
    const user = requireUser(request);
    const input = parseBody(createTicketSchema, request.body);
    const detail = await createTicket(deps.pool, {
      actor: user,
      subject: input.subject,
      description: input.description,
      priority: input.priority,
      now: deps.now(),
    });
    return reply.code(201).send({ ticket: detail.ticket });
  });

  app.get('/api/tickets/:id', async (request) => {
    const user = requireUser(request);
    const detail = await getTicketForUser(
      deps.pool,
      user,
      parseTicketId(request),
      deps.now(),
    );
    return detail;
  });

  app.post('/api/tickets/:id/assign', async (request) => {
    const user = requireAgent(request);
    const { assigneeId } = parseBody(assignSchema, request.body);
    return assignTicket(deps.pool, {
      actor: user,
      ticketId: parseTicketId(request),
      assigneeId,
      now: deps.now(),
    });
  });

  app.post('/api/tickets/:id/status', async (request) => {
    const user = requireAgent(request);
    const { status } = parseBody(statusSchema, request.body);
    return transitionTicket(deps.pool, {
      actor: user,
      ticketId: parseTicketId(request),
      to: status,
      now: deps.now(),
    });
  });

  app.post('/api/tickets/:id/priority', async (request) => {
    const user = requireAgent(request);
    const { priority } = parseBody(prioritySchema, request.body);
    return changePriority(deps.pool, {
      actor: user,
      ticketId: parseTicketId(request),
      priority,
      now: deps.now(),
    });
  });

  app.post('/api/tickets/:id/comments', async (request, reply) => {
    const user = requireUser(request);
    const { body } = parseBody(commentSchema, request.body);
    const result = await addComment(deps.pool, {
      actor: user,
      ticketId: parseTicketId(request),
      body,
      now: deps.now(),
    });
    return reply.code(201).send({ comment: result.comment });
  });

  app.get('/api/users', async (request) => {
    requireAgent(request);
    return { users: await listAgents(deps.pool) };
  });
}

export function apiUnauthorized(): AppError {
  return unauthorized('Sign in to continue.');
}
