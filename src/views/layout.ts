import type { User } from '../domain/types.js';
import { html, type SafeHtml } from '../web/html.js';
import { avatar, noticeFor } from './components.js';

export interface LayoutOptions {
  title: string;
  user: User | null;
  now: Date;
  demo: boolean;
  body: SafeHtml;
  notice?: string | null;
  currentPath?: string;
}

export function renderLayout(options: LayoutOptions): string {
  const nav = (() => {
    if (options.user === null) return html``;
    const path = options.currentPath ?? '';
    const queueActive = path.startsWith('/tickets') && !path.startsWith('/tickets/new');
    const newActive = path.startsWith('/tickets/new');
    return html`
      <nav class="main-nav" aria-label="Main">
        <a href="/tickets" ${queueActive ? html`aria-current="page"` : ''}>Queue</a>
        <a href="/tickets/new" ${newActive ? html`aria-current="page"` : ''}>New ticket</a>
      </nav>
    `;
  })();

  const account =
    options.user === null
      ? html`<span class="header-note">Demo build</span>`
      : html`
          <div
            class="account"
            role="group"
            aria-label="Signed in as ${options.user.name}, ${options.user.role}"
          >
            ${avatar(options.user.name)}
            <span class="account-name">${options.user.name}</span>
            <span class="badge role-badge role-${options.user.role}"
              >${options.user.role === 'agent' ? 'Agent' : 'Requester'}</span
            >
            <form method="post" action="/logout" class="inline-form">
              <button type="submit" class="link-button">Sign out</button>
            </form>
          </div>
        `;

  const notice = options.notice ?? null;
  const flash =
    notice === null
      ? html``
      : html`<div class="flash" role="status">
          <span class="flash-icon" aria-hidden="true">✓</span>
          <span>${noticeFor(notice) ?? 'Saved.'}</span>
        </div>`;

  return html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="description" content="Relay Desk — IT service desk ticketing" />
    <title>${options.title} · Relay Desk</title>
    <link rel="icon" href="/static/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/static/tokens.css" />
    <link rel="stylesheet" href="/static/styles.css" />
    <script src="/static/app.js" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <div id="route-progress" class="route-progress" aria-hidden="true"><span></span></div>
    <div id="route-status" class="route-status" role="status" aria-live="polite" hidden></div>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="/tickets" aria-label="Relay Desk home">
          <span class="brand-mark" aria-hidden="true">R</span>
          <span class="brand-name">Relay <span>Desk</span></span>
        </a>
        ${nav}
        ${account}
      </div>
    </header>
    <div class="app-shell">
      ${flash} ${options.body}
    </div>
    <footer class="site-footer">
      <span>Relay Desk · demo build with seeded, non-production data.</span>
    </footer>
  </body>
</html>`.value;
}
