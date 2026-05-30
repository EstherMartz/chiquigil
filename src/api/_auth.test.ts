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

  // Token-confusion guard: a validly-signed token from a different audience
  // (e.g. a short-lived OAuth `state` token, which is exposed in the public
  // /api/auth/login redirect URL) must NOT be accepted as a session.
  it('rejects a validly-signed token with the wrong audience', async () => {
    const { SignJWT } = await import('jose');
    const wrongAud = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('state')
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(process.env.AUTH_SESSION_SECRET!));
    expect(await verifySession(wrongAud)).toBeNull();
  });
});

describe('oauth state', () => {
  it('round-trips state with a return path', async () => {
    const { signState, verifyState } = await import('./_auth');
    const token = await signState('/projects');
    expect(await verifyState(token)).toBe('/projects');
  });

  it('rejects tampered state', async () => {
    const { signState, verifyState } = await import('./_auth');
    const token = await signState('/projects');
    expect(await verifyState(token.slice(0, -2) + 'zz')).toBeNull();
  });

  // Token-confusion guard: a real session token must NOT be accepted as state.
  it('rejects a session token used as state', async () => {
    const { verifyState } = await import('./_auth');
    const sessionToken = await signSession(USER);
    expect(await verifyState(sessionToken)).toBeNull();
  });
});

describe('cookies', () => {
  it('parses a cookie header', async () => {
    const { parseCookies, SESSION_COOKIE } = await import('./_auth');
    const jar = parseCookies(`${SESSION_COOKIE}=abc; other=1`);
    expect(jar[SESSION_COOKIE]).toBe('abc');
    expect(jar.other).toBe('1');
  });

  it('returns {} for no header', async () => {
    const { parseCookies } = await import('./_auth');
    expect(parseCookies(undefined)).toEqual({});
  });

  // A malformed percent-escape in any cookie must not throw (this parser sits
  // in the auth request path; an attacker-supplied Cookie header reaches it).
  it('does not throw on a malformed percent-escape', async () => {
    const { parseCookies } = await import('./_auth');
    const jar = parseCookies('bad=%E0%A4%A; ok=1');
    expect(jar.ok).toBe('1');
    expect(jar.bad).toBe('%E0%A4%A');
  });

  it('serializes an httpOnly session cookie', async () => {
    const { serializeSessionCookie, SESSION_COOKIE } = await import('./_auth');
    const c = serializeSessionCookie('TOKEN');
    expect(c).toContain(`${SESSION_COOKIE}=TOKEN`);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
  });

  it('clear cookie has Max-Age=0', async () => {
    const { clearSessionCookie } = await import('./_auth');
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
});

describe('guild allow-list', () => {
  beforeEach(() => { process.env.GUILD_ALLOWLIST = '123, 456'; });

  it('parses the allow-list', async () => {
    const { getAllowList } = await import('./_auth');
    expect(getAllowList()).toEqual(['123', '456']);
  });

  it('returns the intersection of user guilds and the allow-list', async () => {
    const { allowedGuildsFor } = await import('./_auth');
    expect(allowedGuildsFor(['456', '789'])).toEqual(['456']);
  });

  it('returns [] when no overlap', async () => {
    const { allowedGuildsFor } = await import('./_auth');
    expect(allowedGuildsFor(['789'])).toEqual([]);
  });
});

describe('requireSession', () => {
  function reqWithCookie(cookie?: string) {
    return { headers: cookie ? { cookie } : {} };
  }

  it('returns the user for a valid session cookie', async () => {
    const { requireSession, SESSION_COOKIE } = await import('./_auth');
    const token = await signSession(USER);
    const user = await requireSession(reqWithCookie(`${SESSION_COOKIE}=${token}`));
    expect(user?.sub).toBe('111');
  });

  it('returns null when no cookie present', async () => {
    const { requireSession } = await import('./_auth');
    expect(await requireSession(reqWithCookie())).toBeNull();
  });

  it('returns null for a garbage cookie', async () => {
    const { requireSession, SESSION_COOKIE } = await import('./_auth');
    expect(await requireSession(reqWithCookie(`${SESSION_COOKIE}=garbage`))).toBeNull();
  });
});
