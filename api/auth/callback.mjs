// src/api/_auth.ts
import { SignJWT, jwtVerify } from "jose";
var SESSION_TTL = "7d";
var SESSION_AUD = "session";
function secretKey() {
  const s = process.env.AUTH_SESSION_SECRET;
  if (!s) throw new Error("AUTH_SESSION_SECRET is not set");
  return new TextEncoder().encode(s);
}
async function signSession(user) {
  return new SignJWT({ username: user.username, avatar: user.avatar, guilds: user.guilds }).setProtectedHeader({ alg: "HS256" }).setSubject(user.sub).setAudience(SESSION_AUD).setIssuedAt().setExpirationTime(SESSION_TTL).sign(secretKey());
}
var SESSION_COOKIE = "qiqirn_session";
var STATE_AUD = "state";
async function verifyState(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      audience: STATE_AUD
    });
    const rt = typeof payload.rt === "string" ? payload.rt : "/";
    return rt.startsWith("/") && !rt.startsWith("//") ? rt : "/";
  } catch {
    return null;
  }
}
var SESSION_MAX_AGE = 7 * 24 * 60 * 60;
function serializeSessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}
function getAllowList() {
  return (process.env.GUILD_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
function allowedGuildsFor(userGuildIds) {
  const allow = new Set(getAllowList());
  return userGuildIds.filter((id) => allow.has(id));
}
function oauthRedirectUri(req) {
  if (process.env.OAUTH_REDIRECT_URI) return process.env.OAUTH_REDIRECT_URI;
  const host = req.headers?.host ?? "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${proto}://${host}/api/auth/callback`;
}

// src/api/auth/callback.ts
function redirect(res, location) {
  res.setHeader("Location", location);
  return res.status(302).end();
}
async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const code = req.query?.code;
  const stateToken = req.query?.state;
  if (!code || !stateToken) return redirect(res, "/login?error=expired");
  const returnTo = await verifyState(stateToken);
  if (returnTo === null) return redirect(res, "/login?error=expired");
  let accessToken;
  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID ?? "",
        client_secret: process.env.DISCORD_CLIENT_SECRET ?? "",
        grant_type: "authorization_code",
        code,
        redirect_uri: oauthRedirectUri(req)
      })
    });
    if (!tokenRes.ok) return redirect(res, "/login?error=discord");
    const tok = await tokenRes.json();
    if (!tok.access_token) return redirect(res, "/login?error=discord");
    accessToken = tok.access_token;
  } catch {
    return redirect(res, "/login?error=discord");
  }
  try {
    const auth = { headers: { Authorization: `Bearer ${accessToken}` } };
    const [meRes, guildsRes] = [
      await fetch("https://discord.com/api/users/@me", auth),
      await fetch("https://discord.com/api/users/@me/guilds", auth)
    ];
    if (!meRes.ok || !guildsRes.ok) return redirect(res, "/login?error=discord");
    const me = await meRes.json();
    const guilds = await guildsRes.json();
    const allowed = allowedGuildsFor(guilds.map((g) => g.id));
    if (allowed.length === 0) return redirect(res, "/login?error=not_authorized");
    const token = await signSession({
      sub: me.id,
      username: me.global_name ?? me.username ?? me.id,
      avatar: me.avatar ?? null,
      guilds: allowed
    });
    res.setHeader("Set-Cookie", serializeSessionCookie(token));
    return redirect(res, returnTo || "/");
  } catch {
    return redirect(res, "/login?error=discord");
  }
}
var config = { api: { bodyParser: false } };
export {
  config,
  handler as default
};
