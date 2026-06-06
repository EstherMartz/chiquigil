# Crafting List Helper (Teamcraft-Inspired) — Part 1: Web App

**Date:** 2026-06-06
**Status:** Design — awaiting review
**Scope:** Web app only. The in-game plugin (Part 2) is a separate spec→plan→build cycle; this spec ships the export contract Part 2 will consume.

## Overview

A Teamcraft-style crafting-list builder for the web app: search the item DB, check items into a tray, save a named list, then open it to see every ingredient resolved by source (crafted / gathered / vendor / crystal …) with quantities and "what it feeds into" — **no node timers, just the item information**.

This reuses the existing recipe-resolution engine and insight-page UI primitives. It is mostly assembly, not new machinery.

### Decisions locked during brainstorming

- **Web first, plugin later.** Part 1 = builder + saved lists + resolved detail view + exports. Part 2 (plugin) is deferred to its own cycle.
- **Server-stored lists (Turso).** Persist across devices, real shareable URLs, future-proof for live plugin sync. CRUD folds into the existing authed `/api/projects` lambda — **no new lambda** (12-lambda Vercel Hobby cap).
- **Client-side resolution.** The detail view resolves the breakdown in-browser using the cached snapshots and the existing `explode()`/survey code (the same path Craft Helper uses) — instant, no breakdown lambda hit.
- **Coexist with Craft Helper.** Craft Lists is the saveable, multi-list successor to the existing ephemeral Craft Helper (`/shopping-list`). Both remain for now; a future unification is out of scope.

## Goals / Non-goals

**Goals**
- Search items and compose a multi-item list with per-item quantities (and optional HQ flag).
- Save, list, edit, and delete named lists, server-side, keyed by the owner's Discord identity.
- Open a list to a resolved breakdown: Final Items, Sub-crafts by depth, Gathered (incl. Timed Gather), Vendor/Monster/Other, Crystals — each row showing source tag, required qty, recipe level + job, and "used to craft".
- Two presentations of the detail: **Sections** (collapsible, grouped) and **Table** (flat, filterable, sortable).
- Export a list as a plugin paste-code (`qq:list:v1:…`) and as plain text.
- Clean shareable URL per list (`/craft-lists/:id`).

**Non-goals (Part 1)**
- Node timers / ephemeral-node scheduling.
- Autocraft / macro injection.
- Retainer restock integration.
- Inventory counts, Remaining (Required − Inventory), and green/yellow/red color-coding — these require in-game memory and live in the plugin (Part 2).
- Live plugin sync (plugin pulls lists from the server) — Part 2 / later.
- Premade/community lists.
- Food/medicine/solver settings.

## Architecture

### Routes (react-router-dom v7, added in `src/App.tsx`)

| Route | Component | Purpose |
|---|---|---|
| `/craft-lists` | `CraftLists` (builder) | Search + checkbox tray + "Create list from selection" |
| `/craft-lists/saved` | `YourLists` | All saved lists (name, counts, modified; open/delete) |
| `/craft-lists/:id` | `ListDetail` | Resolved breakdown with Sections \| Table toggle |

Static `saved` route is declared before the dynamic `:id` route. Add titles to `PAGE_TITLES`. Add nav entry `{ label: 'Craft Lists', path: '/craft-lists' }` to the **Planning** group in `src/components/layout/Sidebar.tsx`.

### Server storage (new tables in Turso, via `src/bot/craftStore.ts`)

```sql
lists (
  id          TEXT PRIMARY KEY,        -- short random base62 id, used in URLs
  owner_id    TEXT NOT NULL,           -- discord_id of creator
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
)

list_items (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id   TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  item_id   INTEGER NOT NULL,
  item_name TEXT NOT NULL,             -- denormalized for name-stable display/export
  qty       INTEGER NOT NULL,
  is_hq     INTEGER NOT NULL DEFAULT 0,
  position  INTEGER NOT NULL DEFAULT 0 -- preserves builder order
)
```

Deliberately separate from the `projects`/`tasks`/`project_items` tables, which carry guild/channel/Discord-thread/task-collaboration baggage a personal crafting list does not need. This mirrors the spec's `List`/`ListItem` model exactly.

New `CraftStore` methods (added to the existing interface in `src/bot/craftStore.ts`):

```ts
createList(ownerId: string, name: string, items: NewListItem[]): Promise<string>   // returns id
getList(id: string): Promise<StoredList | null>                                     // includes items
listListsForOwner(ownerId: string): Promise<ListSummary[]>                          // name, counts, updatedAt
updateListMeta(id: string, ownerId: string, name: string): Promise<boolean>
replaceListItems(id: string, ownerId: string, items: NewListItem[]): Promise<boolean>
deleteList(id: string, ownerId: string): Promise<boolean>
```

Mutations take `ownerId` and verify ownership (write/delete are owner-only). `listLists*` and `getList` allow any authenticated user to read by id (the whole app is behind the Discord auth gate, so "shareable" means community-shareable).

### API (folded into the existing `api/projects.mjs` lambda — NO new lambda)

`src/api/projects.ts` already authenticates via the `qiqirn_session` cookie (Discord OAuth) and resolves the calling user. Add list routes to its router:

| Method + path | Action | Auth |
|---|---|---|
| `GET /api/lists` | list summaries for the authed user | session |
| `POST /api/lists` | create from `{ name, items[] }` → `{ id }` | session |
| `GET /api/lists/:id` | full list (meta + items) | session (any authed user) |
| `PUT /api/lists/:id` | update name and/or items (owner-only) | session |
| `DELETE /api/lists/:id` | delete (owner-only) | session |

Routing detail: `vercel.json` maps the function; the handler dispatches on `req.url`. Add `/api/lists*` to the same function entry as `/api/projects*` so it stays one lambda. (Confirm during planning whether `vercel.json` needs an added route mapping to the existing function or whether the existing rewrite already covers it.)

Core list logic lives in a new `src/api/_lists-core.ts` (mirroring `_projects-core.ts`) and is imported by the `projects` handler — keeping the lambda thin.

### Client-side resolution

Reuse the established client resolution path (the one Craft Helper uses): snapshots from `recipeCache` (IndexedDB) + react-query, fed to the existing `explode()` and the survey/classification in `src/features/shoppingList/shoppingListSurvey.ts`.

Three additions on top of the existing engine, in a new `src/features/craftLists/resolveList.ts`:

1. **Depth + parent edges.** `explode()` tracks depth internally but does not emit it, and does not track which final item a node descends from. Add an **opt-in** to `explode()` (e.g. `opts.trackProvenance`) that records, per resolved item, its minimum craft depth and the set of root final-item ids it feeds. Preferred over duplicating the recursion. (If touching `explode()` proves risky, fall back to a thin wrapper traversal in `resolveList.ts` — decided during planning.)
2. **Crystal bucketing.** Shards/crystals/clusters currently classify as "market". Detect them by item category (UI category / known crystal id range) and route them to a dedicated **Crystals** group.
3. **List-level aggregation.** Sum required quantities per item across all final items; collect the "feeds" (used-to-craft) parent set per item; bucket each resolved item into a section.

Output shape (the spec's `ResolvedIngredient`, plus grouping):

```ts
interface ResolvedIngredient {
  itemId: number;
  itemName: string;
  requiredQty: number;
  source: 'Crafted' | 'Gathered' | 'TimedGather' | 'Vendor' | 'MonsterDrop' | 'Tome' | 'Crystal';
  craftedByJob?: string;   // crafter code
  recipeLevel?: number;
  usedToCraft: string[];   // names of parent final items (list-scoped)
  depth?: number;          // sub-craft nesting level (Crafted only)
  canHq?: boolean;
}

interface ResolvedList {
  finalItems: { itemId; itemName; qty; isHq; job?; recipeLevel?; stars? }[];
  subCraftsByDepth: Map<number, ResolvedIngredient[]>;  // 1, 2, …
  gathered: ResolvedIngredient[];   // includes TimedGather (flagged by source)
  otherAcquired: ResolvedIngredient[];  // Vendor / MonsterDrop / Tome / Other
  crystals: ResolvedIngredient[];
}
```

**Source-tag mapping** (from existing classification): gathering catalog → `Gathered` (with `timed` flag → `TimedGather`); specialShop → `Tome`; vendorMap → `Vendor`; has-recipe → `Crafted`; crystal category → `Crystal`; everything else (unclassified leaves, incl. mob drops) → `MonsterDrop`/Other bucket. Monster drops are not positively identified in the data — they land in the "Other" bucket; acceptable for v1 and matches the spec's "Vendor / Monster Drop / Other" grouping.

## UI

Reuses: `SectionHeader`, `ResultTableScaffold` + `EmptyResults`, `ItemNameLinks`, `FilterBar` pattern, segmented view-toggle (per `ProjectDetail`), `crafterBeadClass`, `HqStar`, button styles (`btnPrimary`/`btnSecondary`/`btnDanger`/`btnGhost`), density toggle, and the design tokens in `tailwind.config.ts`. World/DC via `useSettingsStore()` for any market-relevant display.

### Builder — `/craft-lists` (mockup p3)

- Search input (debounced, ≥2 chars) over the item snapshot. Results are **bounded** (cap ~50 rows; show "N matches — refine to narrow" when capped) to honor the no-infinite-stacking preference while keeping Teamcraft's check-to-add flow.
- Each result row: item icon, name (`ItemNameLinks`), item/recipe level, job icon, ★ rating, inline qty stepper (default 1), checkbox.
- **"Select all results"** shortcut.
- **Selected tray** (pinned at top): chips for each checked item with qty steppers and `×` remove; **Clear all**; **"Create list from selection →"** (prompts for a name, POSTs, redirects to the new list's detail).
- Header links: **New list** (clears selection) · **All lists** (→ `/craft-lists/saved`).

### Your Lists — `/craft-lists/saved` (mockup p4)

- `+ New list` (→ builder) and a "Filter lists…" input.
- Each saved list row: icon, name, "`N recipes · M ingredients`", "modified …", open (→ detail) and delete (`btnDanger`, confirm).
- Empty state: "Every crafting list you've built. Open to edit, or export to pull into the in-game plugin."

### List detail — `/craft-lists/:id` (mockups p5 / p6) — the heart

Header: list name, summary line ("`13 recipes · 20 ingredients · 6 crystal types · modified 2h ago`"), and actions: **+ Add items** (→ builder pre-loaded with this list), **Export plain text**, **Copy plugin code** (labeled "Send to plugin"). A **Sections | Table** segmented toggle.

**Sections view (p5)** — collapsible `SectionHeader` blocks, in display order:
1. **Final Items** — the list's own recipes; 2-column grid; each: job icon, name, `×qty` (+ HQ star where relevant).
2. **Sub-crafts — Level 1, Level 2, …** — one block per craft depth; rows show icon, name, `Lv##` + job, qty, and **"feeds: …"**.
3. **Gathered** — rows with source tag (`GATHERED` / `TIMED GATHER`), qty, "feeds: …".
4. **Vendor / Monster Drop / Other** — rows with source tag, qty, "feeds: …".
5. **Crystals** — **collapsed by default** (always large); elemental/cluster totals.

Collapsible state: `useState<Set<string>>` of open section keys; header toggles. Section blocks styled per the `SubBlock` pattern.

**Table view (p6)** — one flat `ResultTableScaffold` table: columns **Item · Source · Recipe (Lv + job) · Required · Used to Craft**. `FilterBar` source chips: All / Crafted / Gathered / Vendor / Monster / Crystal. Sortable headers (name, source, required) via the existing toggle-sort pattern. Density toggle + CSV export come free with the scaffold.

No inventory / Remaining / color-coding columns on the web — those are plugin-side (Part 2).

### Source-tag visual legend (mockup p11)
Tags rendered as bordered mono chips, colored consistently: `CRAFTED`, `GATHERED`, `TIMED GATHER`, `VENDOR`, `MONSTER`, `TOME / TOKEN`, `CRYSTAL`.

## Exports (the bridge to Part 2) — both client-side, no backend

- **Copy plugin code** — `qq:list:v1:<base64url(json)>` where json = `{ n: name, i: [[itemId, qty, hqFlag], …] }`. This is the exact paste-code the plugin import box decodes (mockup p8). Shipping it now fixes the web↔plugin contract before the plugin exists. The on-page button is labeled "Send to plugin" and copies this code to the clipboard.
- **Export plain text** — human-readable resolved ingredient list (e.g. grouped "`Item Name × Qty`" lines) for shopping outside the game.

## Data flow

1. **Build:** `CraftLists` reads item snapshot → user searches, checks, sets qty → "Create" → `POST /api/lists` → redirect to `/craft-lists/:id`.
2. **Resolve:** `ListDetail` fetches `GET /api/lists/:id` (meta + items) → `resolveList()` runs client-side over cached snapshots → grouped `ResolvedList` rendered in Sections/Table.
3. **Edit:** add items (builder) / qty edits / rename → `PUT /api/lists/:id` → re-resolve.
4. **Export:** encode current list items → clipboard (plugin code) or formatted text (resolved ingredients).

## Error handling

- Unknown/missing list id → friendly "List not found" empty state with a link to Your Lists.
- Snapshot not yet loaded → existing loading state from the snapshot hooks.
- Resolution guards: cycle detection and depth cap are already in `explode()`; recipes missing for a "final" item → it renders as a Final Item with no sub-tree (treated as directly acquired).
- Mutations on a list you don't own → API returns 403; UI hides edit/delete affordances for non-owners.
- Empty list → detail view shows an empty state prompting to add items.

## Testing

- **Unit (`resolveList.ts`):** depth assignment, parent/"feeds" aggregation across multiple final items, crystal bucketing, timed-gather flagging, quantity summation with recipe yield (`amountResult`). Use a small fixed recipe/snapshot fixture (e.g. the "Set of Fending" example from the mockups).
- **Unit (export):** `qq:list:v1` round-trip encode/decode; plain-text formatting.
- **Store/API:** create→get→update→delete happy path; ownership enforcement (non-owner PUT/DELETE rejected); cascade delete of `list_items`.
- **Component:** builder check→tray→create flow; detail Sections/Table toggle and source-chip filtering. Follow existing testing-library patterns (`fake-indexeddb` for the snapshot cache).

## Build sequence (for the implementation plan)

1. Server: tables + `CraftStore` methods + `_lists-core.ts` + fold routes into `projects` handler. Tests.
2. Client data layer: types, react-query hooks (`useLists`, `useList`, mutations), `resolveList.ts` (+ `explode` provenance opt-in). Tests.
3. Builder page + nav entry + route.
4. Your Lists page + route.
5. List detail page (Sections + Table) + route.
6. Exports (plugin code + plain text).
7. Wire-up review, verification, polish.

## Open questions deferred to Part 2 (plugin)
- Per-user plugin identity binding for live sync (vs. paste-code).
- Inventory/retainer reads, Remaining column, color-coding.
- Premade lists, RECIPES/INGREDIENTS plugin tabs.
