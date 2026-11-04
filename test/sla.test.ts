import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isSlaBreached,
  slaDueAt,
  slaState,
  SLA_HOURS,
} from '../src/domain/sla.js';

test('the documented priority budgets produce the expected due time', () => {
  const createdAt = new Date('2026-06-01T09:00:00.000Z');
  const expectedHours = { urgent: 4, high: 8, normal: 24, low: 72 } as const;

  for (const [priority, hours] of Object.entries(expectedHours)) {
    assert.equal(SLA_HOURS[priority as keyof typeof expectedHours], hours);
    const due = slaDueAt(createdAt, priority as keyof typeof expectedHours);
    assert.equal(due.toISOString(), new Date(createdAt.getTime() + hours * 3_600_000).toISOString());
  }
});

test('a ticket is not breached exactly at its due time', () => {
  const due = new Date('2026-06-01T13:00:00.000Z');
  assert.equal(
    isSlaBreached({ status: 'in_progress', slaDueAt: due }, due),
    false,
  );
});

test('a ticket is breached one millisecond after its due time', () => {
  const due = new Date('2026-06-01T13:00:00.000Z');
  const after = new Date(due.getTime() + 1);
  assert.equal(isSlaBreached({ status: 'assigned', slaDueAt: due }, after), true);
});

test('resolved and closed tickets are never reported as currently breached', () => {
  const due = new Date('2026-06-01T13:00:00.000Z');
  const muchLater = new Date('2026-06-05T13:00:00.000Z');
  assert.equal(isSlaBreached({ status: 'resolved', slaDueAt: due }, muchLater), false);
  assert.equal(isSlaBreached({ status: 'closed', slaDueAt: due }, muchLater), false);
  assert.equal(isSlaBreached({ status: 'in_progress', slaDueAt: due }, muchLater), true);
});

test('completed tickets keep a met or missed outcome', () => {
  const due = new Date('2026-06-01T13:00:00.000Z');
  const now = new Date('2026-06-05T13:00:00.000Z');

  assert.equal(
    slaState(
      {
        status: 'resolved',
        slaDueAt: due,
        updatedAt: new Date('2026-06-01T12:00:00.000Z'),
      },
      now,
    ),
    'met',
  );
  assert.equal(
    slaState(
      {
        status: 'closed',
        slaDueAt: due,
        updatedAt: new Date('2026-06-01T14:00:00.000Z'),
      },
      now,
    ),
    'missed',
  );
  assert.equal(
    slaState(
      {
        status: 'in_progress',
        slaDueAt: due,
        updatedAt: new Date('2026-06-01T12:00:00.000Z'),
      },
      now,
    ),
    'breached',
  );
});
