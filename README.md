# Relay Desk

A production-shaped IT service-desk ticketing application: strict TypeScript on
Node, PostgreSQL with SQL migrations, server-rendered HTML, role-based access,
an append-only audit trail, and an SLA clock computed from a documented policy.

[![CI](https://github.com/cashewna/ticket-queue/actions/workflows/ci.yml/badge.svg)](https://github.com/cashewna/ticket-queue/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![The queue view at 1440px](docs/screenshot-queue.png)

## The problem

An IT service desk needs more than a list of issues. A reviewer, agent or
requester must be able to answer, at a glance:

- Who owns this ticket, and what state is it in?
- How urgent is it, and has the response target already passed?
- What happened, in what order, and who changed it?
- Can a requester see only their own tickets while an agent works the queue?

Relay Desk models those questions directly: a small explicit status machine, a
priority-derived SLA target, role-scoped reads and writes, and an audit log that
the database refuses to rewrite.

## Quickstart

Requires Docker with Compose v2. No paid services and no external accounts.

```bash
git clone https://github.com/cashewna/ticket-queue.git
cd ticket-queue
docker compose up --build
```

Open <http://localhost:3000>. The first boot applies the SQL migrations and
seeds a demo queue. Sign in with one of these **non-production** accounts:

| Role | Email | Password |
| --- | --- | --- |
| Requester | `requester@example.com` | `demo-pass-123` |
| Requester | `requester2@example.com` | `demo-pass-123` |
| Agent | `agent@example.com` | `demo-pass-123` |
| Agent | `agent2@example.com` | `demo-pass-123` |

The login page shows the requester and agent accounts while `SEED_DEMO=true`.
These credentials are seeded demo data; they are not a production identity
system and must not be reused.

Work a ticket end to end:

1. As a requester, **New ticket**, choose a priority, and create it.
2. As an agent, open the ticket and use **Assign to me**.
3. **Start work**, add a comment, then **Resolve**, then **Close ticket**.
4. Reopen the ticket from the queue to inspect the conversation and history.

Stop the stack with `docker compose down`; remove the seeded database volume
with `docker compose down -v`.

Ports: the app is published on `3000`; PostgreSQL is published on `5433` for
host-side tests (the app itself reaches the database at `db:5432`).

## Testing

`npm test` runs the domain and HTTP integration suites against real PostgreSQL.
It never touches the demo database: the test database name must end in `_test`.

```bash
docker compose up -d db     # first boot creates ticket_queue_test
npm ci
npm test
```

The compose init script creates `ticket_queue_test` only on a fresh volume. If
the volume already exists, create it once:

```bash
docker compose exec db createdb -U ticket ticket_queue_test
```

Other checks:

```bash
npm run typecheck   # strict TypeScript, tests included
npm run build       # emit dist/
npm run acceptance   # HTTP create → assign → comment → resolve → close
```

The CI workflow runs the same checks, plus a compose smoke test that starts the
stack, waits for `/healthz`, and runs `scripts/acceptance.mjs` against it.
Tests cover all 25 from/to status pairs, the SLA policy boundary, password
hashing, role checks, search/filtering, both audit-log mutation paths, the HTML
states, and the complete ticket lifecycle.

### Continuous integration

The workflow at `.github/workflows/ci.yml` runs on every push to `main` and on
pull requests. The most recent run on `main` is green:

- Run: <https://github.com/cashewna/ticket-queue/actions/runs/41895954573>
- `Unit and integration tests`: `npm ci`, `npm run typecheck`, `npm run build`
  and `npm test` against a `postgres:16` service container.
- `Compose smoke test`: `docker compose up -d --build`, wait for `/healthz`,
  run `scripts/acceptance.mjs` (create → assign → comment → resolve → close),
  then tear the stack down.

Both jobs completed with `success` for commit `76ca1d9`.

## Architecture

```
Browser ──HTML forms──────────┐
   │                          ▼
   └──JSON /api/*──▶ Fastify 5 (src/app.ts)
                        │
            ┌───────────┼─────────────┐
            ▼           ▼             ▼
         auth        domain        services
    scrypt hashes  status machine  transactions
    opaque sessions  SLA policy    + audit events
            │           │             │
            └───────────┴──────┬──────┘
                               ▼
                        PostgreSQL 16
                  SQL migrations, CHECK constraints,
                  append-only trigger, trigram indexes
```

- **Server-rendered UI** (`src/views/`) with small progressive enhancement
  (`public/app.js`) for submit state and a progress indicator. Forms work
  without JavaScript.
- **JSON API** (`/api/*`) with the same service layer and RBAC rules.
- **Domain** (`src/domain/`) holds the status machine, priorities, SLA policy
  and errors. No business rule lives in a route handler or SQL string.
- **Services** (`src/services/tickets.ts`) own transactions and write the audit
  event alongside every mutation.
- **Database** (`migrations/`) is the final guard: vocabulary CHECK constraints,
  assignee/status consistency, append-only audit trigger, and a trigger that
  maintains `updated_at`.
- **Auth**: scrypt password hashes (self-describing cost parameters), opaque
  32-byte session tokens stored only as SHA-256 hashes, `HttpOnly` +
  `SameSite=Lax` cookies.
- **Health**: `GET /healthz` returns `200` with `database: "up"` after
  `SELECT 1`, or `503` when the database is unreachable.

### Request flow

1. Fastify loads the session cookie and resolves the user from `sessions`.
2. The route validates input with Zod and calls a domain/service function.
3. The service locks the ticket row (`SELECT … FOR UPDATE`), checks the status
   machine and role, updates the row, and inserts the matching `ticket_events`
   row in the same transaction.
4. The view renders through an auto-escaping tagged-template helper
   (`src/web/html.ts`); all dynamic text is escaped unless explicitly marked
   safe.

### Repository layout

```
migrations/            SQL migrations, applied once with checksums
src/domain/            status machine, SLA, types, errors
src/services/          ticket use cases and audit writes
src/routes/            HTML pages, JSON API, health
src/views/             server-rendered pages and components
src/auth/              password hashing, sessions, login
src/db/                pool, migration runner, demo seed
public/                tokens.css, styles.css, app.js, favicon
test/                  node:test suites and database helper
scripts/               acceptance and screenshot harnesses
docs/ui/               reviewed screenshots and critic reports
```

## Data model

| Table | Purpose | Notable columns / rules |
| --- | --- | --- |
| `users` | accounts | `role` ∈ requester, agent; unique lower(email); scrypt `password_hash` |
| `sessions` | opaque sessions | `token_hash` primary key, `user_id`, `expires_at` |
| `tickets` | the queue | `status`, `priority`, `requester_id`, `assignee_id`, `sla_due_at`, timestamps |
| `ticket_comments` | conversation | `ticket_id`, `author_id`, body 1–5,000 chars |
| `ticket_events` | audit trail | `kind`, `from_status`, `to_status`, JSONB `detail`, actor, timestamp |
| `schema_migrations` | migration ledger | version, SHA-256 checksum, applied time |

Integrity rules enforced by PostgreSQL:

- `tickets.status` and `tickets.priority` are constrained to the domain
  vocabularies.
- `new` means no assignee; every other status requires one
  (`(status = 'new') = (assignee_id IS NULL)`).
- `sla_due_at >= created_at`.
- `ticket_events` rejects `UPDATE` and `DELETE` in a row-level trigger, so the
  audit trail cannot be edited through the API or a stray query.
- Trigram GIN indexes support `ILIKE` search on subject and description.

### Migrations

`src/db/migrate.ts` applies files in lexical order, one transaction per file,
under a PostgreSQL advisory lock. Applied checksums are recorded; editing a
migration that already ran aborts the boot with the old and new checksums
instead of drifting silently. The app runs migrations at startup, and the same
runner is available as `npm run migrate`.

## Ticket lifecycle

Five statuses and an explicit matrix. Everything not listed is refused with
`409 illegal_transition`.

| From \ To | new | assigned | in_progress | resolved | closed |
| --- | --- | --- | --- | --- | --- |
| **new** | — | ✅ assign | — | — | — |
| **assigned** | ✅ unassign | — | ✅ start work | — | — |
| **in_progress** | — | — | — | ✅ resolve | — |
| **resolved** | — | — | ✅ reopen | — | ✅ close |
| **closed** | — | — | — | — | — |

`test/status-machine.test.ts` asserts all 25 from/to pairs against a literal
matrix written from this table, including the 19 illegal ones. `closed` is
terminal by design; a recurrence should be raised as a new ticket.

## SLA policy

| Priority | Target from creation |
| --- | --- |
| Urgent | 4 hours |
| High | 8 hours |
| Normal | 24 hours |
| Low | 72 hours |

- The due time is calculated at creation (`created_at + priority budget`) and
  stored, so the target is stable and auditable.
- An **open** ticket is breached when `now > sla_due_at`. Exactly at the due
  time it is not yet breached; one millisecond later it is.
- A **resolved or closed** ticket is never reported as currently breached.
  Instead it keeps an outcome: `met` or `missed`, derived from the last status
  change (`updated_at`) against the due time. The queue shows “Met” or
  “Missed · 2d over”, so late delivery is not erased by closing the ticket.
- Changing priority before completion recalculates the due time from the
  original `created_at`; changing priority on a resolved or closed ticket is
  refused, because it would rewrite the outcome after the fact.
- The policy lives in `src/domain/sla.ts` and is shown on the ticket page and
  create form. The README is the human-readable statement of the same policy.

## Roles

| Capability | Requester | Agent |
| --- | --- | --- |
| Create a ticket | ✅ | ✅ |
| List/read own tickets | ✅ | ✅ (all) |
| Read another requester’s ticket | — (404) | ✅ |
| Comment on own/any ticket | ✅ own | ✅ any |
| Assign / unassign | — | ✅ |
| Change priority | — (set at creation) | ✅ before completion |
| Change status (start, resolve, close, reopen) | — | ✅ |
| List agents (`/api/users`) | — | ✅ |

Requesters never receive a 403 that confirms another ticket exists; the service
returns the same 404 as an unknown ID. Agent-only mutations also check role in
the service layer, not only in the route.

## API

All JSON endpoints require a session unless noted. Errors are
`{ "error": { "code": "...", "message": "...", "details": ... } }`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/session` | Sign in; sets `sid` cookie |
| `DELETE` | `/api/session` | Sign out |
| `GET` | `/api/me` | Current user |
| `GET` | `/api/tickets` | Queue; `q`, `status`, `priority`, `assignee=me\|unassigned\|<id>`, `breached=true`, `open=true`, `page` |
| `POST` | `/api/tickets` | Create; `subject`, `description`, `priority` |
| `GET` | `/api/tickets/:id` | Ticket, comments, audit events |
| `POST` | `/api/tickets/:id/assign` | Agent; `assigneeId` or `null` |
| `POST` | `/api/tickets/:id/status` | Agent; `status` |
| `POST` | `/api/tickets/:id/priority` | Agent; `priority` |
| `POST` | `/api/tickets/:id/comments` | `body` |
| `GET` | `/api/users` | Agent-only agent list |
| `GET` | `/healthz` | Liveness + database check; no auth |

Example:

```bash
curl -c jar -H 'content-type: application/json' \
  -d '{"email":"agent@example.com","password":"demo-pass-123"}' \
  http://localhost:3000/api/session

curl -b jar -H 'content-type: application/json' \
  -d '{"subject":"VPN drops","description":"Every few minutes","priority":"high"}' \
  http://localhost:3000/api/tickets
```

## Design decisions and trade-offs

**1. Server-rendered HTML instead of a SPA.**
The queue is a read-heavy operational screen and the forms are small. Server
rendering keeps one source of truth for RBAC and validation, ships no client
router or state cache, and works without JavaScript. The trade-off is a full
page reload per action and no optimistic updates; the only client code is a
progress indicator and submit-state handling. If the product grew rich
filtering or live updates, a client layer would earn its keep.

**2. Opaque database sessions instead of JWTs.**
Sessions are random 32-byte tokens stored as SHA-256 hashes, so sign-out and
account disablement take effect immediately and there is no signing secret to
rotate. The trade-off is one indexed database lookup per authenticated request
and a table that needs expiry cleanup. That is a good trade for a single-region
service desk; a stateless JWT would be attractive for a fan-out of independent
services.

**3. Store the SLA due time, compute breach at read.**
A stored due time is auditable and does not drift with policy changes. A stored
`breached` boolean would go stale the moment the clock passed, so the flag is
derived. For completed tickets the outcome is derived from `updated_at` because
the schema does not store a separate `resolved_at`; this is accurate for the
status-change path and documented as a limitation if comments were the last
write. The trade-off is a little more query logic in exchange for never showing
a stale breach.

**4. Defense in depth for the state machine.**
The matrix exists in TypeScript (`src/domain/ticket.ts`), in service checks, and
as database CHECK constraints for vocabulary and assignee consistency. This
makes illegal states hard to create even from a future script. The trade-off is
duplicated vocabulary: a new status must be added in both the TS tuple and the
SQL migration, and the transition tests fail loudly if the matrix changes.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://ticket:ticket_dev_password@localhost:5433/ticket_queue` | PostgreSQL connection |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Listen address |
| `NODE_ENV` | `development` | Runtime mode |
| `LOG_LEVEL` | `info` | Pino level |
| `SEED_DEMO` | `false` | Seed demo users/tickets when the users table is empty |
| `DEMO_PASSWORD` | `demo-pass-123` | Password for all seeded accounts |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `SESSION_TTL_HOURS` | `168` | Session lifetime |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-*` when behind a proxy |

`compose.yaml` sets the demo values explicitly. No production secrets are in the
repository; the demo password is intentionally public and labelled
non-production.

## UI review

The interface was reviewed by three fresh, read-only critic subagents against
360px, 768px and 1440px screenshots. Scores were 6.6 → 7.5 → 7.1. The final
round surfaced regressions (a squeezed tablet table and empty closed-state
cards) and did not reach the 8.0 target; it is the final permitted round, so the
trajectory and remaining gaps are recorded rather than the bar being lowered.

- [Round 1 review](docs/ui/review-round-1.md) — [captures](docs/ui/round-1/)
- [Round 2 review](docs/ui/review-round-2.md) — [captures](docs/ui/round-2/)
- [Round 3 review](docs/ui/review-round-3.md) — [captures](docs/ui/round-3/)
- [Final post-review captures](docs/ui/round-final/)

The last round’s fixes were not rescored: compact four-column cards at tablet
widths, no empty cards on closed tickets, locked assignment/priority after
completion, a secondary comment action, a two-row mobile header, inline SLA
labels, and event-specific flash messages. Remaining UI gaps are listed in the
round-3 review and below.

## Known limitations

- The app is a single Node process; horizontal scaling would need shared
  sessions (already in PostgreSQL) and a migration lock at boot (already
  advisory-locked) but no queue/worker split.
- No login rate limiting or account lockout. Add a reverse-proxy limiter or a
  counter before exposing this publicly.
- Sessions are deleted on sign-out but expired rows need a periodic cleanup
  job; `destroyExpiredSessions` exists but is not scheduled.
- Search is `ILIKE` plus trigram indexes, without ranking or stemming. It is
  fine for thousands of tickets, not for a large knowledge base.
- Closed is terminal by design; there is no reopen of a closed ticket and no
  automatic follow-up ticket flow.
- Closed tickets still accept comments, which is deliberate (requesters can
  report that a fix did not hold) but may surprise an agent.
- The completed-SLA outcome uses `updated_at` as the completion time; a comment
  does not change `updated_at`, but a future mutation would. A dedicated
  `resolved_at` column is the next step.
- Timestamps are rendered in UTC with `en-AU` formatting; there is no per-user
  timezone preference.
- No attachments, email ingestion, SSO, multi-tenancy, real-time updates or
  i18n. These are explicitly out of scope.
- No TLS termination or deployment manifests are included; `COOKIE_SECURE`
  must be `true` behind an HTTPS proxy.
- UI review finished at 7.1/10, below the 8.0 target, with the remaining items
  documented in the round-3 review.

## Next steps

1. Add `resolved_at` / `closed_at` and write a `sla_breached` audit event when
   the clock passes, so the breach history is queryable rather than derived.
2. Add login rate limiting, CSRF tokens for form posts, and session cleanup.
3. Add sorting, saved views and full-text search (`tsvector` or an external
   index) once the queue exceeds a few thousand rows.
4. Add OpenTelemetry traces, metrics and a readiness endpoint that also checks
   migrations.
5. Add a follow-up-ticket action on closed tickets instead of reopening history
   in place.
6. Run the Playwright screenshot harness as an accessibility/responsive check in
   CI and add automated axe checks.

## Licence

MIT. See [LICENSE](LICENSE).
