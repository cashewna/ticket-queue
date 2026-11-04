import type { User } from '../domain/types.js';
import { html } from '../web/html.js';
import { renderLayout } from './layout.js';

export interface ErrorViewOptions {
  statusCode: number;
  title: string;
  message: string;
  user: User | null;
  now: Date;
  demo: boolean;
  currentPath?: string;
}

export function renderErrorPage(options: ErrorViewOptions): string {
  const body = html`
    <main id="main" class="page page-narrow">
      <div class="card error-card">
        <p class="error-code">${options.statusCode}</p>
        <h1>${options.title}</h1>
        <p class="page-subtitle">${options.message}</p>
        <div class="error-actions">
          <a class="button button-primary" href="/tickets">Back to the queue</a>
          ${options.user === null
            ? html`<a class="button button-secondary" href="/login">Sign in</a>`
            : ''}
        </div>
      </div>
    </main>
  `;

  return renderLayout({
    title: options.title,
    user: options.user,
    now: options.now,
    demo: options.demo,
    body,
    notice: null,
    ...(options.currentPath === undefined ? {} : { currentPath: options.currentPath }),
  });
}
