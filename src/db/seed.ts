import type { Pool } from 'pg';
import { hashPassword } from '../auth/password.js';
import { slaDueAt } from '../domain/sla.js';
import type { Priority, TicketStatus } from '../domain/ticket.js';

type DemoUserKey = 'agent' | 'agent2' | 'requester' | 'requester2';

interface SeedComment {
  author: DemoUserKey;
  body: string;
  afterHours: number;
}

interface SeedTicket {
  subject: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  requester: DemoUserKey;
  assignee: DemoUserKey | null;
  ageHours: number;
  comments?: SeedComment[];
}

const USERS: ReadonlyArray<{
  key: DemoUserKey;
  email: string;
  name: string;
  role: 'requester' | 'agent';
}> = [
  {
    key: 'agent',
    email: 'agent@example.com',
    name: 'Avery Agent',
    role: 'agent',
  },
  {
    key: 'agent2',
    email: 'agent2@example.com',
    name: 'Jordan Lee',
    role: 'agent',
  },
  {
    key: 'requester',
    email: 'requester@example.com',
    name: 'Riley Chen',
    role: 'requester',
  },
  {
    key: 'requester2',
    email: 'requester2@example.com',
    name: 'Sam Patel',
    role: 'requester',
  },
];

const TICKETS: ReadonlyArray<SeedTicket> = [
  {
    subject: 'VPN drops every few minutes from home',
    description:
      'Since the fibre upgrade at home, the company VPN reconnects about every four minutes. Video calls are unusable. I am on the Sydney fibre connection and have already rebooted the router and the laptop.',
    status: 'new',
    priority: 'urgent',
    requester: 'requester',
    assignee: null,
    ageHours: 2,
    comments: [
      {
        author: 'requester',
        body: 'Adding that this only happens on Wi-Fi; a wired connection stayed up for an hour.',
        afterHours: 1,
      },
    ],
  },
  {
    subject: 'New starter laptop setup for Monday',
    description:
      'Priya Raman starts Monday on the data team. Please prepare a 14-inch laptop with the standard build, a dock, and access to the analytics shared drive.',
    status: 'new',
    priority: 'normal',
    requester: 'requester2',
    assignee: null,
    ageHours: 6,
  },
  {
    subject: 'Email delivery delayed by 30-45 minutes',
    description:
      'Messages sent from Outlook arrive at external recipients up to 45 minutes late. Internal mail is instant. This started after yesterday evening.',
    status: 'assigned',
    priority: 'high',
    requester: 'requester',
    assignee: 'agent',
    ageHours: 5,
    comments: [
      {
        author: 'agent',
        body: 'Checking the outbound connector and queue. I will report back within the hour.',
        afterHours: 1,
      },
    ],
  },
  {
    subject: 'Payment terminal offline in the Sydney office',
    description:
      'The card terminal at the front desk shows "no connection". Customers cannot pay for parking validation. It is plugged into the same switch as the printer, which is online.',
    status: 'assigned',
    priority: 'urgent',
    requester: 'requester2',
    assignee: 'agent2',
    ageHours: 11,
    comments: [
      {
        author: 'agent2',
        body: 'Power-cycled the terminal and moved it to the spare port. Waiting for it to register on the network.',
        afterHours: 1,
      },
    ],
  },
  {
    subject: 'Shared drive permissions missing for finance folder',
    description:
      'The finance team moved the monthly close folder. I can see the new folder but cannot open it. My access should mirror the rest of the finance group.',
    status: 'in_progress',
    priority: 'high',
    requester: 'requester',
    assignee: 'agent',
    ageHours: 20,
    comments: [
      {
        author: 'agent',
        body: 'I have added you to FIN-CLOSE-RW. Please sign out and back in, then try again.',
        afterHours: 8,
      },
      {
        author: 'requester',
        body: 'It works now. Thank you.',
        afterHours: 9,
      },
    ],
  },
  {
    subject: 'Teams audio crackles during calls',
    description:
      'Every Teams call has a crackle and occasional dropouts. Headset is a Jabra Evolve2. Slack calls are clean, so it looks specific to Teams.',
    status: 'in_progress',
    priority: 'urgent',
    requester: 'requester2',
    assignee: 'agent2',
    ageHours: 7,
    comments: [
      {
        author: 'agent2',
        body: 'Reproduced on a second headset. Reinstalling the audio driver now.',
        afterHours: 2,
      },
    ],
  },
  {
    subject: 'Printer on level 3 jams on every duplex job',
    description:
      'The Konica on level 3 jams when printing double-sided. Single-sided is fine. Paper tray 2 was refilled this morning.',
    status: 'in_progress',
    priority: 'normal',
    requester: 'requester',
    assignee: 'agent',
    ageHours: 30,
  },
  {
    subject: 'CRM login fails for the sales team',
    description:
      'Five people on the sales team get "invalid session" when signing into the CRM. Password resets did not help. Started around 09:10.',
    status: 'in_progress',
    priority: 'high',
    requester: 'requester2',
    assignee: 'agent',
    ageHours: 9,
    comments: [
      {
        author: 'agent',
        body: 'The CRM vendor reports a degraded identity service. Tracking their incident and will update here.',
        afterHours: 2,
      },
    ],
  },
  {
    subject: 'Request: second monitor for design work',
    description:
      'Please provide a second 27-inch monitor and a monitor arm for the design workstation.',
    status: 'resolved',
    priority: 'low',
    requester: 'requester',
    assignee: 'agent2',
    ageHours: 96,
    comments: [
      {
        author: 'agent2',
        body: 'Monitor and arm delivered to desk 4-12. Please confirm when connected.',
        afterHours: 40,
      },
      {
        author: 'requester',
        body: 'Set up and working. Thanks!',
        afterHours: 44,
      },
    ],
  },
  {
    subject: 'Onboarding account locked after password change',
    description:
      'New starter changed their password and is now locked out of email and the intranet. They start client work tomorrow.',
    status: 'resolved',
    priority: 'normal',
    requester: 'requester2',
    assignee: 'agent',
    ageHours: 50,
  },
  {
    subject: 'Password reset for finance shared account',
    description:
      'The monthly close shared account password is due for rotation. Please reset and store it in the team vault.',
    status: 'closed',
    priority: 'normal',
    requester: 'requester',
    assignee: 'agent2',
    ageHours: 180,
  },
  {
    subject: 'Request: Visio licence for process mapping',
    description:
      'I need a Visio licence for the next two months to document the incident process.',
    status: 'closed',
    priority: 'low',
    requester: 'requester2',
    assignee: 'agent',
    ageHours: 240,
  },
  {
    subject: 'Meeting room display flickers over HDMI',
    description:
      'The display in room 3.04 flickers when a laptop is connected over HDMI. It is fine on the wireless presentation puck.',
    status: 'new',
    priority: 'low',
    requester: 'requester',
    assignee: null,
    ageHours: 14,
  },
  {
    subject: 'Wi-Fi weak in the east wing',
    description:
      'Signal drops to one bar near desks 2-20 to 2-28. Calls on Wi-Fi cut out when walking to the kitchen.',
    status: 'assigned',
    priority: 'normal',
    requester: 'requester2',
    assignee: 'agent2',
    ageHours: 26,
  },
  {
    subject: 'Laptop battery swelling on the 2023 model',
    description:
      'The trackpad is lifting and the chassis bulges when the laptop is warm. I have stopped using it and moved to a spare.',
    status: 'resolved',
    priority: 'high',
    requester: 'requester',
    assignee: 'agent',
    ageHours: 60,
    comments: [
      {
        author: 'agent',
        body: 'Battery replaced under warranty and the device passed a full diagnostic. Safe to use again.',
        afterHours: 30,
      },
    ],
  },
  {
    subject: 'Ransomware alert on the file server',
    description:
      'Endpoint protection flagged a suspicious encryption process on the finance file server. The server has been isolated from the network by the on-call engineer.',
    status: 'closed',
    priority: 'urgent',
    requester: 'requester2',
    assignee: 'agent2',
    ageHours: 200,
    comments: [
      {
        author: 'agent2',
        body: 'Contained, restored from the previous night backup, and root cause traced to a phishing attachment. No data exfiltration found.',
        afterHours: 6,
      },
    ],
  },
  {
    subject: 'Access request: finance share for contractor',
    description:
      'Please grant read-only access to the finance share for our contractor for the next three weeks. Manager approval is attached to the request in the portal.',
    status: 'new',
    priority: 'high',
    requester: 'requester',
    assignee: null,
    ageHours: 10,
  },
  {
    subject: 'Docking station not detected after update',
    description:
      'Since the firmware update this morning, the USB-C dock is not detected. External keyboard and monitor do not work. The laptop charges through the dock.',
    status: 'assigned',
    priority: 'low',
    requester: 'requester2',
    assignee: 'agent',
    ageHours: 16,
  },
  {
    subject: 'Outlook crashes when sending a message',
    description:
      'Outlook closes without an error when I press Send. Drafts are partly saved. This began after the mailbox migration.',
    status: 'in_progress',
    priority: 'urgent',
    requester: 'requester',
    assignee: 'agent',
    ageHours: 5,
    comments: [
      {
        author: 'agent',
        body: 'Rebuilt the Outlook profile. Please try sending a test message.',
        afterHours: 2,
      },
    ],
  },
  {
    subject: 'Scanner not recognised by the front desk PC',
    description:
      'The Fujitsu scanner is missing from Devices and Printers after the PC was reimaged. The USB cable and port are known good.',
    status: 'in_progress',
    priority: 'normal',
    requester: 'requester2',
    assignee: 'agent2',
    ageHours: 40,
  },
  {
    subject: 'Slow boot after the October update',
    description:
      'The laptop takes about six minutes to reach the desktop since the October update. It was under a minute before. No new startup apps.',
    status: 'new',
    priority: 'normal',
    requester: 'requester',
    assignee: null,
    ageHours: 22,
  },
  {
    subject: 'Mobile email stopped syncing on Android',
    description:
      'The Outlook app on my phone has not received mail since yesterday afternoon. Removing and re-adding the account gets stuck at "checking permissions".',
    status: 'assigned',
    priority: 'high',
    requester: 'requester2',
    assignee: 'agent',
    ageHours: 12,
  },
  {
    subject: 'Request: ergonomic keyboard and wrist rest',
    description:
      'Occupational health recommended a split ergonomic keyboard and wrist rest for my desk.',
    status: 'closed',
    priority: 'low',
    requester: 'requester',
    assignee: 'agent2',
    ageHours: 300,
  },
  {
    subject: 'Shared mailbox missing after migration',
    description:
      'The support@ shared mailbox disappeared from my folder list after the migration. Other members of the team still see it.',
    status: 'resolved',
    priority: 'normal',
    requester: 'requester2',
    assignee: 'agent',
    ageHours: 72,
    comments: [
      {
        author: 'agent',
        body: 'Re-added the mailbox with full access. It should appear after restarting Outlook.',
        afterHours: 24,
      },
    ],
  },
];

const HOUR_MS = 60 * 60 * 1000;

function statusPath(status: TicketStatus): TicketStatus[] {
  switch (status) {
    case 'new':
      return [];
    case 'assigned':
      return ['assigned'];
    case 'in_progress':
      return ['assigned', 'in_progress'];
    case 'resolved':
      return ['assigned', 'in_progress', 'resolved'];
    case 'closed':
      return ['assigned', 'in_progress', 'resolved', 'closed'];
  }
}

/**
 * Inserts the demo users, a populated queue, comments and the matching audit
 * trail. Idempotent by virtue of refusing to run when any user exists, so a
 * restart never duplicates rows or changes an edited demo ticket.
 *
 * The seeded password is non-production by design and is printed by the
 * login page only while SEED_DEMO is enabled.
 */
export async function seedDemoData(
  pool: Pool,
  options: { password: string; now?: Date },
): Promise<boolean> {
  const now = options.now ?? new Date();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM users',
    );
    if ((existing.rows[0]?.count ?? 0) > 0) {
      await client.query('ROLLBACK');
      return false;
    }

    const userIds = new Map<DemoUserKey, number>();
    for (const user of USERS) {
      const passwordHash = await hashPassword(options.password);
      const result = await client.query<{ id: number }>(
        `INSERT INTO users (email, name, role, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [user.email, user.name, user.role, passwordHash],
      );
      const id = result.rows[0]?.id;
      if (id === undefined) throw new Error('Failed to insert demo user');
      userIds.set(user.key, id);
    }

    for (const seed of TICKETS) {
      const requesterId = userIds.get(seed.requester);
      const assigneeId = seed.assignee === null ? null : userIds.get(seed.assignee);
      if (requesterId === undefined || (seed.assignee !== null && assigneeId === undefined)) {
        throw new Error(`Missing demo user for ticket ${seed.subject}`);
      }

      const createdAt = new Date(now.getTime() - seed.ageHours * HOUR_MS);
      const dueAt = slaDueAt(createdAt, seed.priority);
      const path = statusPath(seed.status);
      const statusUpdatedAt =
        path.length === 0
          ? createdAt
          : new Date(createdAt.getTime() + seed.ageHours * HOUR_MS * 0.9);
      const latestCommentAt = (seed.comments ?? []).reduce(
        (latest, comment) =>
          Math.max(latest, createdAt.getTime() + comment.afterHours * HOUR_MS),
        createdAt.getTime(),
      );
      const updatedAt = new Date(
        Math.max(statusUpdatedAt.getTime(), latestCommentAt),
      );

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO tickets
           (subject, description, status, priority, requester_id, assignee_id,
            sla_due_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          seed.subject,
          seed.description,
          seed.status,
          seed.priority,
          requesterId,
          assigneeId ?? null,
          dueAt,
          createdAt,
          updatedAt,
        ],
      );
      const ticketId = inserted.rows[0]?.id;
      if (ticketId === undefined) throw new Error('Failed to insert demo ticket');

      await client.query(
        `INSERT INTO ticket_events
           (ticket_id, actor_id, kind, detail, created_at)
         VALUES ($1, $2, 'created', '{}'::jsonb, $3)`,
        [ticketId, requesterId, createdAt],
      );

      let previousStatus: TicketStatus = 'new';
      for (const [index, nextStatus] of path.entries()) {
        const eventAt = new Date(
          createdAt.getTime() + ((index + 1) / (path.length + 1)) * (updatedAt.getTime() - createdAt.getTime()),
        );
        if (nextStatus === 'assigned') {
          await client.query(
            `INSERT INTO ticket_events
               (ticket_id, actor_id, kind, detail, created_at)
             VALUES ($1, $2, 'assigned', $3::jsonb, $4)`,
            [
              ticketId,
              assigneeId,
              JSON.stringify({ fromAssigneeId: null, toAssigneeId: assigneeId }),
              eventAt,
            ],
          );
        }
        await client.query(
          `INSERT INTO ticket_events
             (ticket_id, actor_id, kind, from_status, to_status, detail, created_at)
           VALUES ($1, $2, 'status_changed', $3, $4, $5::jsonb, $6)`,
          [
            ticketId,
            assigneeId,
            previousStatus,
            nextStatus,
            JSON.stringify({ from: previousStatus, to: nextStatus }),
            eventAt,
          ],
        );
        previousStatus = nextStatus;
      }

      for (const comment of seed.comments ?? []) {
        const authorId = userIds.get(comment.author);
        if (authorId === undefined) throw new Error('Missing demo comment author');
        const commentAt = new Date(createdAt.getTime() + comment.afterHours * HOUR_MS);
        const commentRow = await client.query<{ id: number }>(
          `INSERT INTO ticket_comments (ticket_id, author_id, body, created_at)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [ticketId, authorId, comment.body, commentAt],
        );
        const commentId = commentRow.rows[0]?.id;
        await client.query(
          `INSERT INTO ticket_events
             (ticket_id, actor_id, kind, detail, created_at)
           VALUES ($1, $2, 'comment_added', $3::jsonb, $4)`,
          [ticketId, authorId, JSON.stringify({ commentId }), commentAt],
        );
      }

    }

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
