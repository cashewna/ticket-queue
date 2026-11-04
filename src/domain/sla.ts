import type { Priority, TicketStatus } from './ticket.js';

const HOUR_MS = 60 * 60 * 1000;

/**
 * SLA policy: the clock starts when the ticket is created and the target is
 * the creation time plus the priority budget below. The due time is stored so
 * the target is stable and auditable; the breach flag is computed at read time
 * (see `isSlaBreached`) so it can never go stale.
 *
 * Priority changes recompute the due time from the original `created_at`,
 * which is why an urgent escalation can make a ticket immediately breached.
 */
export const SLA_HOURS: Readonly<Record<Priority, number>> = {
  urgent: 4,
  high: 8,
  normal: 24,
  low: 72,
};

export const SLA_POLICY: ReadonlyArray<{
  priority: Priority;
  hours: number;
  label: string;
}> = [
  { priority: 'urgent', hours: SLA_HOURS.urgent, label: '4 hours' },
  { priority: 'high', hours: SLA_HOURS.high, label: '8 hours' },
  { priority: 'normal', hours: SLA_HOURS.normal, label: '24 hours' },
  { priority: 'low', hours: SLA_HOURS.low, label: '72 hours' },
];

export function slaDueAt(createdAt: Date, priority: Priority): Date {
  return new Date(createdAt.getTime() + SLA_HOURS[priority] * HOUR_MS);
}

/**
 * A breach is an unresolved ticket whose due time has passed. Resolved and
 * closed tickets are never shown as breached, even if they finished late:
 * lateness is preserved in the timestamps and the audit trail instead.
 */
export function isSlaBreached(
  ticket: { status: TicketStatus; slaDueAt: Date },
  now: Date,
): boolean {
  if (ticket.status === 'resolved' || ticket.status === 'closed') return false;
  return now.getTime() > ticket.slaDueAt.getTime();
}

export type SlaState = 'on_track' | 'breached' | 'met' | 'missed';

/**
 * Open tickets are on track or breached at `now`. Completed tickets keep an
 * outcome instead of losing the signal: the last status change sets
 * `updatedAt`, which is compared with the due time to record whether the
 * target was met or missed.
 */
export function slaState(
  ticket: {
    status: TicketStatus;
    slaDueAt: Date;
    updatedAt: Date;
  },
  now: Date,
): SlaState {
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    return ticket.updatedAt.getTime() > ticket.slaDueAt.getTime()
      ? 'missed'
      : 'met';
  }
  return isSlaBreached(ticket, now) ? 'breached' : 'on_track';
}

export function slaRemainingMs(
  ticket: { status: TicketStatus; slaDueAt: Date },
  now: Date,
): number {
  return ticket.slaDueAt.getTime() - now.getTime();
}

/** JSON-friendly policy, used by the API and the ticket page. */
export function slaPolicyJson(): Array<{
  priority: Priority;
  hours: number;
  label: string;
}> {
  return SLA_POLICY.map((entry) => ({ ...entry }));
}
