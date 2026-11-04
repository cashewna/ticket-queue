import type { Priority } from '../domain/ticket.js';
import {
  PRIORITIES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TICKET_STATUSES,
} from '../domain/ticket.js';
import type {
  QueueFilters,
  QueuePage,
  QueueStats,
  User,
} from '../domain/types.js';
import { html, join, type SafeHtml } from '../web/html.js';
import {
  assigneeCell,
  formatRelative,
  priorityBadge,
  slaCell,
  statusBadge,
} from './components.js';
import { renderLayout } from './layout.js';

// Filter lists come from the domain vocabulary so a new status cannot appear
// in one place only.
const FILTER_STATUSES = TICKET_STATUSES;

export interface QueueViewOptions {
  user: User;
  now: Date;
  demo: boolean;
  result: QueuePage;
  stats: QueueStats;
  filters: QueueFilters;
  agents: User[];
  notice: string | null;
  currentPath: string;
}

function selected(value: string, current: string): SafeHtml {
  return value === current ? html`selected` : html``;
}

function filterQuery(filters: QueueFilters): string {
  const params = new URLSearchParams();
  if (filters.q !== undefined && filters.q !== '') params.set('q', filters.q);
  if (filters.status !== undefined) params.set('status', filters.status);
  if (filters.priority !== undefined) params.set('priority', filters.priority);
  if (filters.assignee !== undefined) {
    params.set(
      'assignee',
      typeof filters.assignee === 'number'
        ? String(filters.assignee)
        : filters.assignee,
    );
  }
  if (filters.breached === true) params.set('breached', 'true');
  if (filters.open === true) params.set('open', 'true');
  return params.toString();
}

function pageHref(filters: QueueFilters, page: number): string {
  const query = filterQuery(filters);
  return query === '' ? `/tickets?page=${page}` : `/tickets?${query}&page=${page}`;
}

function emptyState(options: {
  title: string;
  body: string;
  action?: SafeHtml;
}): SafeHtml {
  return html`
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M4 6h16M4 12h16M4 18h10" stroke-linecap="round" />
        </svg>
      </div>
      <h2>${options.title}</h2>
      <p>${options.body}</p>
      ${options.action ?? ''}
    </div>
  `;
}

export function renderQueuePage(options: QueueViewOptions): string {
  const { filters, result } = options;
  const currentAssignee =
    filters.assignee === undefined ? '' : String(filters.assignee);

  const hasFilters =
    (filters.q !== undefined && filters.q !== '') ||
    filters.status !== undefined ||
    filters.priority !== undefined ||
    filters.assignee !== undefined ||
    filters.breached === true ||
    filters.open === true;

  const statusOptions = FILTER_STATUSES.map(
    (status) => html`<option value="${status}" ${selected(status, filters.status ?? '')}
      >${STATUS_LABELS[status]}</option
    >`,
  );
  const priorityOptions = PRIORITIES.map(
    (priority: Priority) => html`<option value="${priority}" ${selected(priority, filters.priority ?? '')}
      >${PRIORITY_LABELS[priority]}</option
    >`,
  );
  const agentOptions = options.agents.map(
    (agent) => html`<option value="${String(agent.id)}" ${selected(String(agent.id), currentAssignee)}
      >${agent.name}</option
    >`,
  );

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.page * result.pageSize, result.total);

  const rows = result.items.map((ticket) => {
    return html`
      <tr>
        <td class="cell-ticket" data-label="Ticket">
          <a class="ticket-link" href="/tickets/${ticket.id}">${ticket.subject}</a>
          <div class="ticket-meta">
            <span class="ticket-id">#${ticket.id}</span>
            <span aria-hidden="true">·</span>
            <span>${ticket.requesterName}</span>
            <span aria-hidden="true">·</span>
            <span>updated ${formatRelative(ticket.updatedAt, options.now)}</span>
          </div>
        </td>
        <td data-label="Status">${statusBadge(ticket.status)}</td>
        <td data-label="Priority">${priorityBadge(ticket.priority)}</td>
        <td data-label="Assignee">${assigneeCell(ticket.assigneeName)}</td>
        <td data-label="SLA" class="cell-sla">${slaCell(ticket, options.now)}</td>
      </tr>
    `;
  });

  const empty = emptyState({
    title: hasFilters ? 'No tickets match these filters' : 'The queue is clear',
    body: hasFilters
      ? 'Try a different status, priority or search term.'
      : options.user.role === 'requester'
        ? 'You have not raised a ticket yet. Create one and the service desk will pick it up.'
        : 'There are no tickets in the queue. New requests will appear here.',
    action: hasFilters
      ? html`<a class="button button-secondary" href="/tickets">Clear filters</a>`
      : html`<a class="button button-primary" href="/tickets/new">New ticket</a>`,
  });

  const body = html`
    <main id="main" class="page">
      <div class="page-head">
        <div>
          <p class="eyebrow">Service desk</p>
          <h1>${options.user.role === 'agent' ? 'Queue' : 'Your tickets'}</h1>
          <p class="page-subtitle">
            ${result.total} ${result.total === 1 ? 'ticket' : 'tickets'}${hasFilters
              ? ' matching your filters'
              : ''}
          </p>
        </div>
        <a class="button button-primary" href="/tickets/new">New ticket</a>
      </div>

      ${hasFilters
        ? ''
        : html`
            <section class="stats" aria-label="Queue summary">
              <a class="stat" href="/tickets?open=true">
                <span class="stat-label">Open</span>
                <span class="stat-value">${options.stats.open}</span>
                <span class="stat-note">Not resolved or closed</span>
              </a>
              <a class="stat" href="/tickets?assignee=unassigned">
                <span class="stat-label">Unassigned</span>
                <span class="stat-value">${options.stats.unassigned}</span>
                <span class="stat-note">Waiting for an agent</span>
              </a>
              <a
                class="stat ${options.stats.breached > 0 ? 'stat-alert' : ''}"
                href="/tickets?breached=true"
              >
                <span class="stat-label">Breached</span>
                <span class="stat-value">${options.stats.breached}</span>
                <span class="stat-note">Past the response target</span>
              </a>
            </section>
          `}

      <input
        type="checkbox"
        id="filters-toggle"
        class="filters-toggle"
        aria-controls="ticket-filters"
        ${hasFilters ? html`checked` : ''}
      />
      <label for="filters-toggle" class="filters-toggle-label">Filters</label>

      <form id="ticket-filters" class="filters" method="get" action="/tickets" role="search">
        <div class="field field-search">
          <label for="filter-q">Search</label>
          <input
            id="filter-q"
            name="q"
            type="search"
            value="${filters.q ?? ''}"
            placeholder="Subject or ticket number"
            autocomplete="off"
          />
        </div>
        <div class="field">
          <label for="filter-status">Status</label>
          <select id="filter-status" name="status">
            <option value="">Any status</option>
            ${statusOptions}
          </select>
        </div>
        <div class="field">
          <label for="filter-priority">Priority</label>
          <select id="filter-priority" name="priority">
            <option value="">Any priority</option>
            ${priorityOptions}
          </select>
        </div>
        <div class="field">
          <label for="filter-assignee">Assignee</label>
          <select id="filter-assignee" name="assignee">
            <option value="">Anyone</option>
            ${options.user.role === 'agent'
              ? html`<option value="me" ${selected('me', currentAssignee)}>Assigned to me</option>`
              : ''}
            <option value="unassigned" ${selected('unassigned', currentAssignee)}>Unassigned</option>
            ${agentOptions}
          </select>
        </div>
        <div class="filter-actions">
          <button class="button button-secondary" type="submit">Apply filters</button>
          ${hasFilters ? html`<a class="button button-ghost" href="/tickets">Clear</a>` : ''}
        </div>
      </form>

      ${result.items.length === 0
        ? empty
        : html`
            <div class="table-wrap">
              <table class="queue-table">
                <caption class="sr-only">
                  Tickets in the service desk queue
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Ticket</th>
                    <th scope="col">Status</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Assignee</th>
                    <th scope="col">SLA</th>
                  </tr>
                </thead>
                <tbody>
                  ${join(rows)}
                </tbody>
              </table>
            </div>
            <div class="pagination">
              <span class="pagination-summary">Showing ${from}–${to} of ${result.total}</span>
              ${totalPages > 1
                ? html`
                    <div class="pagination-links">
                      ${result.page > 1
                        ? html`<a class="button button-ghost" href="${pageHref(filters, result.page - 1)}"
                            >Previous</a
                          >`
                        : html`<span class="button button-ghost is-disabled" aria-disabled="true"
                            >Previous</span
                          >`}
                      <span class="pagination-page">Page ${result.page} of ${totalPages}</span>
                      ${result.page < totalPages
                        ? html`<a class="button button-ghost" href="${pageHref(filters, result.page + 1)}"
                            >Next</a
                          >`
                        : html`<span class="button button-ghost is-disabled" aria-disabled="true"
                            >Next</span
                          >`}
                    </div>
                  `
                : ''}
            </div>
          `}
    </main>
  `;

  return renderLayout({
    title: 'Queue',
    user: options.user,
    now: options.now,
    demo: options.demo,
    body,
    notice: options.notice,
    currentPath: options.currentPath,
  });
}
