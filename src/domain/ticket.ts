export const TICKET_STATUSES = [
  'new',
  'assigned',
  'in_progress',
  'resolved',
  'closed',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export type Priority = (typeof PRIORITIES)[number];

/**
 * The complete status machine. Everything omitted is illegal, and
 * `test/status-machine.test.ts` asserts all 25 from/to pairs.
 *
 * Assignment is the only way into `assigned`, and unassignment is the only
 * way back to `new`; those two moves also change `assignee_id`.
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<TicketStatus, readonly TicketStatus[]>
> = {
  new: ['assigned'],
  assigned: ['new', 'in_progress'],
  in_progress: ['resolved'],
  resolved: ['in_progress', 'closed'],
  closed: [],
};

export const STATUS_LABELS: Readonly<Record<TicketStatus, string>> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const PRIORITY_LABELS: Readonly<Record<Priority, string>> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

/** Primary agent action shown on the ticket page for each status. */
export const PRIMARY_ACTION: Partial<
  Readonly<Record<TicketStatus, { to: TicketStatus; label: string }>>
> = {
  assigned: { to: 'in_progress', label: 'Start work' },
  in_progress: { to: 'resolved', label: 'Resolve' },
  resolved: { to: 'closed', label: 'Close ticket' },
};

export function isTicketStatus(value: unknown): value is TicketStatus {
  return (
    typeof value === 'string' &&
    (TICKET_STATUSES as readonly string[]).includes(value)
  );
}

export function isPriority(value: unknown): value is Priority {
  return (
    typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value)
  );
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: TicketStatus): readonly TicketStatus[] {
  return ALLOWED_TRANSITIONS[from];
}

export function isClosedStatus(status: TicketStatus): boolean {
  return status === 'resolved' || status === 'closed';
}
