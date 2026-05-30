// src/api/_auth.ts
import { SignJWT, jwtVerify } from "jose";
var SESSION_AUD = "session";
function secretKey() {
  const s = process.env.AUTH_SESSION_SECRET;
  if (!s) throw new Error("AUTH_SESSION_SECRET is not set");
  return new TextEncoder().encode(s);
}
async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      audience: SESSION_AUD
    });
    return {
      sub: String(payload.sub),
      username: String(payload.username ?? ""),
      avatar: payload.avatar ?? null,
      guilds: Array.isArray(payload.guilds) ? payload.guilds : []
    };
  } catch {
    return null;
  }
}
var SESSION_COOKIE = "qiqirn_session";
function parseCookies(header) {
  const jar = {};
  if (!header) return jar;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        jar[k] = decodeURIComponent(v);
      } catch {
        jar[k] = v;
      }
    }
  }
  return jar;
}
var SESSION_MAX_AGE = 7 * 24 * 60 * 60;
async function requireSession(req) {
  const jar = parseCookies(req.headers?.cookie);
  const token = jar[SESSION_COOKIE];
  if (!token) return null;
  return verifySession(token);
}

// src/api/auth/me.ts
async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "no-store");
  const user = await requireSession(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  return res.status(200).json({ user });
}
var config = { api: { bodyParser: false } };
export {
  config,
  handler as default
};
