import { z } from 'zod';
import { badRequest } from '../domain/errors.js';
import { PRIORITIES, TICKET_STATUSES } from '../domain/ticket.js';
import type { QueueFilters } from '../domain/types.js';

const queueQuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignee: z
    .union([
      z.literal('me'),
      z.literal('unassigned'),
      z.coerce.number().int().positive(),
    ])
    .optional(),
  breached: z.enum(['true', 'false']).optional(),
  open: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export interface ParsedQueue {
  filters: QueueFilters;
  page: number;
}

export function parseQueueQuery(raw: unknown): ParsedQueue {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== '' && value !== undefined),
  );

  const parsed = queueQuerySchema.safeParse(cleaned);
  if (!parsed.success) {
    throw badRequest(
      'Those filters are not valid.',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const { q, status, priority, assignee, breached, open, page } = parsed.data;
  const filters: QueueFilters = {};
  if (q !== undefined && q !== '') filters.q = q;
  if (status !== undefined) filters.status = status;
  if (priority !== undefined) filters.priority = priority;
  if (assignee !== undefined) filters.assignee = assignee;
  if (breached === 'true') filters.breached = true;
  if (open === 'true') filters.open = true;

  return { filters, page };
}
