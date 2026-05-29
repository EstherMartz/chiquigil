# Item Deliverables — "Turn-Ins & Deliverables" on the item detail page

**Date:** 2026-05-29
**Status:** Approved design, ready for implementation plan

## Goal

On the individual item view (`src/routes/Item.tsx`), show whether the item is required as a
**deliverable / turn-in** across three categories:

1. **Grand Company Supply** — the DoH/DoL provisioning/supply mission turn-ins.
2. **Levequests** — DoH craft-leve deliverables.
3. **Quest turn-ins** — any quest that requires the item as a hand-in, with a best-effort
   crafter/gatherer class-quest tag (job + "class quest") when identifiable.

This is supplementary, read-only information. It must degrade gracefully and add **no new bulk
network fetches** — all three sources are already fetched by the app today.

## Data sources (all already in use)

| Category | Source | Hook today |
|---|---|---|
| GC Supply | Teamcraft `gc-supply.json` → `SnapshotQuest.requiredItems` | `useQuestSnapshot()` |
| Levequests | XIVAPI `Leve`+`CraftLeve` → `SnapshotLeve.targetItemId` | `useLeveSnapshot()` |
| Quest turn-ins | Garland per-item doc `usedInQuest` array | `useGarlandItem()` |

### Garland `usedInQuest` semantics (verified)

Garland's per-item JSON (`https://www.garlandtools.org/db/doc/item/en/3/{id}.json`) separates:

- `quests: number[]` — quests that **reward** this item (NOT used here).
- `usedInQuest: number[]` — quests that **require** this item as a turn-in (this is the
  "deliverable" relationship we want).

Quest display names come from the doc's `partials` of `type: 'quest'`, whose `obj` looks like
`{ i: 65539, n: "Way of the Botanist", g: 174, l: "Gridania", s: 10, f: 1 }` — `n` is the name,
`g` is the journal genre id.

The Item page **already fetches this exact doc** via `useGarlandItem`; `parseGarlandItem`
currently ignores `usedInQuest`. We extend it to extract it. No new request.

### Quest filtering decision

Show **all** quest turn-ins from `usedInQuest`. Apply a **best-effort** genre→job lookup to tag
rows that are recognizably crafter/gatherer class quests (e.g. `CRP class quest`). When the genre
is not in our lookup, show the quest with no job tag — we never display a guessed/possibly-wrong
tag. Garland's genre ids proved unreliable across jobs in probing, so the tag is decorative only;
correctness of the list itself does not depend on it.

## Architecture

Mirrors the existing reverse-index pattern in `src/features/items/useUsedInIndex.ts` +
`src/features/items/usedInIndex.ts` (module-level cache keyed by the snapshot Map reference,
stable across React Query reads).

### New / changed units

1. **`src/lib/garlandData.ts` (modify)**
   - Add `GarlandQuestRef { id: number; name: string; genre?: number }`.
   - Add `usedInQuests: GarlandQuestRef[]` to `GarlandItem`.
   - In `parseGarlandItem`: read top-level `usedInQuest` array; resolve each id's name (and genre)
     from `type: 'quest'` partials; ids with no resolvable partial still included with a fallback
     name `#<id>` (consistent with the existing `#${id}` ingredient fallback).
   - Update `RawItem` / `RawPartial` raw interfaces accordingly.

2. **`src/lib/gcSupplyUsedInIndex.ts` (new)**
   - `GcSupplyUsedInEntry { level: number; categoryName: string; qty: number }`
   - `type GcSupplyUsedInIndex = Map<number, GcSupplyUsedInEntry[]>`
   - `buildGcSupplyUsedInIndex(quests: SnapshotQuest[]): GcSupplyUsedInIndex` — for each quest,
     for each `requiredItems` entry, push `{ level, categoryName, qty }` under `itemId`.

3. **`src/lib/leveUsedInIndex.ts` (new)**
   - `LeveUsedInEntry { leveId: number; name: string; level: number; type: SnapshotLeve['type']; classJob: number; qty: number }`
   - `type LeveUsedInIndex = Map<number, LeveUsedInEntry[]>`
   - `buildLeveUsedInIndex(leves: SnapshotLeve[]): LeveUsedInIndex` — for each leve with
     `targetItemId != null`, push an entry under `targetItemId` (qty from `targetItemQty ?? 1`).

4. **`src/features/items/useGcSupplyUsedInIndex.ts` (new)** — over `useQuestSnapshot()`, same
   module-level-cache shape as `useUsedInIndex`. Returns `{ data, isLoading, isError }`.

5. **`src/features/items/useLeveUsedInIndex.ts` (new)** — over `useLeveSnapshot()`, same shape.

6. **`src/features/items/deliverableGenres.ts` (new)** — small constant map
   `GENRE_TO_JOB: Record<number, string>` (best-effort, e.g. `174 → 'BTN'`) plus a helper
   `jobTagForGenre(genre?: number): string | null`. Documented as best-effort; safe to be
   incomplete. Verify/seed values against real Garland docs during implementation.

7. **`src/features/items/DeliverablesBlock.tsx` (new)** — presentational section component.
   Props: the per-item GC list, leve list, and `GarlandQuestRef[]`, plus `itemNames` map for
   linking. Renders a single `<section>` only when at least one sub-list is non-empty, containing
   up to three sub-blocks, each rendered only when its list is non-empty.

### Wiring in `Item.tsx`

- Call `useGcSupplyUsedInIndex()` and `useLeveUsedInIndex()`; look up the current `itemId`.
- Read `garland.data?.usedInQuests` (already available from the existing `useGarlandItem` call).
- Render `<DeliverablesBlock ... />` between the existing `UsedInBlock` (line ~231) and
  `SourcesBlock`.

## UI

Follows established idioms: `SectionHeader` (`compact`), `border border-border-base bg-bg-card`
cards, `ItemNameLinks`/router links for navigation, font-mono uppercase micro-labels.

Section title: **"Turn-Ins & Deliverables"**. Sub-blocks (each omitted when empty):

- **Grand Company Supply** — rows: `{categoryName} · Lv.{level} · ×{qty}`.
- **Levequests** — rows: `{name} · {job} Lv.{level} · ×{qty}`, linking to `/leves`.
- **Quest Turn-Ins** — rows: `{quest name}` + optional `{job} class quest` tag from
  `jobTagForGenre`. External link to the Garland quest page where available; otherwise plain text.

## Error handling / degradation

- Each sub-block is independent. A failed Garland fetch (the hook already uses `retry: false`)
  simply omits the Quest Turn-Ins sub-block.
- GC/leve snapshots still loading → their sub-blocks are omitted (no blocking spinner; this is
  supplementary). The section reappears automatically once data resolves (React Query + memo).
- If all three are empty/unavailable, the entire section renders nothing.

## Testing

Pure functions, table-tested:

- `buildGcSupplyUsedInIndex` — multiple quests/items, qty aggregation, empty input.
- `buildLeveUsedInIndex` — leves with/without `targetItemId`, qty fallback.
- `parseGarlandItem` (extend existing `garlandData.test.ts`) — `usedInQuest` extraction, name
  resolution from quest partials, missing-partial fallback, absent field → empty array.
- `jobTagForGenre` — known genre → tag, unknown genre → null.

## Out of scope (YAGNI)

- No new bulk Quest-sheet fetch (XIVAPI v2 doesn't expose turn-in requirements anyway).
- No market/profit analysis on deliverables (this is informational; the existing Quest Item Flip
  and Leve Planner views already cover the gil-making angle).
- No sorting/filtering controls — lists are short and contextual.
