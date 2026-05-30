import { describe, it, expect, beforeEach } from 'vitest';
import { signSession, verifySession, type SessionUser } from './_auth';

// @vitest-environment node

const USER: SessionUser = {
  sub: '111',
  username: 'Esther',
  avatar: 'abc',
  guilds: ['123'],
};

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
});

describe('session token', () => {
  it('round-trips a signed session', async () => {
    const token = await signSession(USER);
    const decoded = await verifySession(token);
    expect(decoded).toMatchObject(USER);
  });

  it('rejects a tampered token', async () => {
    const token = await signSession(USER);
    const tampered = token.slice(0, -3) + 'xxx';
    expect(await verifySession(tampered)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession(USER);
    process.env.AUTH_SESSION_SECRET = 'completely-different-secret-value-000';
    expect(await verifySession(token)).toBeNull();
  });
});
