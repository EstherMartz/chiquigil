import { SignJWT, jwtVerify } from 'jose';

export interface SessionUser {
  sub: string;        // Discord user id
  username: string;   // display name
  avatar: string | null;
  guilds: string[];   // allow-listed guild ids the user belongs to
}

const SESSION_TTL = '7d';

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
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
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
