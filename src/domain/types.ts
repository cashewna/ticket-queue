import type { Priority, TicketStatus } from './ticket.js';

export type Role = 'requester' | 'agent';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface SessionUser extends User {
  sessionTokenHash: string;
}

export interface Ticket {
  id: number;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  requesterId: number;
  assigneeId: number | null;
  slaDueAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketListItem extends Ticket {
  requesterName: string;
  assigneeName: string | null;
  slaBreached: boolean;
}

export type EventKind =
  | 'created'
  | 'status_changed'
  | 'assigned'
  | 'priority_changed'
  | 'comment_added';

export interface TicketEvent {
  id: number;
  ticketId: number;
  actorId: number | null;
  actorName: string | null;
  kind: EventKind;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus | null;
  detail: Record<string, unknown>;
  createdAt: Date;
}

export interface TicketComment {
  id: number;
  ticketId: number;
  authorId: number;
  authorName: string;
  body: string;
  createdAt: Date;
}

export interface TicketDetail {
  ticket: TicketListItem;
  comments: TicketComment[];
  events: TicketEvent[];
}

export interface QueueFilters {
  q?: string;
  status?: TicketStatus;
  priority?: Priority;
  assignee?: 'me' | 'unassigned' | number;
  breached?: boolean;
  open?: boolean;
}

export interface QueuePage {
  items: TicketListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface QueueStats {
  open: number;
  unassigned: number;
  breached: number;
}
