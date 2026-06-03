import type { VercelRequest } from '@vercel/node';
import { SignJWT, jwtVerify } from 'jose';

export interface SessionUser {
  sub: string;        // Discord user id
  username: string;   // display name
  avatar: string | null;
  guilds: string[];   // allow-listed guild ids the user belongs to
}

const SESSION_TTL = '7d';

// Distinct audiences so the two token types signed with the same secret can
// never be swapped (a public `state` token must not work as a session cookie).
const SESSION_AUD = 'session';

function secretKey(): Uint8Array {
  const s = process.env.AUTH_SESSION_SECRET;
  if (!s) throw new Error('AUTH_SESSION_SECRET is not set');
  // jose expects a Uint8Array for HMAC keys
  return new TextEncoder().encode(s);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ username: user.username, avatar: user.avatar, guilds: user.guilds })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.sub)
    .setAudience(SESSION_AUD)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ['HS256'],
      audience: SESSION_AUD,
    });
    return {
      sub: String(payload.sub),
      username: String(payload.username ?? ''),
      avatar: (payload.avatar as string | null) ?? null,
      guilds: Array.isArray(payload.guilds) ? (payload.guilds as string[]) : [],
    };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'qiqirn_session';
const STATE_TTL = '10m';
const STATE_AUD = 'state';

export async function signState(returnTo: string): Promise<string> {
  return new SignJWT({ rt: returnTo })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(STATE_AUD)
    .setIssuedAt()
    .setExpirationTime(STATE_TTL)
    .sign(secretKey());
}

export async function verifyState(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ['HS256'],
      audience: STATE_AUD,
    });
    const rt = typeof payload.rt === 'string' ? payload.rt : '/';
    // Only allow same-site relative return paths.
    return rt.startsWith('/') && !rt.startsWith('//') ? rt : '/';
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const jar: Record<string, string> = {};
  if (!header) return jar;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    // decodeURIComponent throws on a malformed escape (e.g. "%E0%A4%A"); fall
    // back to the raw value so a junk cookie can't 500 the auth path.
    if (k) {
      try { jar[k] = decodeURIComponent(v); }
      catch { jar[k] = v; }
    }
  }
  return jar;
}

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // seconds

export function serializeSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function getAllowList(): string[] {
  return (process.env.GUILD_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function allowedGuildsFor(userGuildIds: string[]): string[] {
  const allow = new Set(getAllowList());
  return userGuildIds.filter((id) => allow.has(id));
}

export function getAdminIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function isAdmin(sub: string): boolean {
  return getAdminIds().includes(sub);
}

export async function requireSession(req: VercelRequest): Promise<SessionUser | null> {
  const jar = parseCookies(req.headers?.cookie);
  const token = jar[SESSION_COOKIE];
  if (!token) return null;
  return verifySession(token);
}

/** The OAuth redirect URI — MUST be identical in the login redirect and the
 *  callback token exchange, and must match a URI registered in the Discord app. */
export function oauthRedirectUri(req: VercelRequest): string {
  if (process.env.OAUTH_REDIRECT_URI) return process.env.OAUTH_REDIRECT_URI;
  const host = req.headers?.host ?? 'localhost:3000';
  const proto = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${proto}://${host}/api/auth/callback`;
}
