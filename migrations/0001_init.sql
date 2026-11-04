-- Initial schema for the service desk.
-- Status and priority vocabularies are duplicated as CHECK constraints on
-- purpose: the application is the authority for transitions, and the database
-- refuses rows that fall outside the vocabularies even if a future caller
-- bypasses the service layer.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text        NOT NULL,
  name          text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  role          text        NOT NULL CHECK (role IN ('requester', 'agent')),
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TABLE sessions (
  token_hash text        PRIMARY KEY,
  user_id    integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE tickets (
  id           integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject      text        NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 200),
  description  text        NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 10000),
  status       text        NOT NULL DEFAULT 'new'
                           CHECK (status IN ('new', 'assigned', 'in_progress', 'resolved', 'closed')),
  priority     text        NOT NULL DEFAULT 'normal'
                           CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  requester_id integer     NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  assignee_id  integer     REFERENCES users (id) ON DELETE RESTRICT,
  sla_due_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- `new` means nobody owns the ticket yet; every other status means an agent
  -- does. The assignment service changes both columns in one UPDATE.
  CONSTRAINT tickets_assignee_matches_status CHECK (
    (status = 'new' AND assignee_id IS NULL)
    OR (status <> 'new' AND assignee_id IS NOT NULL)
  ),
  CONSTRAINT tickets_sla_due_after_creation CHECK (sla_due_at >= created_at)
);

CREATE INDEX tickets_queue_idx ON tickets (updated_at DESC, id DESC);
CREATE INDEX tickets_status_idx ON tickets (status);
CREATE INDEX tickets_assignee_id_idx ON tickets (assignee_id);
CREATE INDEX tickets_requester_id_idx ON tickets (requester_id);
CREATE INDEX tickets_sla_due_at_idx ON tickets (sla_due_at)
  WHERE status NOT IN ('resolved', 'closed');
CREATE INDEX tickets_subject_trgm_idx ON tickets USING gin (subject gin_trgm_ops);
CREATE INDEX tickets_description_trgm_idx ON tickets USING gin (description gin_trgm_ops);

CREATE TABLE ticket_comments (
  id         integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id  integer     NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  author_id  integer     NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  body       text        NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ticket_comments_ticket_idx ON ticket_comments (ticket_id, created_at, id);

CREATE TABLE ticket_events (
  id          integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id   integer     NOT NULL REFERENCES tickets (id) ON DELETE RESTRICT,
  actor_id    integer     REFERENCES users (id) ON DELETE RESTRICT,
  kind        text        NOT NULL
                          CHECK (kind IN ('created', 'status_changed', 'assigned',
                                          'priority_changed', 'comment_added')),
  from_status text        CHECK (from_status IS NULL OR from_status IN
                                 ('new', 'assigned', 'in_progress', 'resolved', 'closed')),
  to_status   text        CHECK (to_status IS NULL OR to_status IN
                                 ('new', 'assigned', 'in_progress', 'resolved', 'closed')),
  detail      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ticket_events_ticket_idx ON ticket_events (ticket_id, created_at, id);

-- The audit trail is append-only at the database level, not just by
-- application convention. UPDATE and DELETE raise; TRUNCATE is reserved for
-- test resets and database maintenance.
CREATE FUNCTION ticket_events_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ticket_events is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER ticket_events_append_only
BEFORE UPDATE OR DELETE ON ticket_events
FOR EACH ROW EXECUTE FUNCTION ticket_events_forbid_mutation();

CREATE FUNCTION tickets_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tickets_touch_updated_at
BEFORE UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION tickets_touch_updated_at();
