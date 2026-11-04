import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  TICKET_STATUSES,
  type TicketStatus,
} from '../src/domain/ticket.js';

/**
 * Written from the documented matrix in README.md, not derived from the
 * implementation, so a change to the machine has to update this literal.
 */
const EXPECTED: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  new: ['assigned'],
  assigned: ['new', 'in_progress'],
  in_progress: ['resolved'],
  resolved: ['in_progress', 'closed'],
  closed: [],
};

test('every from/to pair is classified exactly as the policy states', () => {
  let pairs = 0;
  for (const from of TICKET_STATUSES) {
    for (const to of TICKET_STATUSES) {
      pairs += 1;
      const legal = EXPECTED[from].includes(to);
      assert.equal(
        canTransition(from, to),
        legal,
        `transition ${from} -> ${to} should be ${legal ? 'legal' : 'illegal'}`,
      );
      assert.equal(
        ALLOWED_TRANSITIONS[from].includes(to),
        legal,
        `matrix entry ${from} -> ${to}`,
      );
    }
  }
  assert.equal(pairs, 25, 'all five statuses squared are covered');
});

test('closed tickets cannot move anywhere', () => {
  for (const to of TICKET_STATUSES) {
    assert.equal(canTransition('closed', to), false, `closed -> ${to}`);
  }
});

test('resolution can be reopened or closed, never sent back to new', () => {
  assert.equal(canTransition('resolved', 'in_progress'), true);
  assert.equal(canTransition('resolved', 'closed'), true);
  assert.equal(canTransition('resolved', 'new'), false);
  assert.equal(canTransition('resolved', 'assigned'), false);
});

test('a ticket cannot skip work and resolve from new or assigned', () => {
  assert.equal(canTransition('new', 'resolved'), false);
  assert.equal(canTransition('assigned', 'resolved'), false);
  assert.equal(canTransition('new', 'in_progress'), false);
});
