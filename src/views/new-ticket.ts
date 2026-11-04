import { SLA_POLICY } from '../domain/sla.js';
import {
  PRIORITY_LABELS,
  type Priority,
} from '../domain/ticket.js';
import type { User } from '../domain/types.js';
import { html, type SafeHtml } from '../web/html.js';
import { renderLayout } from './layout.js';

export interface NewTicketValues {
  subject: string;
  description: string;
  priority: Priority;
}

export interface NewTicketViewOptions {
  user: User;
  now: Date;
  demo: boolean;
  values: NewTicketValues;
  errors: Readonly<Record<string, string>>;
  notice: string | null;
  currentPath: string;
}

function fieldError(id: string, message: string | undefined): SafeHtml {
  if (message === undefined) return html``;
  return html`<p class="field-error" id="${`${id}-error`}">${message}</p>`;
}

export function renderNewTicketPage(options: NewTicketViewOptions): string {
  const { values, errors } = options;
  const errorEntries = Object.entries(errors);

  const summary =
    errorEntries.length === 0
      ? html``
      : html`
          <div class="alert alert-error alert-summary" role="alert" tabindex="-1" id="error-summary">
            <h2>${errorEntries.length === 1 ? 'There is a problem' : 'There are problems'}</h2>
            <ul>
              ${errorEntries.map(
                ([field, message]) =>
                  html`<li><a href="${`#${field}`}">${message}</a></li>`,
              )}
            </ul>
          </div>
        `;

  const priorityOptions = SLA_POLICY.map((policy) => {
    const checked = values.priority === policy.priority;
    return html`
      <label class="priority-option ${checked ? 'is-selected' : ''}">
        <input
          type="radio"
          name="priority"
          value="${policy.priority}"
          ${checked ? html`checked` : ''}
        />
        <span class="priority-option-body">
          <span class="badge priority priority-${policy.priority}"
            >${PRIORITY_LABELS[policy.priority]}</span
          >
          <span class="priority-option-target">${policy.label} target</span>
        </span>
      </label>
    `;
  });

  const body = html`
    <main id="main" class="page page-form">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/tickets">Queue</a>
        <span aria-hidden="true">/</span>
        <span>New ticket</span>
      </nav>

      <div class="page-head page-head-compact">
        <div>
          <h1>New ticket</h1>
          <p class="page-subtitle">
            Describe the issue. The priority sets the response target.
          </p>
        </div>
      </div>

      ${summary}

      <form class="card form-card" method="post" action="/tickets" novalidate>
        <div class="field ${errors.subject !== undefined ? 'field-invalid' : ''}">
          <label for="subject">Subject</label>
          <p class="field-hint" id="subject-hint">A short summary an agent can scan.</p>
          <input
            id="subject"
            name="subject"
            type="text"
            value="${values.subject}"
            maxlength="200"
            required
            autocomplete="off"
            aria-describedby="${`subject-hint${errors.subject !== undefined ? ' subject-error' : ''}`}"
            ${errors.subject !== undefined ? html`aria-invalid="true"` : ''}
          />
          ${fieldError('subject', errors.subject)}
        </div>

        <div class="field ${errors.description !== undefined ? 'field-invalid' : ''}">
          <label for="description">Description</label>
          <p class="field-hint" id="description-hint">
            What happened, what you tried, and who is affected.
          </p>
          <textarea
            id="description"
            name="description"
            rows="8"
            maxlength="10000"
            required
            aria-describedby="${`description-hint${errors.description !== undefined ? ' description-error' : ''}`}"
            ${errors.description !== undefined ? html`aria-invalid="true"` : ''}
          >${values.description}</textarea>
          ${fieldError('description', errors.description)}
        </div>

        <fieldset class="field priority-field">
          <legend>Priority</legend>
          <p class="field-hint" id="priority-hint">
            Targets run from the moment the ticket is created.
          </p>
          <div class="priority-options">
            ${priorityOptions}
          </div>
        </fieldset>

        <div class="form-actions">
          <button class="button button-primary" type="submit">Create ticket</button>
          <a class="button button-secondary" href="/tickets">Cancel</a>
        </div>
      </form>
    </main>
  `;

  return renderLayout({
    title: 'New ticket',
    user: options.user,
    now: options.now,
    demo: options.demo,
    body,
    notice: options.notice,
    currentPath: options.currentPath,
  });
}
