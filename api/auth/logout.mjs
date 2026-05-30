// src/api/_auth.ts
import { SignJWT, jwtVerify } from "jose";
var SESSION_COOKIE = "qiqirn_session";
var SESSION_MAX_AGE = 7 * 24 * 60 * 60;
function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// src/api/auth/logout.ts
async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.setHeader("Location", "/login");
  return res.status(302).end();
}
var config = { api: { bodyParser: false } };
export {
  config,
  handler as default
};
