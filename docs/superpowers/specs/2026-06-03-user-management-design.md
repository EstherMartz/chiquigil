# Access Roster + Per-User Access Control

**Date:** 2026-06-03
**Status:** Approved (design)
**Branch:** TBD (feature branch off `main`)

## Problem

Today the app has no concept of a "user." Login is Discord OAuth (`identify guilds`
scope) and authorization is purely guild-membership: if the user belongs to any
guild listed in the `GUILD_ALLOWLIST` env var they are admitted, otherwise rejected.
Sessions are stateless 7-day JWTs that never touch the database. There is no record
of who has logged in, no way to see who has access, and no way to grant or revoke an
individual without editing an env var in Vercel.

The owner wants two things:

1. **See who has access** — a roster of everyone who can use the app.
2. **Control access per-user** — grant or revoke specific Discord users individually,
   without editing env vars.

Explicitly out of scope (declined during brainstorming): a roles system with a
managed-admins UI, editing users' stored data on their behalf, pre-inviting people who
have never logged in, and enumerating full guild membership via the bot token.

## Decisions

- **Roster = people who have logged in.** Each user is recorded the first time they
  authenticate; the roster is everyone who has actually used the app.
- **Admin gating via env var.** An `ADMIN_USER_IDS` env var (comma-separated Discord
  IDs) decides who may open the admin panel. No managed-admins UI.
- **Three-state per-user access override:** `default` (follow the guild rule), `allow`
  (always admitted, even if their guild is later removed from `GUILD_ALLOWLIST`), or
  `block` (never admitted). This covers both grant and revoke and survives later edits
  to the guild allow-list.
- **Revoke timing:** a block takes effect on the user's next `/api/auth/me` poll —
  i.e. their next page load / SPA mount. Already-open tabs keep working until reload.
  Full per-request DB enforcement is deliberately out of scope.

## Constraint

The project is at the 12-function Vercel Hobby cap. No new API file may be added; the
admin endpoints fold into the existing `api/auth` handler.

## Data model

New table `app_users`, added to the `CREATE TABLE IF NOT EXISTS` schema block in
`openCraftStore` (alongside `projects` / `tasks`). No migration tooling needed — it
appears on next store open, matching the existing pattern.

| column       | type              | meaning                                          |
|--------------|-------------------|--------------------------------------------------|
| `discord_id` | TEXT PRIMARY KEY  | the user                                         |
| `username`   | TEXT NOT NULL     | last-seen display name                           |
| `avatar`     | TEXT (null)       | Discord avatar hash                              |
| `guilds`     | TEXT (JSON)       | allow-listed guilds they belonged to at login    |
| `access`     | TEXT NOT NULL DEFAULT 'default' | `'default' \| 'allow' \| 'block'`  |
| `first_seen` | INTEGER NOT NULL  | first login (epoch ms)                           |
| `last_seen`  | INTEGER NOT NULL  | most recent login (epoch ms)                     |

## Components

### `src/api/_access.ts` — access decision (pure, testable)

Single source of truth for "is this user allowed?":

```ts
export type AccessLevel = 'default' | 'allow' | 'block';

export function decideAccess(input: {
  guildAllowed: boolean;
  access: AccessLevel | null; // null = no record yet
}): boolean;
```

- `block` → `false`
- `allow` → `true`
- `default` / `null` → `guildAllowed`

Called by both the login callback and `/api/auth/me`. Unit-tested across all 6
combinations (3 access states × in-guild / not).

### Store (`src/bot/craftStore.ts`)

Add `app_users` to the schema and extend the `CraftStore` interface:

- `upsertAppUser(u: { discordId; username; avatar; guilds: string[] }): Promise<void>`
  — inserts or updates; sets `first_seen` on insert only, always bumps `last_seen`,
  preserves the existing `access` value on update.
- `listAppUsers(): Promise<AppUser[]>`
- `getAppUser(discordId: string): Promise<AppUser | null>`
- `setUserAccess(discordId: string, access: AccessLevel): Promise<void>`

### Auth handler (`src/api/_auth.ts` source compiled to `api/auth.mjs`)

- **`isAdmin(sub: string): boolean`** — `(ADMIN_USER_IDS ?? '').split(',')` contains
  `sub`. Mirrors the existing `getAllowList` helper.
- **Callback (`handler2`)**: after Discord auth, compute `guildAllowed` (existing
  `allowedGuildsFor` logic), load the `app_users` record, run `decideAccess`. Reject
  to `/login?error=not_authorized` if denied. On success, `upsertAppUser(...)` then
  issue the session cookie as today. A user admitted purely via an `allow` override
  with no allow-listed guilds gets `guilds: []` in their session (guild-scoped
  features simply show nothing for them — acceptable edge case).
- **`/api/auth/me` (`handler3`)**: after verifying the JWT, load the record and
  re-run `decideAccess`; if now blocked, return 401 (SPA drops to anon → redirect to
  login → login rejects). Also return `isAdmin` in the payload, computed live from the
  env var (not stored in the JWT, so env changes take effect without re-login).
- **Admin routes** dispatched inside the existing `handler5` path switch, each guarded
  by `requireSession` + `isAdmin` (401 if anon, 403 if authed-but-not-admin):
  - `GET  /api/auth/admin/users` → `{ users: AppUser[] }`
  - `POST /api/auth/admin/access` → body `{ discordId: string; access: AccessLevel }`
    → `setUserAccess`, returns `{ ok: true }`. Body is read manually from the raw
    request stream (the handler runs with `bodyParser: false`), matching the existing
    plugin handlers.

### `vercel.json`

Add one rewrite so multi-segment admin paths reach the auth function:

```json
{ "source": "/api/auth/admin/(.*)", "destination": "/api/auth" }
```

(The existing single-segment `/api/auth/:action` rewrite stays for login/callback/me/logout.)

### Frontend

- **`AuthUser`** (`AuthProvider.tsx`) gains `isAdmin: boolean`.
- **`RequireAdmin`** (`src/features/auth/RequireAdmin.tsx`) — mirrors `RequireAuth`;
  while `loading` shows the spinner, when `anon` redirects to `/login`, when authed
  but `!isAdmin` redirects to `/dashboard`.
- **Admin page** (`src/routes/Admin.tsx`, route `/admin` wrapped in `RequireAdmin`) —
  a roster table built with the established `ResultTableScaffold` / `SortableHeader`
  idioms: avatar, name, Discord ID, first seen, last seen, guilds, and a per-row
  access control (`default` / `allow` / `block` segmented control or select) that
  POSTs to `/api/auth/admin/access` and optimistically updates the row.
- **`UserMenu`** shows an **Admin** link only when `isAdmin`.
- Register `/admin` in `App.tsx` and add its title to `PAGE_TITLES`.

## Data flow

1. User logs in → callback computes guild eligibility + access override → `decideAccess`
   → on pass, `upsertAppUser` records/refreshes the row and the session cookie is set.
2. SPA mounts → `AuthProvider` polls `/api/auth/me` → JWT verified + `decideAccess`
   re-checked → returns `{ user, isAdmin }` or 401.
3. Admin opens `/admin` → `RequireAdmin` confirms `isAdmin` → page fetches
   `GET /api/auth/admin/users` → renders roster.
4. Admin changes a user's access → `POST /api/auth/admin/access` → `setUserAccess`.
5. The affected user's next `me` poll (next reload) re-runs `decideAccess`; a `block`
   now denies them.

## Error handling

- Anon hitting an admin route → 401. Authed non-admin → 403. Frontend `RequireAdmin`
  redirects rather than rendering the page, so the API guard is defense-in-depth.
- Malformed POST body → 400.
- A blocked user's existing JWT remains cryptographically valid but is rejected by
  `me`; the cookie is cleared on the subsequent login rejection / explicit logout.
- Store failures bubble as 500 from the handler (consistent with existing endpoints).

## Testing

- **`_access.ts`**: table test over all 6 `decideAccess` combinations.
- **Store**: `app_users` upsert (insert sets `first_seen`; update preserves `access`,
  bumps `last_seen`), `listAppUsers`, `setUserAccess` against in-memory libsql.
- **Auth handler**: admin routes 401 (anon) / 403 (non-admin) / 200 (admin); `me`
  returns 401 for a blocked user and `isAdmin` correctly; callback blocks a `block`
  user and admits an `allow`-override user with no allow-listed guild.
- **Frontend**: `RequireAdmin` redirect cases; Admin page renders the roster and fires
  an access change, using `__TestAuthProvider` to inject `isAdmin`.

## Out of scope

- Managed-admins UI / general roles system.
- Pre-inviting users who have never logged in.
- Enumerating full guild membership via the bot token.
- Per-request DB session enforcement (kicking open tabs mid-session).
- Editing users' stored data (settings, watchlists, projects) on their behalf.
