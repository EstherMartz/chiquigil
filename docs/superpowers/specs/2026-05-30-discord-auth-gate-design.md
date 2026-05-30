# Discord-gated authentication for the web app

**Date:** 2026-05-30
**Status:** Design — approved-in-principle via brainstorming Q&A; pending written-spec review.
**Branch:** `feature/discord-auth-gate`

## Problem

The web app (`qiqirn.tools`, a Vite + React SPA on Vercel) is fully public. We want to
**gate the whole site behind a login**, restricting access to **members of allow-listed
Discord guilds**. Sign-in is via **Discord OAuth2**, which is the natural fit because the
entire existing identity model is already Discord-centric:

- Shared crafting projects/tasks live in a Turso (libSQL) DB keyed by Discord **guild IDs**
  and **user IDs** (`src/bot/craftStore.ts`), surfaced read-only by `src/api/projects.ts`.
- Authorization today is a coarse `GUILD_ALLOWLIST` env var, already consulted by
  `src/api/projects.ts` and `src/api/plugin-claim.ts`.
- A `DISCORD_BOT_TOKEN` is already used server-side to resolve Discord display names.

## Goals

- Require a logged-in session to use the app.
- Only let in users who belong to at least one guild in `GUILD_ALLOWLIST`.
- Keep a friendly public **login page** as the single public surface.
- Reuse existing infra (Discord app, bot token, allow-list, Turso, Vercel serverless).
- Do **not** break the non-browser endpoints that other clients depend on.

## Non-goals (YAGNI)

- No email/password, Google/GitHub, or magic-link login — Discord only.
- No role-based or per-guild **write** features yet (the session is structured so they can
  be added later without re-architecting).
- No managed auth provider (Clerk/Auth0/Supabase) — would add a dependency and a parallel
  identity system while still requiring custom guild-allow-list logic.
- No server-side session store / "log out everywhere" in v1 (noted as a future option).

## Approaches considered

| Approach | Summary | Verdict |
|---|---|---|
| **A. Roll-your-own Discord OAuth + signed cookie** | ~4 small serverless endpoints + a React auth context; callback checks guild membership against `GUILD_ALLOWLIST` and sets a signed httpOnly cookie. | **Chosen** — only option that natively models "allow-listed Discord guild members"; reuses all existing infra; smallest net new surface; single identity model; no per-user cost. |
| **B. Managed provider (Clerk/Auth0/Supabase) w/ Discord social login** | Provider owns login UI + sessions. | Rejected — adds a dependency, dashboard, and possible cost, yet **still** needs custom guild-membership logic. Over-engineered for a single-purpose gate. |
| **C. Vercel platform protection (password / Vercel SSO)** | Zero app code. | Rejected — gates by Vercel-team membership or a shared password, **not** by Discord guild. Cannot express the required allow rule. |

## Architecture (Approach A)

### Security boundary

Because the SPA serves the same `index.html` for every route (`vercel.json` rewrites
`/(.*) → /`), the HTML shell holds no secrets — **the data is the secret, and it lives
behind the API**. Therefore:

- **Hard gate (security):** private browser-facing data endpoints verify the session
  cookie and return `401` without it. This is the real boundary and holds regardless of
  anything client-side.
- **UX gate:** a React route guard + a public `/login` page so users see a clean
  "Sign in with Discord" screen instead of a raw `401`.
- **Optional polish:** a root `middleware.ts` (Vercel routing middleware, framework-
  agnostic, full Node on Fluid Compute) to redirect unauthenticated *navigations* to
  `/login` and avoid serving the shell to anonymous visitors. Not the security boundary;
  the implementation plan should verify it works on a pure-Vite Vercel project early and
  drop it if it proves fiddly.

### Components

**1. Discord application config (no code).**
The Discord app already exists (bot/interactions). Enable OAuth2 and add redirect URIs:
- `https://qiqirn.tools/api/auth/callback` (prod)
- a localhost equivalent for dev (see Local dev below).

New environment variables (Vercel + `.env` for local):
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `AUTH_SESSION_SECRET` — random 32+ byte key for HMAC signing of sessions and `state`.
- (reuse) `GUILD_ALLOWLIST`, `DISCORD_BOT_TOKEN`.

**2. Shared auth helper — `src/api/_auth.ts`.**
- `signSession(payload)` / `verifySession(token)` — HMAC-SHA256 signed compact token
  (JWT via `jose`, or hand-rolled with Web Crypto to avoid a dependency; decided in plan).
- `signState(payload)` / `verifyState(token)` — short-lived signed CSRF/return-to value.
- `readSessionCookie(req)` and `serializeSessionCookie(value, opts)` —
  `HttpOnly; Secure; SameSite=Lax; Path=/`.
- `requireSession(req)` — returns the decoded session or `null` (used by data endpoints).

**3. Auth endpoints — `src/api/auth/*` (bundled via esbuild like the other functions; add to `build:api` and `vercel.json`).**
- `GET /api/auth/login` — build the Discord authorize URL with `scope=identify guilds`
  and a signed `state` (CSRF + return-to path); `302` to Discord.
- `GET /api/auth/callback`:
  1. Verify `state`; reject tampered/expired with `400` → `/login?error=expired`.
  2. Exchange `code` for an access token (`POST https://discord.com/api/oauth2/token`).
  3. Read identity + guild list (the `guilds` scope returns the user's guilds with the
     token; or call `GET /users/@me/guilds`).
  4. Intersect the user's guild IDs with `GUILD_ALLOWLIST`.
     - **Non-empty** → mint session `{ sub, username, avatar, guilds:[allowed], iat, exp }`,
       `Set-Cookie`, `302` back to the return-to path.
     - **Empty** → `302 /login?error=not_authorized`.
- `GET /api/auth/me` — verify cookie; return `{ user }` or `401`.
- `POST /api/auth/logout` — clear the cookie; `302 /login`.

**4. Protect private data endpoints.**
Browser-facing private endpoints (start with `src/api/projects.ts`) call `requireSession`
and `401` when absent — defense-in-depth on top of their existing `GUILD_ALLOWLIST` checks.

**5. SPA integration — `src/features/auth/`.**
- `AuthProvider` (React context): calls `/api/auth/me` on mount; exposes
  `{ user, status: 'loading' | 'authed' | 'anon' }`.
- `Login.tsx` (public route): "Sign in with Discord" → `window.location =
  '/api/auth/login?return=<current path>'`; renders friendly copy for `?error=...` cases
  (esp. `not_authorized`: "ask an admin to add your server to the allow-list").
- `<RequireAuth>` wrapper in `src/App.tsx`: `loading` → splash; `anon` → redirect
  `/login`; `authed` → render the app.
- Header user menu: avatar + display name + "Log out" (POST `/api/auth/logout`).

### Endpoints that stay public / ungated (correctness-critical)

These must remain reachable **without** a browser session — exclude them from any
middleware matcher and do **not** add `requireSession` to them:
- `/login` and all static assets.
- `/api/auth/*`.
- `/api/plugin/*` — Dalamud plugin; keeps its character/guild-allow-list auth.
- `/api/discord` — Discord-interaction endpoint; verified by Discord request signature.
- `/api/refresh-cache` — cron; protected by its own secret.

## Data flow (login)

```
Browser → any private app route
  → (UX) AuthProvider sees status=anon → redirect /login
  → user clicks "Sign in with Discord"
  → GET /api/auth/login  → 302 Discord authorize (scope: identify guilds, signed state)
  → user consents
  → GET /api/auth/callback → verify state → exchange code → fetch identity+guilds
       → intersect with GUILD_ALLOWLIST
         → member:    Set-Cookie session; 302 back to return-to
         → non-member: 302 /login?error=not_authorized
  → app loads → AuthProvider confirms via /api/auth/me → status=authed
```

## Authorization rule

`callback` authorizes iff the user's guild-ID set intersects `GUILD_ALLOWLIST`. The
matching allowed guild IDs are embedded in the session token so later per-guild features
(e.g. writing to projects) can authorize without re-calling Discord.

## Session

Stateless signed JWT in an httpOnly cookie. Suggested ~7-day expiry; `/api/auth/me` may
re-issue when near expiry (sliding session). No DB required.

*Future option (deferred):* a Turso `sessions` table for server-side revocation /
"log out everywhere". The cookie can carry a session id to support this later.

## Error handling

| Condition | Behavior |
|---|---|
| Invalid/expired `state` | `400` → `/login?error=expired`; restart login |
| Discord token exchange fails | `302 /login?error=discord` |
| User in no allow-listed guild | `302 /login?error=not_authorized` (friendly message) |
| Tampered/expired session cookie | Treated as logged-out (redirect / `me` → 401) |
| Missing `DISCORD_CLIENT_ID/SECRET` or `AUTH_SESSION_SECRET` | Endpoints **fail closed** (`500` + server log); gate stays locked |

## Testing (Vitest + Testing Library — already configured)

- **Unit (`_auth.ts`):** sign/verify session (valid, tampered, expired); `state`
  create/verify; cookie parse/serialize; guild-allow-list intersection.
- **Endpoint (`callback`):** mock Discord token + guilds responses — member of an
  allow-listed guild → cookie set + redirect; non-member → `not_authorized` redirect;
  bad `state` → `400`. Follow the mocking pattern in `src/api/projects.test.ts`.
- **SPA:** `AuthProvider` state transitions (loading/authed/anon); `<RequireAuth>`
  redirect; login button target URL.
- **Regression:** assert `/api/plugin/*`, `/api/discord`, `/api/refresh-cache` are not
  gated.

## Local development

Open item for the implementation plan: confirm how `/api/*` runs locally (`vercel dev`
vs the Vite dev proxy) and register a localhost OAuth redirect URI so the full login
round-trip works on a dev machine. The bot already has a `scripts/dev-server.mjs`; the
web's local API story needs to be confirmed and documented.

## Setup / ops checklist (for whoever provisions, i.e. the maintainer)

- [ ] Discord app → OAuth2 → add prod + localhost redirect URIs.
- [ ] Set Vercel env: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `AUTH_SESSION_SECRET`.
- [ ] Confirm `GUILD_ALLOWLIST` is populated in the web project's env.
- [ ] Add the new `api/auth/*` functions to `build:api` (esbuild) and `vercel.json`.

## Open decisions to confirm in the plan

1. `jose` dependency vs hand-rolled Web Crypto HMAC for signing.
2. Include the optional `middleware.ts` shell-block, or rely on API gate + SPA guard only.
3. Include the Turso `sessions` table for revocation in v1, or defer.
4. Which browser-facing endpoints beyond `/api/projects` need `requireSession` now.
