# Discord Bot Migration to Vercel

## Overview

Migrate the Discord bot from a locally-hosted discord.js gateway process to Vercel serverless functions. The bot, market cache, and web app all run from a single Vercel project with zero infrastructure to manage.

## Architecture

```
                    +-----------------------------+
                    |        Vercel Project        |
                    |                              |
  Discord --------> |  /api/discord.ts             |
  (HTTP POST)       |  +- verify signature         |
                    |  +- /oye -> LLM + tools      |
                    |  +- /craft -> Turso DB       |
                    |  +- /cleanup -> CSV parse    |
                    |  +- /purge -> bulk delete    |
                    |                              |
  External Cron --> |  /api/refresh-cache.ts       |
  (hourly GET)      |  +- fetch Universalis        |
                    |  +- save to Vercel Blob      |
                    |                              |
  Browser --------> |  Vite SPA (React)            |
                    |  +- loads cache from Blob    |
                    |  +- /src/... (unchanged)     |
                    +-----------------------------+
                              |
              +---------------+---------------+
              v               v               v
        Vercel Blob      Turso DB        Groq API
        (market cache)   (craft projects) (LLM)
```

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Vite SPA + `/api` routes | Bot shares `src/lib/` code with frontend; one deploy |
| Discord | HTTP Interactions Endpoint | Serverless-compatible; drop discord.js entirely |
| Chat | `/oye` slash command | Replaces message listening (requires gateway); same Qiqirn personality |
| LLM | Groq only (Llama 4 Scout) | Simplify provider code; free tier |
| Market cache | Vercel Blob | Public stable URL; ~12MB JSON; replaces local disk file |
| Cache refresh | Hourly via external free cron | Free cron service hits `/api/refresh-cache?token=SECRET` |
| Craft DB | Turso (libSQL) via Vercel Marketplace | SQLite-compatible; free tier (9GB); auto-provisions env vars |
| Bot code location | `src/bot/` | Shares root deps; direct imports from `src/lib/` |

## Discord Interactions Endpoint (`/api/discord.ts`)

All Discord interactions arrive as HTTP POSTs. The function:

1. **Verifies the Ed25519 signature** using the app's public key via `discord-interactions`. Rejects invalid signatures with 401.

2. **Handles PING** — Discord sends a PING to validate the endpoint during setup. Respond with `{ type: 1 }`.

3. **Routes by command name and interaction type:**

| Command | Response Strategy |
|---------|------------------|
| `/oye <question>` | Deferred (type 5) + follow-up via REST |
| `/craft new/list/show/close/setup` | Deferred (type 5) + follow-up via REST |
| `/cleanup <csv>` | Deferred (type 5) + follow-up via REST |
| `/purge <amount>` | Immediate (type 4) |
| Button/autocomplete | Routed by `interaction.type` field |

### Deferred Response Pattern

Most commands take longer than Discord's 3-second deadline. The pattern:

1. Respond immediately with `{ type: 5 }` (shows "thinking..." in Discord)
2. Use `waitUntil()` to continue processing after the HTTP response
3. When done, PATCH the result to `/webhooks/{app_id}/{token}/messages/@original`

### Slash Commands Registered

| Command | Options |
|---------|---------|
| `/oye` | `question` (string, required) |
| `/craft new` | `item` (string, autocomplete), `qty` (int), `name` (string, opt), `intermediates` (bool, opt), `ping_role` (role, opt) |
| `/craft list` | (none) |
| `/craft show` | `id` (int) |
| `/craft close` | `id` (int) |
| `/craft setup` | (none) |
| `/cleanup` | `csv` (file) |
| `/purge` | `amount` (int, 1-100, opt) |

### Dependencies

- `discord-interactions` — signature verification only
- Plain `fetch` — Discord REST API calls (no discord.js)

## Market Cache on Vercel Blob

### Upload (refresh function)

```typescript
import { put } from '@vercel/blob';

const cache = { phantom, dc, region, ts: Date.now() };
await put('market-cache.json', JSON.stringify(cache), {
  access: 'public',
  addRandomSuffix: false,
});
```

### Download (frontend)

`loadSharedMarketCache` in `src/lib/universalis.ts` changes from fetching `/data/market-cache.json` to fetching `import.meta.env.VITE_CACHE_BLOB_URL`.

### Cache Refresh (`/api/refresh-cache.ts`)

- Reuses existing batch-fetch logic: 100 items per batch, 8 concurrent workers, 3 scopes (Phantom, Chaos, Europe) in parallel
- Protected by `?token=REFRESH_SECRET` query parameter
- Triggered hourly by an external free cron service (e.g., cron-job.org)
- Returns JSON with status and timing info

### Cleanup

- Remove `public/data/market-cache.json` from the repo
- Add `public/data/market-cache.json` to `.gitignore`

## Craft Projects on Turso

### Migration from better-sqlite3

The craft store switches from local SQLite to hosted Turso (libSQL). The API change is sync to async:

```typescript
// Before (better-sqlite3)
const row = db.prepare('SELECT ...').get(id);

// After (@libsql/client)
const { rows } = await db.execute({ sql: 'SELECT ...', args: [id] });
```

Same schema, same queries, same CREATE IF NOT EXISTS migration pattern.

### Setup

- Install Turso from the Vercel Marketplace (auto-provisions `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`)
- Install `@libsql/client`

## LLM Integration (Groq Only)

Single provider: Groq with `meta-llama/llama-4-scout-17b-16e-instruct`.

### What stays the same

- System prompt (Qiqirn personality, Spanish, 3rd person)
- Tool definitions: `price_check`, `craft_flip_search`, `best_deals`, `vendor_flip_search`
- Tool call loop (max 5 iterations)
- Hallucination guard (force tool use if LLM claims market data without tools)
- Cat GIF easter egg (~15% chance)
- Name index for fuzzy item search

### What's removed

- Anthropic message format adapter
- OpenRouter routing
- Provider selection logic
- `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `CHAT_MODEL` env vars

## File Structure

### New files

```
/api/
  discord.ts              <- Discord interactions endpoint
  refresh-cache.ts        <- Cache refresh (cron-triggered)
/src/bot/
  llm.ts                  <- Groq LLM caller
  tools.ts                <- Tool definitions + executor
  systemPrompt.ts         <- Qiqirn personality
  craftStore.ts           <- Turso-backed craft project DB
  discordApi.ts           <- Deferred response, bulk delete helpers
  nameIndex.ts            <- Item name fuzzy search
```

### Environment variables (Vercel dashboard)

| Var | Purpose |
|-----|---------|
| `DISCORD_APP_ID` | REST API calls |
| `DISCORD_PUBLIC_KEY` | Signature verification |
| `DISCORD_BOT_TOKEN` | REST API auth |
| `GROQ_API_KEY` | LLM provider |
| `TURSO_DATABASE_URL` | Craft DB (auto-set by Marketplace) |
| `TURSO_AUTH_TOKEN` | Craft DB (auto-set by Marketplace) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (auto-set) |
| `VITE_CACHE_BLOB_URL` | Public Blob URL for frontend |
| `REFRESH_SECRET` | Protects the cron endpoint |
| `GUILD_ALLOWLIST` | Restrict to specific Discord servers |

### Old `bot/` directory

Kept for reference but no longer deployed. Can be deleted in a future cleanup.

## What Doesn't Change

- Entire React frontend (`src/features/`, `src/routes/`, `src/components/`)
- Snapshot data (`public/data/snapshots/`)
- All shared lib code (`src/lib/universalis.ts`, `src/lib/recipes.ts`, etc.)
- `vercel.json` SPA rewrite rule
- Existing 921 tests
- Qiqirn personality and behavior

## Frontend Change

Single change: `loadSharedMarketCache` in `src/lib/universalis.ts` fetches from `VITE_CACHE_BLOB_URL` instead of `/data/market-cache.json`.

## Command Registration

Commands are registered via a one-time script using the Discord REST API (`PUT /applications/{app_id}/commands`). This replaces the per-guild registration that discord.js did on startup. The script can live as an npm script (`register-commands`) run manually after changing command definitions.
