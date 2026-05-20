# Bot Interactive Buttons + Per-CSV Cache — Design

**Status:** Spec (pre-plan). Phase 1 of a longer bot-direction sequence (see "What's deferred").

## Goal

Turn the Marie Kondo cleanup reply from a static dump into a navigable view. After uploading a CSV, the user can click buttons under the embed to expand any of the truncated bucket lists, or re-run the analysis against fresh Universalis prices without re-uploading.

## Non-goals

- No slash commands (`/price`, `/uses`, `/craft`). Those become straightforward once the per-user cache exists, but each warrants its own spec.
- No web ↔ bot link sharing. Separate phase, builds on this one.
- No new compute (no desynth bucket, no cross-DC selling). The cleanup pipeline is untouched; this phase is bot-side UX only.
- No persistent state across bot restarts. Cache is process-memory. A Fly.io redeploy clears every session; users re-paste.
- No public/shared drill-downs. Every interactive response is ephemeral to the original CSV uploader. FC channels don't get spammed with other people's gil totals.
- No pagination of drill-downs. Each "show all" reply truncates to a sane cap (see UI section) — anyone needing more uses `cleanup.md`.

## User flow

1. User drops CSV in an allowlisted guild. Bot greets and processes as today (`bot/src/index.ts` + `handleCsv.ts`).
2. Reply now includes a row of 4 buttons under the embeds:
   - `🔨 Todas las recetas (N)` — disabled if `result.craft.length === 0`.
   - `🛒 Todo el Mercado (N)` — disabled if `result.sellMb.length === 0`.
   - `🗑️ Vendedor & Descartar (N)` — disabled if `result.vendor.length + result.discard.length === 0`.
   - `🔄 Refrescar precios` — always enabled.
3. Bot stores the parsed CSV + cleanup result in an in-memory cache keyed by `msg.author.id`, with a sliding 30-min TTL.
4. Clicking a list-expansion button → bot replies *ephemerally* (only the clicker sees it) with a longer embed for that bucket. Original message is untouched. Multiple drill-downs stack as separate ephemeral messages in the user's view.
5. Clicking `🔄 Refrescar precios` → bot re-fetches Universalis for the cached `marketIds` set, re-runs `runCleanup` + `findInventoryUses`, and replies ephemerally with a fresh overview embed + the same 4 buttons (new `customId`s, new cache entry replacing the old one).
6. Cache miss (TTL expired, bot restart, soft-cap eviction) → bot replies ephemerally with a single Marie Kondo line: *"Tu inventario ya descansa en paz ✨ Súbelo otra vez si quieres seguir ordenando."* The button is not auto-disabled (no message-edit on expiry); discovery happens on click.

## Architecture

New module surface, all bot-side. No changes to `src/features/cleanup/` and no schema changes.

### Module layout

- `bot/src/cleanupCache.ts` — `Map<userId, CachedCleanup>` with sliding TTL + LRU soft cap. Pure: `set`, `get` (refreshes TTL), `evictExpired`. Tested with fake clock.
- `bot/src/buttons.ts` — builds `ActionRowBuilder<ButtonBuilder>` from a `CleanupResult`. Two builders:
  - `buildOverviewButtons(ownerId, cacheId, result)` — the 4-button row under the main reply.
  - `customId` encoding/decoding helpers (`encodeCustomId({ ownerId, cacheId, action })` → string, `decodeCustomId(s)` → struct or null).
- `bot/src/formatDiscord.ts` — extend with three new "expanded bucket" formatters:
  - `formatExpandedCraftReply(result, usesByItemId)` → `EmbedBuilder[]` (no cap of 12; 25 fields per embed — Discord's hard limit — up to 3 embeds).
  - `formatExpandedSellReply(result)` → same shape, 25 fields/embed, up to 3 embeds.
  - `formatExpandedVendorDiscardReply(result)` → same. Vendor and discard share one expansion view (they share an embed today).
  - The existing `formatCleanupReply` keeps current truncation (top 12 inline) and just gains the buttons via `buildOverviewButtons`.
- `bot/src/interactions.ts` — `Events.InteractionCreate` handler. Decodes `customId`, verifies ownership, looks up cache, dispatches to the right formatter or to the refresh path.
- `bot/src/index.ts` — wire the new interaction handler + register the cache singleton + pass cache into `MessageCreate` handler.

Tests live next to each module per repo convention (`*.test.ts`).

### Cache shape

```typescript
interface CachedCleanup {
  ownerId: string;          // Discord user ID
  cacheId: string;          // short random nonce, embedded in customIds
  csv: string;              // raw CSV (kept so refresh re-parses cleanly)
  parsed: ParseResult;      // return type of parseAllaganInventory (not exported today — exporting is part of phase 1)
  marketIds: number[];      // ids fed to fetchMarketForOutputs (kept for refresh)
  result: CleanupResult;
  usesByItemId: Map<number, UsesEntry[]>;
  createdAt: number;
  lastTouchedAt: number;    // sliding TTL anchor
}
```

`cacheId` exists so that a refreshed cleanup replaces the previous one *for that user* while still rejecting clicks on the stale buttons — the old buttons embed the old `cacheId`, which no longer matches. Avoids the "user refreshed, then clicked a stale button from the original message" footgun.

### `customId` format

```
cleanup:<cacheId>:<ownerId>:<action>
```

- `action ∈ { 'craft', 'sell', 'vendor', 'refresh' }`.
- Discord's `customId` limit is 100 chars; a 12-char `cacheId` + 18-char Discord ID + short action fits easily.
- The `ownerId` is redundant with what's in the cache, but encoding it in the `customId` lets the handler reject mismatched clicks *before* a cache lookup, including after the entry was evicted. Mismatch → ephemeral reply: *"Este botón pertenece a otro inventario ✨"*.

### TTL & eviction

- TTL: 30 minutes from last touch. Any `get()` that returns a hit also bumps `lastTouchedAt`. A button click counts as a touch; a refresh both touches the old entry and inserts the replacement (under a new `cacheId`).
- Soft cap: 100 entries. On insertion past the cap, evict the entry with the oldest `lastTouchedAt`.
- Periodic sweep: a 5-minute `setInterval` that runs `evictExpired()`. Cheap; matters mostly so the soft cap doesn't fill with dead entries.
- No persistence. A Fly.io redeploy or crash wipes the cache. Documented in non-goals.

### Concurrency model

The cache is a plain `Map` accessed from the single Node event loop — no locking needed. Two users uploading simultaneously each occupy their own slot (keyed by `msg.author.id`). A single user uploading twice in fast succession: the second upload overwrites their slot, the first message's buttons become stale (their `cacheId` no longer matches the live entry), and clicks on them get the "este botón pertenece a otro inventario" reply. Acceptable — re-uploading semantically means "start over."

### Universalis cooldown interaction

`fetchMarketForOutputs` already shares the global Universalis client cooldown (`90e0e7e`). Concurrent refreshes from multiple users serialize at the rate limiter as they do today. The refresh path explicitly does not narrow the `marketIds` set — we re-fetch the same superset the first run used, so price drift is captured uniformly. Refresh latency will feel like an upload (5–15s) and the bot triggers `sendTyping` on the followup so the user knows it's working.

## Button row construction

The same row attaches to both:
- The original message reply (`formatCleanupReply`).
- The refreshed-overview ephemeral reply (when `🔄 Refrescar precios` fires).

Per-button rules:

| Action | Enabled when | Counter shown |
|---|---|---|
| `craft` | `result.craft.length > 0` | full count |
| `sell` | `result.sellMb.length > 0` | full count |
| `vendor` | `result.vendor.length + result.discard.length > 0` | combined count |
| `refresh` | always | n/a |

Discord limits 5 buttons per row, so we have headroom if a 5th button (e.g., "Open in web") gets added later.

## Expanded-bucket formatters

The current inline embeds cap each bucket at 12 rows. The expanded formatters use 25 fields per embed (Discord's hard limit) and emit up to 3 embeds per click, giving a ceiling of 75 rows per drill-down. Beyond that, the trailing embed shows a footer pointing to `cleanup.md`.

Per-row content stays identical to today (same `rowLabel`, same `craftAlt` for runner-up suggestions). Only the slice depth and embed count change.

**One semantic divergence from the inline embeds:** the expanded "Vendedor & Descartar" view splits the embed into two sections — first all vendor rows with `g/ud · total` lines, then all discard rows with the `gracias por tu servicio` line. The inline collapse remains as today.

## Refresh path

```
1. interaction.deferReply({ ephemeral: true })
2. lookup cache by interaction.user.id
3. miss → editReply with the cache-miss message; return
4. hit → fetchMarketForOutputs(cached.marketIds, cfg)
5. run findCraftOpportunities → runCleanup → findInventoryUses (same as handleCsv)
6. evict old entry by cacheId; insert new entry with fresh cacheId
7. editReply with formatCleanupReply output (embeds + new buttons)
```

The cleanup.md attachment **is regenerated and reattached** on refresh — it's part of `formatCleanupReply`'s contract today and there's no value in branching it. Users get a fresh markdown export every refresh, which is also useful.

## Ownership check

In `interactions.ts`:

```typescript
const decoded = decodeCustomId(interaction.customId);
if (!decoded) return; // not ours
if (decoded.ownerId !== interaction.user.id) {
  await interaction.reply({
    content: 'Este botón pertenece a otro inventario ✨',
    ephemeral: true,
  });
  return;
}
```

This runs *before* the cache lookup, so ownership check works even for evicted entries and prevents cross-user inventory peeking via button-click spoofing.

## Testing strategy

- `cleanupCache.test.ts` — set/get refreshes TTL, get of expired returns null, LRU eviction at cap, fake-clock-driven `evictExpired`.
- `buttons.test.ts` — `customId` round-trips, button disabled state matches bucket emptiness, counter labels.
- `formatDiscord.test.ts` — extended with assertions on the three expansion formatters: row counts, embed splits, footer on overflow.
- `interactions.test.ts` — owner mismatch path, cache miss path, refresh path with mocked `fetchMarketForOutputs`. The Discord interaction object gets mocked at the boundary; we don't pull in `discord.js` test harnesses.

Bot test suite stays small (currently ~zero — bot has no tests today). Target ~15–20 new tests in this phase. The web `src/features/cleanup/` test count is unaffected.

## What's deferred

- **Web link sharing** — "Open in web" button slot. Needs a token scheme + a web ingest route. Separate spec.
- **Slash commands** — `/price`, `/uses`, `/craft <item>`. Each takes the cache + snapshots as inputs; they're additive once interactions infrastructure exists. Separate spec(s).
- **Desynthesis / aetherial reduction bucket** — compute-layer change shared with the web view. Separate spec.
- **Cross-DC selling for cleanup.** Out of scope; cleanup is by definition a home-world activity.
- **Persistent cache** (SQLite/Redis). Only if process-memory churn becomes a felt problem.
- **Pagination for drill-downs past 75 rows.** Footer points to `cleanup.md` instead.
- **Auto-disable buttons on cache expiry.** Would require message edits, doubles bot/Discord traffic, and provides little win over the cache-miss ephemeral reply.

## Implementation phase estimate

5–6 task blocks:

1. `cleanupCache.ts` + tests (TDD-friendly, pure).
2. `buttons.ts` + `customId` helpers + tests.
3. `formatDiscord.ts` extensions (3 expansion formatters) + tests.
4. `interactions.ts` handler (owner check, dispatch, refresh path) + tests.
5. `index.ts` wiring (register cache, register interaction handler, pass through to `MessageCreate`).
6. Manual smoke test against a real Discord guild with a sample CSV.

Phases 1–4 are pure / mockable. Phase 5 is wiring. Phase 6 is the only non-CI verification step.

## Open questions

None blocking. Decisions locked in via the brainstorm:

- Drill-down interaction model: ephemeral followup (option A from brainstorm).
- Button set: 4 buttons — 3 list expansions + refresh. No "open in web" until phase 2.
- Cache key: Discord `userId`. Cache invalidator: `cacheId` nonce.
- TTL: 30-min sliding. Soft cap: 100 entries, LRU.
- Drill-down cap: 75 rows (25 × 3 embeds). Overflow → footer pointing to `cleanup.md`.
- Refresh regenerates `cleanup.md`.
- Stale-button (after refresh or eviction) reply: *"Este botón pertenece a otro inventario ✨"* for owner-mismatch; *"Tu inventario ya descansa en paz ✨ Súbelo otra vez si quieres seguir ordenando."* for cache-miss.

If anything in this spec surprises during implementation (e.g., Discord ephemeral message limits behave differently with embeds + attachments), the implementer reports DONE_WITH_CONCERNS rather than improvising.
