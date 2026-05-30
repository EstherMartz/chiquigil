import { describe, it, expect, beforeEach } from 'vitest';
import handler from './login';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// @vitest-environment node

function makeRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { this.headers[k] = v; },
    status(code: number) { this.statusCode = code; return this; },
    end() { return this; },
    json(p: unknown) { this.body = p; return this; },
  };
  return res as VercelResponse & { statusCode: number; headers: Record<string, string> };
}

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
  process.env.DISCORD_CLIENT_ID = 'CLIENT123';
  process.env.OAUTH_REDIRECT_URI = 'https://qiqirn.tools/api/auth/callback';
});

describe('auth/login', () => {
  it('redirects to the Discord authorize URL', async () => {
    const req = { method: 'GET', url: '/api/auth/login?return=/projects', query: { return: '/projects' } } as unknown as VercelRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(302);
    const loc = res.headers['Location'];
    expect(loc).toContain('https://discord.com/oauth2/authorize');
    expect(loc).toContain('client_id=CLIENT123');
    expect(loc).toContain('scope=identify+guilds');
    expect(loc).toContain('state=');
    expect(loc).toContain('redirect_uri=https%3A%2F%2Fqiqirn.tools%2Fapi%2Fauth%2Fcallback');
  });
});
