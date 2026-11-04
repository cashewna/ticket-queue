import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

test('a stored hash verifies with the same password and rejects another', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.match(hash, /^scrypt\$/);
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyPassword('Correct horse battery staple', hash), false);
});

test('two hashes of the same password use different salts', async () => {
  const first = await hashPassword('demo-pass-123');
  const second = await hashPassword('demo-pass-123');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('demo-pass-123', first), true);
  assert.equal(await verifyPassword('demo-pass-123', second), true);
});

test('malformed stored hashes fail closed', async () => {
  assert.equal(await verifyPassword('demo-pass-123', ''), false);
  assert.equal(await verifyPassword('demo-pass-123', 'plaintext'), false);
  assert.equal(await verifyPassword('demo-pass-123', 'scrypt$1$2$3$bad$bad'), false);
  assert.equal(
    await verifyPassword(
      'demo-pass-123',
      'scrypt$16384$8$1$AAAA$AAAA',
    ),
    false,
  );
});
