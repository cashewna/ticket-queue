import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../src/app.js';
import { seedDemoData } from '../src/db/seed.js';
import { resetDatabase } from './helpers/db.js';

const NOW = new Date('2026-06-01T09:00:00.000Z');
const DEMO_PASSWORD = 'demo-pass-123';

interface TicketDto {
  id: number;
  subject: string;
  status: string;
  priority: string;
  requesterId: number;
  assigneeId: number | null;
  slaDueAt: string;
  createdAt: string;
  slaBreached: boolean;
}

interface DetailDto {
  ticket: TicketDto;
  comments: Array<{ id: number; body: string; authorName: string }>;
  events: Array<{
    kind: string;
    fromStatus: string | null;
    toStatus: string | null;
  }>;
}

let pool: Pool;
let app: FastifyInstance;
let requesterCookie: string;
let agentCookie: string;
let agentId: number;

function asJson<T>(body: string): T {
  return JSON.parse(body) as T;
}

async function login(email: string, password = DEMO_PASSWORD): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/session',
    headers: { 'content-type': 'application/json' },
    payload: { email, password },
  });
  assert.equal(response.statusCode, 200, response.body);
  const header = response.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  assert.ok(first, 'login must set a session cookie');
  return first.split(';')[0] ?? '';
}

function auth(cookie: string): { cookie: string; 'content-type': string } {
  return { cookie, 'content-type': 'application/json' };
}

async function createTicket(
  cookie: string,
  overrides: Partial<{
    subject: string;
    description: string;
    priority: string;
  }> = {},
): Promise<TicketDto> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/tickets',
    headers: auth(cookie),
    payload: {
      subject: 'Test ticket for API coverage',
      description: 'A description long enough to be a real request.',
      priority: 'normal',
      ...overrides,
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  return asJson<{ ticket: TicketDto }>(response.body).ticket;
}

async function detail(cookie: string, id: number): Promise<DetailDto> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/tickets/${id}`,
    headers: { cookie },
  });
  assert.equal(response.statusCode, 200, response.body);
  return asJson<DetailDto>(response.body);
}

before(async () => {
  pool = await resetDatabase();
  await seedDemoData(pool, { password: DEMO_PASSWORD, now: NOW });
  app = await buildApp({
    pool,
    now: () => NOW,
    demo: true,
    demoPassword: DEMO_PASSWORD,
  });
  requesterCookie = await login('requester@example.com');
  agentCookie = await login('agent@example.com');
  const me = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: { cookie: agentCookie },
  });
  agentId = asJson<{ user: { id: number } }>(me.body).user.id;
});

after(async () => {
  await app.close();
  await pool.end();
});

test('health reports the database as up', async () => {
  const response = await app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(response.statusCode, 200);
  const body = asJson<{ status: string; database: string }>(response.body);
  assert.equal(body.status, 'ok');
  assert.equal(body.database, 'up');
});

test('login rejects a wrong password and an unknown email identically', async () => {
  for (const payload of [
    { email: 'requester@example.com', password: 'wrong-password' },
    { email: 'nobody@example.com', password: DEMO_PASSWORD },
  ]) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload,
    });
    assert.equal(response.statusCode, 401);
    const body = asJson<{ error: { code: string; message: string } }>(response.body);
    assert.equal(body.error.code, 'invalid_credentials');
    assert.equal(body.error.message, 'Email or password is incorrect.');
  }
});

test('a requester creates a ticket with the documented SLA due time', async () => {
  const ticket = await createTicket(requesterCookie, {
    subject: 'VPN drops after the fibre upgrade',
    priority: 'high',
  });

  assert.equal(ticket.status, 'new');
  assert.equal(ticket.assigneeId, null);
  assert.equal(ticket.priority, 'high');
  assert.equal(ticket.createdAt, NOW.toISOString());
  assert.equal(ticket.slaDueAt, '2026-06-01T17:00:00.000Z');
  assert.equal(ticket.slaBreached, false);

  const loaded = await detail(requesterCookie, ticket.id);
  assert.deepEqual(
    loaded.events.map((event) => event.kind),
    ['created'],
  );
});

test('requesters only see their own tickets and cannot mutate workflow fields', async () => {
  const list = await app.inject({
    method: 'GET',
    url: '/api/tickets?pageSize=100',
    headers: { cookie: requesterCookie },
  });
  assert.equal(list.statusCode, 200);
  const body = asJson<{ items: TicketDto[] }>(list.body);
  assert.ok(body.items.length > 0);
  for (const ticket of body.items) {
    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: requesterCookie },
    });
    const requesterId = asJson<{ user: { id: number } }>(me.body).user.id;
    assert.equal(ticket.requesterId, requesterId);
  }

  const foreign = await pool.query<{ id: number }>(
    `SELECT t.id FROM tickets t
       JOIN users u ON u.id = t.requester_id
      WHERE u.email = 'requester2@example.com'
      LIMIT 1`,
  );
  const foreignId = foreign.rows[0]?.id;
  assert.ok(foreignId !== undefined);

  const read = await app.inject({
    method: 'GET',
    url: `/api/tickets/${foreignId}`,
    headers: { cookie: requesterCookie },
  });
  assert.equal(read.statusCode, 404);

  const own = await createTicket(requesterCookie);
  for (const [url, payload] of [
    [`/api/tickets/${own.id}/assign`, { assigneeId: agentId }],
    [`/api/tickets/${own.id}/status`, { status: 'in_progress' }],
    [`/api/tickets/${own.id}/priority`, { priority: 'urgent' }],
  ] as const) {
    const response = await app.inject({
      method: 'POST',
      url,
      headers: auth(requesterCookie),
      payload,
    });
    assert.equal(response.statusCode, 403, `${url} must be agent-only`);
  }
});

test('create, assign, comment, resolve and close is recorded end to end', async () => {
  const ticket = await createTicket(requesterCookie, {
    subject: 'Lifecycle: laptop will not boot',
    priority: 'urgent',
  });
  assert.equal(ticket.slaDueAt, '2026-06-01T13:00:00.000Z');

  const assigned = await app.inject({
    method: 'POST',
    url: `/api/tickets/${ticket.id}/assign`,
    headers: auth(agentCookie),
    payload: { assigneeId: agentId },
  });
  assert.equal(assigned.statusCode, 200, assigned.body);
  const assignedTicket = asJson<DetailDto>(assigned.body).ticket;
  assert.equal(assignedTicket.status, 'assigned');
  assert.equal(assignedTicket.assigneeId, agentId);

  const requesterComment = await app.inject({
    method: 'POST',
    url: `/api/tickets/${ticket.id}/comments`,
    headers: auth(requesterCookie),
    payload: { body: 'It started after the October update.' },
  });
  assert.equal(requesterComment.statusCode, 201);

  const agentComment = await app.inject({
    method: 'POST',
    url: `/api/tickets/${ticket.id}/comments`,
    headers: auth(agentCookie),
    payload: { body: 'I am rebuilding the boot partition now.' },
  });
  assert.equal(agentComment.statusCode, 201);

  for (const status of ['in_progress', 'resolved', 'closed']) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/status`,
      headers: auth(agentCookie),
      payload: { status },
    });
    assert.equal(response.statusCode, 200, `${status}: ${response.body}`);
    assert.equal(
      asJson<DetailDto>(response.body).ticket.status,
      status,
    );
  }

  const closed = await detail(agentCookie, ticket.id);
  assert.equal(closed.ticket.status, 'closed');
  assert.equal(closed.comments.length, 2);

  const statusChanges = closed.events
    .filter((event) => event.kind === 'status_changed')
    .map((event) => `${event.fromStatus}->${event.toStatus}`);
  assert.deepEqual(statusChanges, [
    'new->assigned',
    'assigned->in_progress',
    'in_progress->resolved',
    'resolved->closed',
  ]);
  assert.ok(closed.events.some((event) => event.kind === 'assigned'));
  assert.equal(
    closed.events.filter((event) => event.kind === 'comment_added').length,
    2,
  );

  const reopen = await app.inject({
    method: 'POST',
    url: `/api/tickets/${ticket.id}/status`,
    headers: auth(agentCookie),
    payload: { status: 'in_progress' },
  });
  assert.equal(reopen.statusCode, 409);
  assert.equal(
    asJson<{ error: { code: string } }>(reopen.body).error.code,
    'illegal_transition',
  );

  for (const [url, payload] of [
    [`/api/tickets/${ticket.id}/priority`, { priority: 'urgent' }],
    [`/api/tickets/${ticket.id}/assign`, { assigneeId: agentId }],
  ] as const) {
    const locked = await app.inject({
      method: 'POST',
      url,
      headers: auth(agentCookie),
      payload,
    });
    assert.equal(locked.statusCode, 409, `${url} must reject a closed ticket`);
    assert.equal(
      asJson<{ error: { code: string } }>(locked.body).error.code,
      'ticket_completed',
    );
  }
});

test('illegal transitions are refused with a specific conflict', async () => {
  const ticket = await createTicket(requesterCookie);
  const response = await app.inject({
    method: 'POST',
    url: `/api/tickets/${ticket.id}/status`,
    headers: auth(agentCookie),
    payload: { status: 'closed' },
  });
  assert.equal(response.statusCode, 409);
  const body = asJson<{
    error: { code: string; details: { from: string; to: string } };
  }>(response.body);
  assert.equal(body.error.code, 'illegal_transition');
  assert.equal(body.error.details.from, 'new');
  assert.equal(body.error.details.to, 'closed');
});

test('assignment can unassign an assigned ticket and reassign it', async () => {
  const ticket = await createTicket(requesterCookie);

  const first = await app.inject({
    method: 'POST',
    url: `/api/tickets/${ticket.id}/assign`,
    headers: auth(agentCookie),
    payload: { assigneeId: agentId },
  });
  assert.equal(asJson<DetailDto>(first.body).ticket.status, 'assigned');

  const cleared = await app.inject({
    method: 'POST',
    url: `/api/tickets/${ticket.id}/assign`,
    headers: auth(agentCookie),
    payload: { assigneeId: null },
  });
  assert.equal(cleared.statusCode, 200, cleared.body);
  const clearedTicket = asJson<DetailDto>(cleared.body).ticket;
  assert.equal(clearedTicket.status, 'new');
  assert.equal(clearedTicket.assigneeId, null);

  const again = await app.inject({
    method: 'POST',
    url: `/api/tickets/${ticket.id}/assign`,
    headers: auth(agentCookie),
    payload: { assigneeId: agentId },
  });
  assert.equal(asJson<DetailDto>(again.body).ticket.status, 'assigned');
});

test('priority changes recompute the target from the original creation time', async () => {
  const ticket = await createTicket(requesterCookie, { priority: 'low' });
  assert.equal(ticket.slaDueAt, '2026-06-04T09:00:00.000Z');

  const response = await app.inject({
    method: 'POST',
    url: `/api/tickets/${ticket.id}/priority`,
    headers: auth(agentCookie),
    payload: { priority: 'urgent' },
  });
  assert.equal(response.statusCode, 200, response.body);
  const updated = asJson<DetailDto>(response.body);
  assert.equal(updated.ticket.priority, 'urgent');
  assert.equal(updated.ticket.slaDueAt, '2026-06-01T13:00:00.000Z');
  assert.ok(updated.events.some((event) => event.kind === 'priority_changed'));
});

test('an urgent ticket past its target is flagged as breached and filterable', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/tickets?breached=true',
    headers: { cookie: agentCookie },
  });
  assert.equal(response.statusCode, 200);
  const body = asJson<{ items: TicketDto[] }>(response.body);
  assert.ok(body.items.length > 0, 'seed data should include breached tickets');
  for (const ticket of body.items) {
    assert.equal(ticket.slaBreached, true);
    assert.ok(['new', 'assigned', 'in_progress'].includes(ticket.status));
  }
});

test('search and filters narrow the queue', async () => {
  const marker = `Zebra${Date.now()}`;
  const ticket = await createTicket(requesterCookie, {
    subject: `${marker} licence request`,
    priority: 'high',
  });

  const search = await app.inject({
    method: 'GET',
    url: `/api/tickets?q=${marker}`,
    headers: { cookie: agentCookie },
  });
  const found = asJson<{ items: TicketDto[] }>(search.body);
  assert.equal(found.items.length, 1);
  assert.equal(found.items[0]?.id, ticket.id);

  const byStatus = await app.inject({
    method: 'GET',
    url: '/api/tickets?status=resolved&pageSize=100',
    headers: { cookie: agentCookie },
  });
  const resolved = asJson<{ items: TicketDto[] }>(byStatus.body);
  assert.ok(resolved.items.length > 0);
  for (const item of resolved.items) assert.equal(item.status, 'resolved');

  const byPriority = await app.inject({
    method: 'GET',
    url: '/api/tickets?priority=urgent&pageSize=100',
    headers: { cookie: agentCookie },
  });
  const urgent = asJson<{ items: TicketDto[] }>(byPriority.body);
  assert.ok(urgent.items.length > 0);
  for (const item of urgent.items) assert.equal(item.priority, 'urgent');

  const mine = await app.inject({
    method: 'GET',
    url: '/api/tickets?assignee=me&pageSize=100',
    headers: { cookie: agentCookie },
  });
  const assignedToMe = asJson<{ items: TicketDto[] }>(mine.body);
  for (const item of assignedToMe.items) assert.equal(item.assigneeId, agentId);

  const open = await app.inject({
    method: 'GET',
    url: '/api/tickets?open=true&pageSize=100',
    headers: { cookie: agentCookie },
  });
  const openTickets = asJson<{ items: TicketDto[] }>(open.body);
  assert.ok(openTickets.items.length > 0);
  for (const item of openTickets.items) {
    assert.ok(['new', 'assigned', 'in_progress'].includes(item.status));
  }
});

test('the audit log rejects updates and deletes at the database level', async () => {
  const ticket = await createTicket(requesterCookie);
  const event = await pool.query<{ id: number }>(
    'SELECT id FROM ticket_events WHERE ticket_id = $1 ORDER BY id LIMIT 1',
    [ticket.id],
  );
  const eventId = event.rows[0]?.id;
  assert.ok(eventId !== undefined);

  await assert.rejects(
    pool.query('UPDATE ticket_events SET kind = $1 WHERE id = $2', [
      'status_changed',
      eventId,
    ]),
    /append-only/i,
  );
  await assert.rejects(
    pool.query('DELETE FROM ticket_events WHERE id = $1', [eventId]),
    /append-only/i,
  );
});

test('the users endpoint lists agents only and requires an agent', async () => {
  const forbidden = await app.inject({
    method: 'GET',
    url: '/api/users?role=agent',
    headers: { cookie: requesterCookie },
  });
  assert.equal(forbidden.statusCode, 403);

  const response = await app.inject({
    method: 'GET',
    url: '/api/users?role=agent',
    headers: { cookie: agentCookie },
  });
  assert.equal(response.statusCode, 200);
  const body = asJson<{ users: Array<{ role: string }> }>(response.body);
  assert.ok(body.users.length >= 2);
  for (const user of body.users) assert.equal(user.role, 'agent');
});

test('a malformed ticket body is rejected before it reaches the database', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/tickets',
    headers: auth(requesterCookie),
    payload: { subject: '', description: '', priority: 'sometime' },
  });
  assert.equal(response.statusCode, 422);
  assert.equal(
    asJson<{ error: { code: string } }>(response.body).error.code,
    'validation_failed',
  );
});

test('the HTML surfaces render with escaped input, demo hints and security headers', async () => {
  const loginPage = await app.inject({ method: 'GET', url: '/login' });
  assert.equal(loginPage.statusCode, 200);
  assert.match(loginPage.body, /Seeded demo accounts/);
  assert.match(loginPage.body, /Non-production data/);
  assert.match(loginPage.body, /id="email"[^>]*value=""/);

  const unauthorised = await app.inject({ method: 'GET', url: '/tickets' });
  assert.equal(unauthorised.statusCode, 302);
  assert.match(unauthorised.headers.location ?? '', /^\/login\?next=/);

  const queue = await app.inject({
    method: 'GET',
    url: '/tickets',
    headers: { cookie: requesterCookie },
  });
  assert.equal(queue.statusCode, 200);
  assert.match(queue.body, /Your tickets/);
  assert.match(queue.body, /id="filter-q"[^>]*value=""/);
  assert.match(queue.body, /placeholder="Subject or ticket number"/);
  assert.ok(queue.headers['content-security-policy']);

  const newTicketPage = await app.inject({
    method: 'GET',
    url: '/tickets/new',
    headers: { cookie: requesterCookie },
  });
  assert.equal(newTicketPage.statusCode, 200);
  assert.match(newTicketPage.body, /id="subject"[^>]*value=""/);
  assert.match(
    String(queue.headers['content-security-policy']),
    /default-src 'self'/,
  );

  const xssSubject = '<script>alert("xss")</script> subject';
  const ticket = await createTicket(requesterCookie, { subject: xssSubject });
  const page = await app.inject({
    method: 'GET',
    url: `/tickets/${ticket.id}`,
    headers: { cookie: requesterCookie },
  });
  assert.equal(page.statusCode, 200);
  assert.ok(!page.body.includes(xssSubject));
  assert.match(page.body, /&lt;script&gt;/);
  assert.ok(!page.body.includes('Update assignee'), 'requesters see no agent controls');
  assert.match(page.body, /Every status change and assignment is recorded/);

  const missing = await app.inject({
    method: 'GET',
    url: '/tickets/999999',
    headers: { cookie: agentCookie },
  });
  assert.equal(missing.statusCode, 404);
  assert.match(missing.body, /Not found/);
});
