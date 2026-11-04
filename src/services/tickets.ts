import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '../db/pool.js';
import {
  conflict,
  forbidden,
  notFound,
  unprocessable,
} from '../domain/errors.js';
import { isSlaBreached, slaDueAt } from '../domain/sla.js';
import {
  canTransition,
  isPriority,
  isTicketStatus,
  type Priority,
  type TicketStatus,
} from '../domain/ticket.js';
import type {
  EventKind,
  QueueFilters,
  QueuePage,
  QueueStats,
  Ticket,
  TicketComment,
  TicketDetail,
  TicketEvent,
  TicketListItem,
  User,
} from '../domain/types.js';

type Queryable = Pool | PoolClient;

interface TicketRow {
  id: number;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  requester_id: number;
  assignee_id: number | null;
  sla_due_at: Date;
  created_at: Date;
  updated_at: Date;
  requester_name: string;
  assignee_name: string | null;
}

interface EventRow {
  id: number;
  ticket_id: number;
  actor_id: number | null;
  actor_name: string | null;
  kind: EventKind;
  from_status: TicketStatus | null;
  to_status: TicketStatus | null;
  detail: Record<string, unknown>;
  created_at: Date;
}

interface CommentRow {
  id: number;
  ticket_id: number;
  author_id: number;
  author_name: string;
  body: string;
  created_at: Date;
}

const TICKET_SELECT = `
  SELECT t.id, t.subject, t.description, t.status, t.priority,
         t.requester_id, t.assignee_id, t.sla_due_at, t.created_at, t.updated_at,
         requester.name AS requester_name,
         assignee.name  AS assignee_name
    FROM tickets t
    JOIN users requester ON requester.id = t.requester_id
    LEFT JOIN users assignee ON assignee.id = t.assignee_id
`;

function mapTicket(row: TicketRow, now: Date): TicketListItem {
  const ticket: Ticket = {
    id: row.id,
    subject: row.subject,
    description: row.description,
    status: row.status,
    priority: row.priority,
    requesterId: row.requester_id,
    assigneeId: row.assignee_id,
    slaDueAt: row.sla_due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return {
    ...ticket,
    requesterName: row.requester_name,
    assigneeName: row.assignee_name,
    slaBreached: isSlaBreached(ticket, now),
  };
}

export function canReadTicket(user: User, ticket: { requesterId: number }): boolean {
  return user.role === 'agent' || ticket.requesterId === user.id;
}

export async function getTicketRow(
  db: Queryable,
  ticketId: number,
  now: Date,
): Promise<TicketListItem | null> {
  const { rows } = await db.query<TicketRow>(
    `${TICKET_SELECT} WHERE t.id = $1`,
    [ticketId],
  );
  const row = rows[0];
  return row === undefined ? null : mapTicket(row, now);
}

export async function getTicketForUser(
  pool: Pool,
  user: User,
  ticketId: number,
  now: Date,
): Promise<TicketDetail> {
  const ticket = await getTicketRow(pool, ticketId, now);
  if (ticket === null || !canReadTicket(user, ticket)) {
    throw notFound('That ticket does not exist.');
  }

  const comments = await pool.query<CommentRow>(
    `SELECT c.id, c.ticket_id, c.author_id, u.name AS author_name, c.body, c.created_at
       FROM ticket_comments c
       JOIN users u ON u.id = c.author_id
      WHERE c.ticket_id = $1
      ORDER BY c.created_at ASC, c.id ASC`,
    [ticketId],
  );

  const events = await pool.query<EventRow>(
    `SELECT e.id, e.ticket_id, e.actor_id, u.name AS actor_name, e.kind,
            e.from_status, e.to_status, e.detail, e.created_at
       FROM ticket_events e
       LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.ticket_id = $1
      ORDER BY e.created_at ASC, e.id ASC`,
    [ticketId],
  );

  return {
    ticket,
    comments: comments.rows.map(
      (row): TicketComment => ({
        id: row.id,
        ticketId: row.ticket_id,
        authorId: row.author_id,
        authorName: row.author_name,
        body: row.body,
        createdAt: row.created_at,
      }),
    ),
    events: events.rows.map(
      (row): TicketEvent => ({
        id: row.id,
        ticketId: row.ticket_id,
        actorId: row.actor_id,
        actorName: row.actor_name,
        kind: row.kind,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        detail: row.detail,
        createdAt: row.created_at,
      }),
    ),
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function listTickets(
  pool: Pool,
  user: User,
  filters: QueueFilters,
  page: number,
  pageSize: number,
  now: Date,
): Promise<QueuePage> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const addParam = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (user.role === 'requester') {
    conditions.push(`t.requester_id = ${addParam(user.id)}`);
  }

  if (filters.q !== undefined && filters.q.trim() !== '') {
    const needle = `%${escapeLike(filters.q.trim())}%`;
    const idParam = /^\d+$/.test(filters.q.trim())
      ? addParam(Number(filters.q.trim()))
      : null;
    const search = `(t.subject ILIKE ${addParam(needle)} OR t.description ILIKE ${addParam(needle)}${
      idParam === null ? '' : ` OR t.id = ${idParam}`
    })`;
    conditions.push(search);
  }

  if (filters.status !== undefined) {
    conditions.push(`t.status = ${addParam(filters.status)}`);
  }

  if (filters.priority !== undefined) {
    conditions.push(`t.priority = ${addParam(filters.priority)}`);
  }

  if (filters.assignee === 'me') {
    conditions.push(`t.assignee_id = ${addParam(user.id)}`);
  } else if (filters.assignee === 'unassigned') {
    conditions.push('t.assignee_id IS NULL');
  } else if (typeof filters.assignee === 'number') {
    conditions.push(`t.assignee_id = ${addParam(filters.assignee)}`);
  }

  if (filters.breached === true) {
    conditions.push(
      `(t.sla_due_at < ${addParam(now)} AND t.status NOT IN ('resolved', 'closed'))`,
    );
  }

  if (filters.open === true) {
    conditions.push(`t.status NOT IN ('resolved', 'closed')`);
  }

  const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`;

  const countResult = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM tickets t ${where}`,
    params,
  );

  const limitParam = addParam(pageSize);
  const offsetParam = addParam((page - 1) * pageSize);
  const rows = await pool.query<TicketRow>(
    `${TICKET_SELECT} ${where}
     ORDER BY t.updated_at DESC, t.id DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  );

  return {
    items: rows.rows.map((row) => mapTicket(row, now)),
    total: countResult.rows[0]?.count ?? 0,
    page,
    pageSize,
  };
}

export async function getQueueStats(
  pool: Pool,
  user: User,
  now: Date,
): Promise<QueueStats> {
  const scope = user.role === 'requester' ? 't.requester_id = $2' : 'true';
  const { rows } = await pool.query<QueueStats>(
    `SELECT
       count(*) FILTER (WHERE t.status NOT IN ('resolved', 'closed'))::int AS open,
       count(*) FILTER (WHERE t.assignee_id IS NULL)::int AS unassigned,
       count(*) FILTER (
         WHERE t.sla_due_at < $1 AND t.status NOT IN ('resolved', 'closed')
       )::int AS breached
     FROM tickets t
     WHERE ${scope}`,
    user.role === 'requester' ? [now, user.id] : [now],
  );

  return rows[0] ?? { open: 0, unassigned: 0, breached: 0 };
}

export async function createTicket(
  pool: Pool,
  input: {
    actor: User;
    subject: string;
    description: string;
    priority: Priority;
    now: Date;
  },
): Promise<TicketDetail> {
  const subject = input.subject.trim();
  const description = input.description.trim();
  if (subject.length === 0 || subject.length > 200) {
    throw unprocessable('Subject must be between 1 and 200 characters.');
  }
  if (description.length === 0 || description.length > 10_000) {
    throw unprocessable('Description must be between 1 and 10,000 characters.');
  }
  if (!isPriority(input.priority)) {
    throw unprocessable('Unknown priority.');
  }

  const ticketId = await withTransaction(pool, async (client) => {
    const dueAt = slaDueAt(input.now, input.priority);
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO tickets
         (subject, description, priority, requester_id, sla_due_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id`,
      [subject, description, input.priority, input.actor.id, dueAt, input.now],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('Ticket insert returned no id');

    await client.query(
      `INSERT INTO ticket_events (ticket_id, actor_id, kind, detail, created_at)
       VALUES ($1, $2, 'created', '{}'::jsonb, $3)`,
      [id, input.actor.id, input.now],
    );
    return id;
  });

  return getTicketForUser(pool, input.actor, ticketId, input.now);
}

async function loadTicketForUpdate(
  client: PoolClient,
  ticketId: number,
): Promise<{
  id: number;
  status: TicketStatus;
  priority: Priority;
  requesterId: number;
  assigneeId: number | null;
  createdAt: Date;
}> {
  const { rows } = await client.query<{
    id: number;
    status: TicketStatus;
    priority: Priority;
    requester_id: number;
    assignee_id: number | null;
    created_at: Date;
  }>(
    `SELECT id, status, priority, requester_id, assignee_id, created_at
       FROM tickets WHERE id = $1 FOR UPDATE`,
    [ticketId],
  );
  const row = rows[0];
  if (row === undefined) throw notFound('That ticket does not exist.');
  return {
    id: row.id,
    status: row.status,
    priority: row.priority,
    requesterId: row.requester_id,
    assigneeId: row.assignee_id,
    createdAt: row.created_at,
  };
}

function assertAgent(actor: User): void {
  if (actor.role !== 'agent') {
    throw forbidden('Only agents can perform that action.');
  }
}

export async function assignTicket(
  pool: Pool,
  input: {
    actor: User;
    ticketId: number;
    assigneeId: number | null;
    now: Date;
  },
): Promise<TicketDetail> {
  assertAgent(input.actor);

  await withTransaction(pool, async (client) => {
    const ticket = await loadTicketForUpdate(client, input.ticketId);

    if (input.assigneeId !== null) {
      const agent = await client.query<{ role: string }>(
        'SELECT role FROM users WHERE id = $1',
        [input.assigneeId],
      );
      if (agent.rows[0]?.role !== 'agent') {
        throw unprocessable('Tickets can only be assigned to an agent.');
      }
    }

    if (ticket.status === 'closed') {
      throw conflict(
        'A closed ticket cannot change owner.',
        'ticket_completed',
      );
    }

    if (ticket.assigneeId === input.assigneeId) return;

    let nextStatus = ticket.status;
    if (input.assigneeId !== null && ticket.status === 'new') {
      nextStatus = 'assigned';
    } else if (input.assigneeId === null && ticket.status === 'assigned') {
      nextStatus = 'new';
    } else if (input.assigneeId === null) {
      throw conflict(
        'A ticket in progress, resolved or closed must keep an assignee.',
        'assignee_required',
      );
    }

    await client.query(
      'UPDATE tickets SET assignee_id = $1, status = $2 WHERE id = $3',
      [input.assigneeId, nextStatus, input.ticketId],
    );

    await client.query(
      `INSERT INTO ticket_events
         (ticket_id, actor_id, kind, detail, created_at)
       VALUES ($1, $2, 'assigned', $3::jsonb, $4)`,
      [
        input.ticketId,
        input.actor.id,
        JSON.stringify({
          fromAssigneeId: ticket.assigneeId,
          toAssigneeId: input.assigneeId,
        }),
        input.now,
      ],
    );

    if (nextStatus !== ticket.status) {
      await client.query(
        `INSERT INTO ticket_events
           (ticket_id, actor_id, kind, from_status, to_status, detail, created_at)
         VALUES ($1, $2, 'status_changed', $3, $4, $5::jsonb, $6)`,
        [
          input.ticketId,
          input.actor.id,
          ticket.status,
          nextStatus,
          JSON.stringify({ from: ticket.status, to: nextStatus }),
          input.now,
        ],
      );
    }
  });

  return getTicketForUser(pool, input.actor, input.ticketId, input.now);
}

export async function transitionTicket(
  pool: Pool,
  input: {
    actor: User;
    ticketId: number;
    to: TicketStatus;
    now: Date;
  },
): Promise<TicketDetail> {
  assertAgent(input.actor);
  if (!isTicketStatus(input.to)) {
    throw unprocessable('Unknown ticket status.');
  }

  await withTransaction(pool, async (client) => {
    const ticket = await loadTicketForUpdate(client, input.ticketId);

    if (!canTransition(ticket.status, input.to)) {
      throw conflict(
        `Cannot move a ticket from ${ticket.status} to ${input.to}.`,
        'illegal_transition',
        { from: ticket.status, to: input.to },
      );
    }

    if (input.to === 'assigned' || input.to === 'new') {
      throw conflict(
        'Use the assignment action to change ownership and status together.',
        'use_assignment_action',
      );
    }

    await client.query('UPDATE tickets SET status = $1 WHERE id = $2', [
      input.to,
      input.ticketId,
    ]);

    await client.query(
      `INSERT INTO ticket_events
         (ticket_id, actor_id, kind, from_status, to_status, detail, created_at)
       VALUES ($1, $2, 'status_changed', $3, $4, $5::jsonb, $6)`,
      [
        input.ticketId,
        input.actor.id,
        ticket.status,
        input.to,
        JSON.stringify({ from: ticket.status, to: input.to }),
        input.now,
      ],
    );
  });

  return getTicketForUser(pool, input.actor, input.ticketId, input.now);
}

export async function changePriority(
  pool: Pool,
  input: {
    actor: User;
    ticketId: number;
    priority: Priority;
    now: Date;
  },
): Promise<TicketDetail> {
  assertAgent(input.actor);
  if (!isPriority(input.priority)) {
    throw unprocessable('Unknown priority.');
  }

  await withTransaction(pool, async (client) => {
    const ticket = await loadTicketForUpdate(client, input.ticketId);
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      throw conflict(
        'Priority cannot change on a completed ticket.',
        'ticket_completed',
      );
    }
    if (ticket.priority === input.priority) return;

    const dueAt = slaDueAt(ticket.createdAt, input.priority);
    await client.query(
      'UPDATE tickets SET priority = $1, sla_due_at = $2 WHERE id = $3',
      [input.priority, dueAt, input.ticketId],
    );
    await client.query(
      `INSERT INTO ticket_events
         (ticket_id, actor_id, kind, detail, created_at)
       VALUES ($1, $2, 'priority_changed', $3::jsonb, $4)`,
      [
        input.ticketId,
        input.actor.id,
        JSON.stringify({
          from: ticket.priority,
          to: input.priority,
          slaDueAt: dueAt.toISOString(),
        }),
        input.now,
      ],
    );
  });

  return getTicketForUser(pool, input.actor, input.ticketId, input.now);
}

export async function addComment(
  pool: Pool,
  input: {
    actor: User;
    ticketId: number;
    body: string;
    now: Date;
  },
): Promise<{ comment: TicketComment; ticket: TicketDetail }> {
  const body = input.body.trim();
  if (body.length === 0 || body.length > 5000) {
    throw unprocessable('Comment must be between 1 and 5,000 characters.');
  }

  const comment = await withTransaction(pool, async (client) => {
    const ticket = await loadTicketForUpdate(client, input.ticketId);
    if (!canReadTicket(input.actor, ticket)) {
      throw notFound('That ticket does not exist.');
    }

    const { rows } = await client.query<{
      id: number;
      ticket_id: number;
      author_id: number;
      author_name: string;
      body: string;
      created_at: Date;
    }>(
      `INSERT INTO ticket_comments (ticket_id, author_id, body, created_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, ticket_id, author_id,
                 (SELECT name FROM users WHERE id = $2) AS author_name,
                 body, created_at`,
      [input.ticketId, input.actor.id, body, input.now],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('Comment insert returned no row');

    await client.query(
      `INSERT INTO ticket_events
         (ticket_id, actor_id, kind, detail, created_at)
       VALUES ($1, $2, 'comment_added', $3::jsonb, $4)`,
      [input.ticketId, input.actor.id, JSON.stringify({ commentId: row.id }), input.now],
    );

    return {
      id: row.id,
      ticketId: row.ticket_id,
      authorId: row.author_id,
      authorName: row.author_name,
      body: row.body,
      createdAt: row.created_at,
    };
  });

  return {
    comment,
    ticket: await getTicketForUser(pool, input.actor, input.ticketId, input.now),
  };
}

export async function listAgents(pool: Pool): Promise<User[]> {
  const { rows } = await pool.query<User>(
    `SELECT id, email, name, role FROM users WHERE role = 'agent' ORDER BY name ASC`,
  );
  return rows;
}
