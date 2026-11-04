import assert from 'node:assert/strict';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-pass-123';

class Client {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }

  async request(path, options = {}) {
    const headers = { ...(options.headers ?? {}) };
    let body = options.body;
    if (options.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.json);
    }
    if (options.form !== undefined) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(options.form).toString();
    }
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    }

    const response = await fetch(new URL(path, BASE_URL), {
      method: options.method ?? 'GET',
      headers,
      body,
      redirect: 'manual',
    });

    const setCookies =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter(Boolean);
    for (const cookie of setCookies) {
      const [pair] = cookie.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }

    return response;
  }

  async json(path, options = {}) {
    const response = await this.request(path, options);
    const text = await response.text();
    let parsed = null;
    if (text !== '') {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { response, body: parsed };
  }

  async login(email) {
    const { response, body } = await this.json('/api/session', {
      method: 'POST',
      json: { email, password: PASSWORD },
    });
    assert.equal(response.status, 200, `login ${email} failed: ${JSON.stringify(body)}`);
    console.log(`ok   login as ${body.user.role} ${email}`);
    return body.user;
  }
}

function step(message) {
  console.log(`ok   ${message}`);
}

async function waitForHealth(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL('/healthz', BASE_URL));
      const body = await response.json();
      if (response.status === 200 && body.status === 'ok') {
        return body;
      }
      last = `${response.status} ${JSON.stringify(body)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`service did not become healthy: ${last}`);
}

const health = await waitForHealth();
assert.equal(health.database, 'up');
step(`health endpoint is green (version ${health.version})`);

const requester = new Client('requester');
const requesterUser = await requester.login('requester@example.com');
assert.equal(requesterUser.role, 'requester');

const created = await requester.json('/api/tickets', {
  method: 'POST',
  json: {
    subject: 'Acceptance: VPN keeps dropping',
    description:
      'The VPN disconnects every few minutes. Acceptance run proves create to close over HTTP.',
    priority: 'high',
  },
});
assert.equal(created.response.status, 201, JSON.stringify(created.body));
const ticketId = created.body.ticket.id;
assert.equal(created.body.ticket.status, 'new');
assert.equal(created.body.ticket.assigneeId, null);
assert.equal(created.body.ticket.slaBreached, false);
step(`requester created ticket #${ticketId}`);

const requesterQueue = await requester.json('/api/tickets?q=Acceptance');
assert.equal(requesterQueue.response.status, 200);
assert.ok(
  requesterQueue.body.items.some((ticket) => ticket.id === ticketId),
  'created ticket is visible to its requester',
);
step('requester search finds the new ticket');

const forbidden = await requester.json(`/api/tickets/${ticketId}/assign`, {
  method: 'POST',
  json: { assigneeId: 1 },
});
assert.equal(forbidden.response.status, 403);
step('requester cannot assign (403)');

const agent = new Client('agent');
await agent.login('agent@example.com');
const me = await agent.json('/api/me');
const agentId = me.body.user.id;

const assigned = await agent.json(`/api/tickets/${ticketId}/assign`, {
  method: 'POST',
  json: { assigneeId: agentId },
});
assert.equal(assigned.response.status, 200, JSON.stringify(assigned.body));
assert.equal(assigned.body.ticket.status, 'assigned');
assert.equal(assigned.body.ticket.assigneeId, agentId);
step(`agent ${agentId} assigned the ticket to themselves`);

const comment = await agent.json(`/api/tickets/${ticketId}/comments`, {
  method: 'POST',
  json: { body: 'Reproduced; replacing the VPN profile now.' },
});
assert.equal(comment.response.status, 201);
step('agent added a comment');

for (const [status, label] of [
  ['in_progress', 'started work'],
  ['resolved', 'resolved'],
  ['closed', 'closed'],
]) {
  const moved = await agent.json(`/api/tickets/${ticketId}/status`, {
    method: 'POST',
    json: { status },
  });
  assert.equal(moved.response.status, 200, `${status}: ${JSON.stringify(moved.body)}`);
  assert.equal(moved.body.ticket.status, status);
  step(`agent ${label} (${status})`);
}

const final = await agent.json(`/api/tickets/${ticketId}`);
assert.equal(final.response.status, 200);
assert.equal(final.body.ticket.status, 'closed');
const changes = final.body.events
  .filter((event) => event.kind === 'status_changed')
  .map((event) => `${event.fromStatus}->${event.toStatus}`);
assert.deepEqual(changes, [
  'new->assigned',
  'assigned->in_progress',
  'in_progress->resolved',
  'resolved->closed',
]);
step('audit trail records every status change');

const illegal = await agent.json(`/api/tickets/${ticketId}/status`, {
  method: 'POST',
  json: { status: 'in_progress' },
});
assert.equal(illegal.response.status, 409);
assert.equal(illegal.body.error.code, 'illegal_transition');
step('closed ticket refuses a reopen (409 illegal_transition)');

const breached = await agent.json('/api/tickets?breached=true');
assert.equal(breached.response.status, 200);
assert.ok(breached.body.items.length > 0, 'seeded queue includes breached tickets');
for (const ticket of breached.body.items) assert.equal(ticket.slaBreached, true);
step(`SLA breach filter returns ${breached.body.items.length} breached tickets`);

console.log(`\nPASS: ticket #${ticketId} moved create -> assign -> comment -> resolve -> close over HTTP.`);
