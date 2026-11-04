import { slaState, SLA_HOURS } from '../domain/sla.js';
import {
  PRIORITIES,
  PRIMARY_ACTION,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Priority,
} from '../domain/ticket.js';
import type {
  TicketDetail,
  TicketEvent,
  User,
} from '../domain/types.js';
import { html, join, type SafeHtml } from '../web/html.js';
import {
  assigneeCell,
  avatar,
  formatDateTime,
  formatDuration,
  formatRelative,
  priorityBadge,
  statusBadge,
} from './components.js';
import { renderLayout } from './layout.js';

export interface TicketViewOptions {
  user: User;
  now: Date;
  demo: boolean;
  detail: TicketDetail;
  agents: User[];
  notice: string | null;
  currentPath: string;
}

function nameLookup(agents: User[], detail: TicketDetail): Map<number, string> {
  const names = new Map<number, string>();
  for (const agent of agents) names.set(agent.id, agent.name);
  if (detail.ticket.assigneeId !== null) {
    names.set(detail.ticket.assigneeId, detail.ticket.assigneeName ?? 'Agent');
  }
  names.set(detail.ticket.requesterId, detail.ticket.requesterName);
  for (const event of detail.events) {
    if (event.actorId !== null && event.actorName !== null) {
      names.set(event.actorId, event.actorName);
    }
  }
  return names;
}

function describeEvent(
  event: TicketEvent,
  names: Map<number, string>,
): string {
  const actor = event.actorName ?? 'System';
  switch (event.kind) {
    case 'created':
      return `${actor} created the ticket.`;
    case 'status_changed': {
      const from = event.fromStatus === null ? 'unknown' : STATUS_LABELS[event.fromStatus];
      const to = event.toStatus === null ? 'unknown' : STATUS_LABELS[event.toStatus];
      return `${actor} changed status from ${from} to ${to}.`;
    }
    case 'assigned': {
      const target = event.detail.toAssigneeId;
      if (typeof target === 'number' && target === event.actorId) {
        return `${actor} took the ticket.`;
      }
      if (typeof target === 'number') {
        return `${actor} assigned the ticket to ${names.get(target) ?? 'an agent'}.`;
      }
      return `${actor} removed the assignee.`;
    }
    case 'priority_changed': {
      const from = typeof event.detail.from === 'string' ? event.detail.from : 'unknown';
      const to = typeof event.detail.to === 'string' ? event.detail.to : 'unknown';
      return `${actor} changed priority from ${from} to ${to}.`;
    }
    case 'comment_added':
      return `${actor} commented.`;
  }
}

function historyItem(event: TicketEvent, names: Map<number, string>): SafeHtml {
  return html`
    <li class="history-item history-${event.kind}">
      <span class="history-dot" aria-hidden="true"></span>
      <div class="history-body">
        <p>${describeEvent(event, names)}</p>
        <time datetime="${event.createdAt.toISOString()}"
          >${formatDateTime(event.createdAt)}</time
        >
      </div>
    </li>
  `;
}

function commentItem(
  comment: TicketDetail['comments'][number],
): SafeHtml {
  return html`
    <article class="comment">
      ${avatar(comment.authorName)}
      <div class="comment-body">
        <header class="comment-head">
          <span class="comment-author">${comment.authorName}</span>
          <time datetime="${comment.createdAt.toISOString()}"
            >${formatDateTime(comment.createdAt)}</time
          >
        </header>
        <p class="comment-text">${comment.body}</p>
      </div>
    </article>
  `;
}

function prioritySelect(current: Priority): SafeHtml {
  const options = PRIORITIES.map(
    (priority) =>
      html`<option value="${priority}" ${priority === current ? html`selected` : ''}
        >${PRIORITY_LABELS[priority]}</option
      >`,
  );
  return html`<select id="priority" name="priority">${options}</select>`;
}

export function renderTicketPage(options: TicketViewOptions): string {
  const { ticket, comments, events } = options.detail;
  const manage = options.user.role === 'agent';
  const names = nameLookup(options.agents, options.detail);
  const outcome = slaState(ticket, options.now);
  const stopped = outcome === 'met' || outcome === 'missed';
  const breached = outcome === 'breached';
  const missed = outcome === 'missed';
  const slaAlert = breached || missed;
  const totalMs = Math.max(1, ticket.slaDueAt.getTime() - ticket.createdAt.getTime());
  const elapsedMs = Math.max(
    0,
    Math.min(totalMs, options.now.getTime() - ticket.createdAt.getTime()),
  );
  const slaPercent = stopped ? 100 : Math.round((elapsedMs / totalMs) * 100);
  const remainingMs = ticket.slaDueAt.getTime() - options.now.getTime();
  const primary = PRIMARY_ACTION[ticket.status];

  const statusMessage = (() => {
    if (manage) return null;
    switch (ticket.status) {
      case 'new':
        return 'Waiting for an agent to pick this up.';
      case 'assigned':
        return 'An agent has picked this up.';
      case 'in_progress':
        return 'An agent is working on this.';
      case 'resolved':
        return 'This has been marked resolved. Add a comment if the issue is not fixed.';
      case 'closed':
        return 'This ticket is closed. Its history is preserved below.';
    }
  })();

  const actionButtons: SafeHtml[] = [];
  if (manage) {
    if (ticket.status === 'new') {
      actionButtons.push(html`
        <form method="post" action="${`/tickets/${ticket.id}/assign`}" class="stack-form">
          <input type="hidden" name="assigneeId" value="${String(options.user.id)}" />
          <button class="button button-primary button-block" type="submit">
            Assign to me
          </button>
        </form>
      `);
    }
    if (primary !== undefined) {
      actionButtons.push(html`
        <form method="post" action="${`/tickets/${ticket.id}/status`}" class="stack-form">
          <input type="hidden" name="status" value="${primary.to}" />
          <button class="button button-primary button-block" type="submit">
            ${primary.label}
          </button>
        </form>
      `);
    }
    if (ticket.status === 'resolved') {
      actionButtons.push(html`
        <form method="post" action="${`/tickets/${ticket.id}/status`}" class="stack-form">
          <input type="hidden" name="status" value="in_progress" />
          <button class="button button-secondary button-block" type="submit">
            Reopen
          </button>
        </form>
      `);
    }
  }

  const assignForm =
    manage && ticket.status !== 'closed'
      ? html`
          <form class="stack-form" method="post" action="${`/tickets/${ticket.id}/assign`}">
            <div class="field">
              <label for="assigneeId">Assignee</label>
              <select id="assigneeId" name="assigneeId">
                ${ticket.status === 'new' || ticket.status === 'assigned'
                  ? html`<option value="">Unassigned</option>`
                  : ''}
                ${options.agents.map(
                  (agent) => html`<option
                    value="${String(agent.id)}"
                    ${agent.id === ticket.assigneeId ? html`selected` : ''}
                  >
                    ${agent.name}
                  </option>`,
                )}
              </select>
            </div>
            <button class="button button-secondary button-block" type="submit">
              Update assignee
            </button>
          </form>
        `
      : html``;

  const priorityForm =
    manage && ticket.status !== 'closed'
      ? html`
          <form class="stack-form" method="post" action="${`/tickets/${ticket.id}/priority`}">
            <div class="field">
              <label for="priority">Priority</label>
              ${prioritySelect(ticket.priority)}
            </div>
            <button class="button button-secondary button-block" type="submit">
              Update priority
            </button>
            <p class="field-hint">
              Recalculates the SLA target from the original creation time.
            </p>
          </form>
        `
      : html``;

  const slaHeadline =
    outcome === 'met'
      ? 'Met the target'
      : outcome === 'missed'
        ? `Missed target by ${formatDuration(ticket.updatedAt.getTime() - ticket.slaDueAt.getTime())}`
        : breached
          ? `Breached by ${formatDuration(remainingMs)}`
          : `Due ${formatRelative(ticket.slaDueAt, options.now)}`;

  const usedMs = Math.max(
    0,
    (stopped ? ticket.updatedAt.getTime() : options.now.getTime()) -
      ticket.createdAt.getTime(),
  );

  const body = html`
    <main id="main" class="page">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/tickets">Queue</a>
        <span aria-hidden="true">/</span>
        <span>#${ticket.id}</span>
      </nav>

      <div class="ticket-head">
        <div class="ticket-title-block">
          <h1>${ticket.subject}</h1>
          <div class="ticket-meta-row">
            ${statusBadge(ticket.status)}
            ${priorityBadge(ticket.priority)}
            <span class="ticket-id">#${ticket.id}</span>
            <span class="ticket-opened"
              >Opened by ${ticket.requesterName} on
              <time datetime="${ticket.createdAt.toISOString()}"
                >${formatDateTime(ticket.createdAt)}</time
              ></span
            >
          </div>
        </div>
        ${manage
          ? ''
          : html`<p class="ticket-status-note">${statusMessage}</p>`}
      </div>

      <div class="detail-grid">
        <div class="detail-side">
          <aside class="detail-actions" aria-label="Ticket actions and SLA">
          ${manage
            ? html`<section class="card action-card">
                <h2>Actions</h2>
                <div class="action-stack">
                  ${actionButtons}
                  ${ticket.status === 'closed'
                    ? html`<p class="muted-text">
                        Status and ownership are locked. You can still add a comment.
                      </p>`
                    : ''}
                </div>
              </section>`
            : ''}

          <section class="card sla-card ${slaAlert ? 'sla-card-breached' : ''}">
            <div class="sla-card-head">
              <h2>${manage ? 'SLA' : 'Response target'}</h2>
              ${outcome === 'met'
                ? html`<span class="badge badge-success">Met target</span>`
                : missed
                  ? html`<span class="badge badge-danger">Missed target</span>`
                  : breached
                    ? html`<span class="badge badge-danger">Breached</span>`
                    : html`<span class="badge badge-success">On track</span>`}
            </div>
            <p class="sla-headline">${slaHeadline}</p>
            <progress
              class="sla-progress ${slaAlert ? 'is-breached' : ''}"
              value="${String(slaPercent)}"
              max="100"
              aria-label="SLA time elapsed"
            >
              ${slaPercent}%
            </progress>
            <p class="sla-scale">
              ${formatDuration(usedMs)} elapsed · ${SLA_HOURS[ticket.priority]} hour target
            </p>
            <dl class="meta-list">
              <div>
                <dt>Target</dt>
                <dd>
                  ${manage
                    ? `${SLA_HOURS[ticket.priority]} hours from creation (${PRIORITY_LABELS[ticket.priority]})`
                    : `${SLA_HOURS[ticket.priority]} hours from when you raised it`}
                </dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd><time datetime="${ticket.slaDueAt.toISOString()}">${formatDateTime(ticket.slaDueAt)}</time></dd>
              </div>
            </dl>
          </section>
          </aside>

        <aside class="detail-meta" aria-label="Ticket details">
          <section class="card">
            <h2>People</h2>
            <dl class="meta-list">
              <div>
                <dt>Requester</dt>
                <dd>${assigneeCell(ticket.requesterName, { withAvatar: true })}</dd>
              </div>
              <div>
                <dt>Assignee</dt>
                <dd>${assigneeCell(ticket.assigneeName, { withAvatar: true })}</dd>
              </div>
            </dl>
          </section>

          ${manage && ticket.status !== 'closed'
            ? html`<section class="card"><h2>Assignment</h2>${assignForm}</section>`
            : ''}
          ${manage && ticket.status !== 'closed' && ticket.status !== 'resolved'
            ? html`<section class="card"><h2>Priority</h2>${priorityForm}</section>`
            : ''}
        </aside>
        </div>

        <div class="detail-main">
          <section class="card" aria-labelledby="description-heading">
            <h2 id="description-heading">Description</h2>
            <p class="body-text description">${ticket.description}</p>
          </section>

          <section class="card" aria-labelledby="conversation-heading">
            <div class="section-head">
              <h2 id="conversation-heading">Conversation</h2>
              <span class="count">${comments.length}</span>
            </div>
            ${comments.length === 0
              ? html`<p class="empty-inline">No comments yet. Add the first update.</p>`
              : html`<div class="comments">${join(comments.map(commentItem))}</div>`}

            <form class="stack-form comment-form" method="post" action="${`/tickets/${ticket.id}/comments`}">
              <div class="field">
                <label for="comment-body">Add a comment</label>
                <textarea
                  id="comment-body"
                  name="body"
                  rows="4"
                  maxlength="5000"
                  required
                  placeholder="Share an update or ask a question"
                ></textarea>
              </div>
              <div class="form-actions">
                <button class="button button-secondary" type="submit">Add comment</button>
                <span class="field-hint">Visible to the requester and all agents.</span>
              </div>
            </form>
          </section>

          <section class="card" aria-labelledby="history-heading">
            <div class="section-head">
              <h2 id="history-heading">History</h2>
              <span class="count">${events.length}</span>
            </div>
            <p class="field-hint">
              Every status change and assignment is recorded here and cannot be edited.
            </p>
            <ol class="history">
              ${join(events.map((event) => historyItem(event, names)))}
            </ol>
          </section>
        </div>


      </div>
    </main>
  `;

  return renderLayout({
    title: `#${ticket.id} ${ticket.subject}`,
    user: options.user,
    now: options.now,
    demo: options.demo,
    body,
    notice: options.notice,
    currentPath: options.currentPath,
  });
}
