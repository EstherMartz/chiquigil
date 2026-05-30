import { describe, it, expect, beforeEach } from 'vitest';
import meHandler from './me';
import logoutHandler from './logout';
import { signSession, SESSION_COOKIE } from '../_auth';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// @vitest-environment node

function makeRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(k: string, v: string) { this.headers[k] = v; },
    status(code: number) { this.statusCode = code; return this; },
    end() { return this; },
    json(p: unknown) { this.body = p; return this; },
  };
  return res as VercelResponse & { statusCode: number; headers: Record<string, string>; body: any };
}

function req(method: string, cookie?: string): VercelRequest {
  return { method, headers: cookie ? { cookie } : {} } as unknown as VercelRequest;
}

beforeEach(() => { process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123'; });

describe('auth/me', () => {
  it('returns the user for a valid cookie', async () => {
    const token = await signSession({ sub: '111', username: 'Esther', avatar: 'av', guilds: ['123'] });
    const res = makeRes();
    await meHandler(req('GET', `${SESSION_COOKIE}=${token}`), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.sub).toBe('111');
    expect(res.body.user.username).toBe('Esther');
  });

  it('returns 401 with no cookie', async () => {
    const res = makeRes();
    await meHandler(req('GET'), res);
    expect(res.statusCode).toBe(401);
  });
});

describe('auth/logout', () => {
  it('clears the cookie and 302s to /login', async () => {
    const res = makeRes();
    await logoutHandler(req('POST'), res);
    expect(res.statusCode).toBe(302);
    expect(res.headers['Set-Cookie']).toContain('Max-Age=0');
    expect(res.headers['Location']).toBe('/login');
  });
});
