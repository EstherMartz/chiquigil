// src/api/_auth.ts
import { SignJWT, jwtVerify } from "jose";
function secretKey() {
  const s = process.env.AUTH_SESSION_SECRET;
  if (!s) throw new Error("AUTH_SESSION_SECRET is not set");
  return new TextEncoder().encode(s);
}
var STATE_TTL = "10m";
var STATE_AUD = "state";
async function signState(returnTo) {
  return new SignJWT({ rt: returnTo }).setProtectedHeader({ alg: "HS256" }).setAudience(STATE_AUD).setIssuedAt().setExpirationTime(STATE_TTL).sign(secretKey());
}
var SESSION_MAX_AGE = 7 * 24 * 60 * 60;
function oauthRedirectUri(req) {
  if (process.env.OAUTH_REDIRECT_URI) return process.env.OAUTH_REDIRECT_URI;
  const host = req.headers?.host ?? "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${proto}://${host}/api/auth/callback`;
}

// src/api/auth/login.ts
async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const returnTo = req.query?.return ?? "/";
  const state = await signState(returnTo);
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? "",
    redirect_uri: oauthRedirectUri(req),
    response_type: "code",
    scope: "identify guilds",
    state,
    prompt: "none"
  });
  res.setHeader("Location", `https://discord.com/oauth2/authorize?${params.toString()}`);
  return res.status(302).end();
}
var config = { api: { bodyParser: false } };
export {
  config,
  handler as default
};
