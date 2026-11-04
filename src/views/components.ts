import type { Priority, TicketStatus } from '../domain/ticket.js';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
} from '../domain/ticket.js';
import { slaState } from '../domain/sla.js';
import type { TicketListItem } from '../domain/types.js';
import { html, type SafeHtml } from '../web/html.js';

const dateTimeFormat = new Intl.DateTimeFormat('en-AU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

const timeFormat = new Intl.DateTimeFormat('en-AU', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

const compactFormat = new Intl.DateTimeFormat('en-AU', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

export function formatDateTime(date: Date): string {
  return `${dateTimeFormat.format(date)} UTC`;
}

export function formatTime(date: Date): string {
  return `${timeFormat.format(date)} UTC`;
}

export function formatCompactDateTime(date: Date): string {
  return compactFormat.format(date);
}

function compactDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function plural(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  if (minutes < 60) return plural(minutes, 'min');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return plural(hours, 'hour');
  const days = Math.round(hours / 24);
  return plural(days, 'day');
}

export function formatRelative(date: Date, now: Date): string {
  const diff = date.getTime() - now.getTime();
  const absolute = Math.abs(diff);
  if (absolute < 60_000) return 'just now';
  const duration = formatDuration(absolute);
  return diff > 0 ? `in ${duration}` : `${duration} ago`;
}

export function statusBadge(status: TicketStatus): SafeHtml {
  return html`<span class="badge status status-${status}"
    ><span class="status-dot" aria-hidden="true"></span>${STATUS_LABELS[status]}</span
  >`;
}

export function priorityBadge(priority: Priority): SafeHtml {
  return html`<span class="badge priority priority-${priority}"
    >${PRIORITY_LABELS[priority]}</span
  >`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}

export function avatar(name: string): SafeHtml {
  return html`<span class="avatar" aria-hidden="true">${initials(name)}</span>`;
}

export function assigneeCell(
  name: string | null,
  options: { withAvatar?: boolean } = {},
): SafeHtml {
  if (name === null) {
    return html`<span class="unassigned">Unassigned</span>`;
  }
  return html`<span class="assignee"
    >${options.withAvatar === true ? avatar(name) : ''}<span>${name}</span></span
  >`;
}

export function slaCell(ticket: TicketListItem, now: Date): SafeHtml {
  const state = slaState(ticket, now);

  if (state === 'met') {
    return html`
      <span class="sla sla-met">Met</span>
      <span class="sla-detail">Within target</span>
    `;
  }
  if (state === 'missed') {
    return html`
      <span class="sla sla-breached">Missed</span>
      <span class="sla-detail" title="${formatDateTime(ticket.slaDueAt)}"
        >${compactDuration(ticket.updatedAt.getTime() - ticket.slaDueAt.getTime())} over</span
      >
    `;
  }

  const breached = state === 'breached';
  return html`
    <span class="sla ${breached ? 'sla-breached' : 'sla-open'}">
      ${breached ? 'Breached' : formatRelative(ticket.slaDueAt, now)}
    </span>
    <span class="sla-detail" title="${formatDateTime(ticket.slaDueAt)}"
      >${breached
        ? `${compactDuration(now.getTime() - ticket.slaDueAt.getTime())} over`
        : formatCompactDateTime(ticket.slaDueAt)}</span
    >
  `;
}

export const NOTICE_TEXT: Readonly<Record<string, string>> = {
  'ticket-created': 'Ticket created.',
  'ticket-assigned': 'Ownership updated.',
  'comment-added': 'Comment added.',
  'ticket-started': 'Work started.',
  'ticket-reopened': 'Ticket reopened.',
  'ticket-resolved': 'Ticket resolved.',
  'ticket-closed': 'Ticket closed.',
  'status-updated': 'Status updated.',
  'priority-updated': 'Priority updated.',
  'signed-out': 'You have been signed out.',
};

export function noticeFor(code: string | undefined): string | null {
  if (code === undefined) return null;
  return NOTICE_TEXT[code] ?? null;
}
