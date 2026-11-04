import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { clearSessionCookie, setSessionCookie } from '../auth/cookies.js';
import { authenticate } from '../auth/login.js';
import { createSession, destroySession } from '../auth/session.js';
import { badRequest, unprocessable } from '../domain/errors.js';
import {
  isPriority,
  isTicketStatus,
  PRIORITIES,
} from '../domain/ticket.js';
import type { Priority } from '../domain/ticket.js';
import type { User } from '../domain/types.js';
import {
  addComment,
  assignTicket,
  changePriority,
  createTicket,
  getQueueStats,
  getTicketForUser,
  listAgents,
  listTickets,
  transitionTicket,
} from '../services/tickets.js';
import { formString } from '../web/form.js';
import { renderLoginPage } from '../views/login.js';
import { renderNewTicketPage } from '../views/new-ticket.js';
import { renderQueuePage } from '../views/queue.js';
import { renderTicketPage } from '../views/ticket.js';
import type { RouteDeps } from './deps.js';
import { parseTicketId } from './health.js';
import { parseQueueQuery } from './query.js';

const PAGE_SIZE = 25;

const formTicketSchema = z.object({
  subject: z.string().trim().min(1, 'Enter a subject.').max(200, 'Use 200 characters or fewer.'),
  description: z
    .string()
    .trim()
    .min(1, 'Describe the issue.')
    .max(10_000, 'Use 10,000 characters or fewer.'),
  priority: z.enum(PRIORITIES),
});

function safeNext(value: string): string {
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return '/tickets';
}

function queryString(query: unknown, key: string): string {
  return formString(query, key);
}

function pageUser(request: FastifyRequest, reply: FastifyReply): User | null {
  if (request.currentUser === null) {
    const next = encodeURIComponent(request.url);
    void reply.redirect(`/login?next=${next}`);
    return null;
  }
  return request.currentUser;
}

export function registerPageRoutes(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  app.get('/', async (_request, reply) => reply.redirect('/tickets'));

  app.get('/login', async (request, reply) => {
    if (request.currentUser !== null) return reply.redirect('/tickets');
    return reply.type('text/html; charset=utf-8').send(
      renderLoginPage({
        now: deps.now(),
        demo: deps.demo,
        demoPassword: deps.demoPassword,
        error: null,
        email: '',
        next: safeNext(queryString(request.query, 'next')),
      }),
    );
  });

  app.post('/login', async (request, reply) => {
    const email = formString(request.body, 'email');
    const password = formString(request.body, 'password');
    const next = safeNext(formString(request.body, 'next'));

    const renderFailure = (message: string): FastifyReply =>
      reply.code(401).type('text/html; charset=utf-8').send(
        renderLoginPage({
          now: deps.now(),
          demo: deps.demo,
          demoPassword: deps.demoPassword,
          error: message,
          email,
          next,
        }),
      );

    if (email.trim() === '' || password === '') {
      return renderFailure('Enter your email and password.');
    }

    const user = await authenticate(deps.pool, email, password);
    if (user === null) {
      return renderFailure('Email or password is incorrect.');
    }

    if (request.sessionToken !== null) {
      await destroySession(deps.pool, request.sessionToken);
    }
    const session = await createSession(deps.pool, user.id, deps.sessionTtlHours);
    setSessionCookie(reply, session.token, session.expiresAt, deps.cookieSecure);
    return reply.redirect(next, 303);
  });

  app.post('/logout', async (request, reply) => {
    if (request.sessionToken !== null) {
      await destroySession(deps.pool, request.sessionToken);
    }
    clearSessionCookie(reply);
    return reply.redirect('/login?notice=signed-out', 303);
  });

  app.get('/tickets', async (request, reply) => {
    const user = pageUser(request, reply);
    if (user === null) return reply;

    const { filters, page } = parseQueueQuery(request.query);
    const now = deps.now();
    const result = await listTickets(
      deps.pool,
      user,
      filters,
      page,
      PAGE_SIZE,
      now,
    );
    const stats = await getQueueStats(deps.pool, user, now);
    const agents = user.role === 'agent' ? await listAgents(deps.pool) : [];

    return reply.type('text/html; charset=utf-8').send(
      renderQueuePage({
        user,
        now,
        demo: deps.demo,
        result,
        stats,
        filters,
        agents,
        notice: queryString(request.query, 'notice') || null,
        currentPath: request.url,
      }),
    );
  });

  app.get('/tickets/new', async (request, reply) => {
    const user = pageUser(request, reply);
    if (user === null) return reply;

    return reply.type('text/html; charset=utf-8').send(
      renderNewTicketPage({
        user,
        now: deps.now(),
        demo: deps.demo,
        values: { subject: '', description: '', priority: 'normal' },
        errors: {},
        notice: queryString(request.query, 'notice') || null,
        currentPath: request.url,
      }),
    );
  });

  app.post('/tickets', async (request, reply) => {
    const user = pageUser(request, reply);
    if (user === null) return reply;

    const rawPriority = formString(request.body, 'priority');
    const values = {
      subject: formString(request.body, 'subject'),
      description: formString(request.body, 'description'),
      priority: isPriority(rawPriority) ? rawPriority : ('normal' as Priority),
    };

    const parsed = formTicketSchema.safeParse({
      subject: values.subject,
      description: values.description,
      priority: rawPriority,
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && errors[field] === undefined) {
          errors[field] = issue.message;
        }
      }
      return reply.code(422).type('text/html; charset=utf-8').send(
        renderNewTicketPage({
          user,
          now: deps.now(),
          demo: deps.demo,
          values,
          errors,
          notice: null,
          currentPath: request.url,
        }),
      );
    }

    const detail = await createTicket(deps.pool, {
      actor: user,
      subject: parsed.data.subject,
      description: parsed.data.description,
      priority: parsed.data.priority,
      now: deps.now(),
    });

    return reply.redirect(`/tickets/${detail.ticket.id}?notice=ticket-created`, 303);
  });

  app.get('/tickets/:id', async (request, reply) => {
    const user = pageUser(request, reply);
    if (user === null) return reply;

    const detail = await getTicketForUser(
      deps.pool,
      user,
      parseTicketId(request),
      deps.now(),
    );
    const agents = user.role === 'agent' ? await listAgents(deps.pool) : [];

    return reply.type('text/html; charset=utf-8').send(
      renderTicketPage({
        user,
        now: deps.now(),
        demo: deps.demo,
        detail,
        agents,
        notice: queryString(request.query, 'notice') || null,
        currentPath: request.url,
      }),
    );
  });

  app.post('/tickets/:id/assign', async (request, reply) => {
    const user = pageUser(request, reply);
    if (user === null) return reply;

    const raw = formString(request.body, 'assigneeId');
    const assigneeId = raw === '' ? null : Number(raw);
    if (assigneeId !== null && (!Number.isInteger(assigneeId) || assigneeId <= 0)) {
      throw badRequest('Choose a valid assignee.');
    }

    await assignTicket(deps.pool, {
      actor: user,
      ticketId: parseTicketId(request),
      assigneeId,
      now: deps.now(),
    });
    return reply.redirect(`/tickets/${parseTicketId(request)}?notice=ticket-assigned`, 303);
  });

  app.post('/tickets/:id/status', async (request, reply) => {
    const user = pageUser(request, reply);
    if (user === null) return reply;

    const status = formString(request.body, 'status');
    if (!isTicketStatus(status)) {
      throw unprocessable('Choose a valid status.');
    }

    const detail = await transitionTicket(deps.pool, {
      actor: user,
      ticketId: parseTicketId(request),
      to: status,
      now: deps.now(),
    });
    const previous = detail.events.at(-1)?.fromStatus ?? null;
    const notice =
      status === 'resolved'
        ? 'ticket-resolved'
        : status === 'closed'
          ? 'ticket-closed'
          : previous === 'resolved'
            ? 'ticket-reopened'
            : 'ticket-started';
    return reply.redirect(`/tickets/${parseTicketId(request)}?notice=${notice}`, 303);
  });

  app.post('/tickets/:id/priority', async (request, reply) => {
    const user = pageUser(request, reply);
    if (user === null) return reply;

    const priority = formString(request.body, 'priority');
    if (!isPriority(priority)) {
      throw unprocessable('Choose a valid priority.');
    }

    await changePriority(deps.pool, {
      actor: user,
      ticketId: parseTicketId(request),
      priority,
      now: deps.now(),
    });
    return reply.redirect(`/tickets/${parseTicketId(request)}?notice=priority-updated`, 303);
  });

  app.post('/tickets/:id/comments', async (request, reply) => {
    const user = pageUser(request, reply);
    if (user === null) return reply;

    await addComment(deps.pool, {
      actor: user,
      ticketId: parseTicketId(request),
      body: formString(request.body, 'body'),
      now: deps.now(),
    });
    return reply.redirect(`/tickets/${parseTicketId(request)}?notice=comment-added`, 303);
  });
}
