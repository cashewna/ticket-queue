import { html } from '../web/html.js';
import { renderLayout } from './layout.js';

export interface LoginViewOptions {
  now: Date;
  demo: boolean;
  demoPassword: string;
  error: string | null;
  email: string;
  next: string;
}

export function renderLoginPage(options: LoginViewOptions): string {
  const error =
    options.error === null
      ? html``
      : html`<div class="alert alert-error" id="login-error" role="alert">
          <span class="alert-icon" aria-hidden="true">!</span>
          <span>${options.error}</span>
        </div>`;

  const demo =
    options.demo === false
      ? html``
      : html`
          <aside class="demo-panel" aria-labelledby="demo-heading">
            <h2 id="demo-heading">Seeded demo accounts</h2>
            <p class="demo-note">Non-production data. Do not reuse these credentials.</p>
            <dl class="demo-list">
              <div>
                <dt>Requester</dt>
                <dd><code>requester@example.com</code></dd>
              </div>
              <div>
                <dt>Agent</dt>
                <dd><code>agent@example.com</code></dd>
              </div>
              <div>
                <dt>Password</dt>
                <dd><code>${options.demoPassword}</code></dd>
              </div>
            </dl>
          </aside>
        `;

  const body = html`
    <main id="main" class="auth-main">
      <div class="auth-card card">
        <p class="eyebrow">Relay Desk</p>
        <h1>Sign in</h1>
        <p class="page-subtitle">Use your service desk account to continue.</p>

        ${error}

        <form method="post" action="/login" class="stack-form">
          <input type="hidden" name="next" value="${options.next}" />
          <div class="field">
            <label for="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value="${options.email}"
              autocomplete="username"
              required
              autofocus
              ${options.error !== null ? html`aria-invalid="true" aria-describedby="login-error"` : ''}
            />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
              ${options.error !== null ? html`aria-invalid="true" aria-describedby="login-error"` : ''}
            />
          </div>
          <button class="button button-primary button-block" type="submit">Sign in</button>
        </form>

        ${demo}
      </div>
    </main>
  `;

  return renderLayout({
    title: 'Sign in',
    user: null,
    now: options.now,
    demo: options.demo,
    body,
    notice: null,
  });
}
