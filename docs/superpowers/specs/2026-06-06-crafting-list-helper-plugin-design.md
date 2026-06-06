# Crafting List Helper — Part 2: In-Game Plugin Panel

**Date:** 2026-06-06
**Status:** Design — awaiting review
**Scope:** The Dalamud plugin panel (repo: `qiqirn-companion`) + one backend extension in `ffxiv-helper`. Builds on Part 1 (web): `docs/superpowers/specs/2026-06-06-crafting-list-helper-web-design.md`.

## Overview

An in-game **Crafting Lists** panel for the Qiqirn Companion plugin with three tabs — **LISTS / RECIPES / INGREDIENTS** — that imports a crafting list from a `qq:list:v1:` paste-code, resolves it into final items + sub-crafts + raw materials, and shows an inventory-aware "what's missing" view. It replaces the painful Artisan clipboard flow with a legible, contextual list view. No node timers, no autocraft.

### Decisions locked during brainstorming

- **Import = paste-code (`qq:list:v1:`).** Identity-free; reuses the contract Part 1 already ships (the web detail page's "Send to plugin" copies this code). Cloud "your lists" sync and the localhost WS bridge are deferred (no plugin↔Discord identity exists; the WS bridge is half-built/web-only).
- **All three tabs in this build** (LISTS / RECIPES / INGREDIENTS).
- **Resolution reuses Part-1 `resolveList.ts` server-side.** It is pure TS, so the **existing** `plugin-craft-breakdown` lambda is extended to resolve a whole list — one source of truth, no C# reimplementation, no new lambda (12-cap respected).
- **Inventory/color is bags-based** (`InventoryReader.AggregatedBags()`, + optional saddlebag). Retainer inventory deferred.

## Goals / Non-goals

**Goals**
- Decode and import a `qq:list:v1:` code locally; cache imported lists in plugin config; browse/filter/select/refresh them.
- Resolve the active list (server-side) into Final Items, Sub-crafts by depth, and raw materials with source tags + "used to craft".
- RECIPES tab: ordered craft queue with recipe details, per-final qty editing, and proportional sub-craft auto-scaling.
- INGREDIENTS tab: columnar Item · Required · In Inventory · Remaining · Source · Used to Craft, with color coding, "Only show HQ", and "Export remaining as plain text".

**Non-goals (v1)**
- Cloud sync / plugin↔Discord identity / `/api/plugin/lists` per-user pull.
- The localhost WebSocket bridge (plugin-side server).
- Premade/community lists.
- Artisan IPC, autocraft, macro injection.
- Retainer inventory reads, node timers.

## Architecture

```
[web detail page]  "Send to plugin" → clipboard: qq:list:v1:<base64url>
        │  (user copies, alt-tabs, pastes)
        ▼
[qiqirn-companion plugin]
   ListCodec.Decode(code) → ImportedList { name, items:[{itemId,qty,hq}] }   (local, C#)
        │  POST { items:[{itemId,qty,hq}] }
        ▼
[qiqirn.tools]  POST /api/plugin/craft-breakdown   (existing lambda, extended)
   loadSnapshots() → resolveList(items, deps)  ← reuses Part-1 resolver
        ▼  { finalItems[], ingredients: ResolvedIngredient[] }   (flat JSON)
[plugin]  overlay InventoryReader.AggregatedBags() → 3 tabs
```

### Backend extension (ffxiv-helper) — no new lambda

**File:** `src/api/plugin-craft-breakdown.ts` (extend) + `src/api/_list-breakdown-core.ts` (new, thin).

Today the handler is `GET ?id=&qty=` (single item). Add a `POST` branch:

```
POST /api/plugin/craft-breakdown
body: { items: [{ itemId: number, qty: number, hq?: boolean }, ...] }   // 1..200 items
→ 200 { finalItems: ApiFinalItem[], ingredients: ApiResolvedIngredient[] }
→ 400 on empty/invalid items
```

Implementation: validate items (reuse the same bounds as `_lists-core` sanitize: itemId>0 int, qty 1..99999, ≤200 items), `loadSnapshots(baseUrl)` (already used by this lambda), build the `ResolveDeps` from the loaded snapshots (`recipes`, `gatheringCatalog`, `vendorMap`, `specialShop`, and an `itemsById` map), call the Part-1 `resolveList(items, deps)`, then flatten its `ResolvedList` for JSON:

```ts
// _list-breakdown-core.ts shapes (server → plugin)
interface ApiFinalItem {
  itemId: number; itemName: string; qty: number; isHq: boolean;
  job?: string; recipeLevel?: number; stars?: number;
}
interface ApiResolvedIngredient {
  itemId: number; itemName: string; requiredQty: number;
  source: 'Crafted'|'Gathered'|'TimedGather'|'Vendor'|'MonsterDrop'|'Tome'|'Crystal';
  craftedByJob?: string; recipeLevel?: number;
  usedToCraft: string[]; depth?: number; canHq?: boolean;
}
// response: { finalItems: ApiFinalItem[]; ingredients: ApiResolvedIngredient[] }
// `ingredients` = ResolvedList.all (sub-crafts + leaves), each carrying depth/source.
```

`resolveList` imports only pure modules (`CRYSTALS_SEARCH_CATEGORY`, `src/lib` types) — confirmed safe to import from an API handler. `vercel.json` already routes `/api/plugin/craft-breakdown`; no change. The existing `GET` behavior is preserved.

### Plugin (qiqirn-companion)

New code, following existing patterns (`MainWindow` tabbed hub, `ApiClient`, `Configuration`, `InventoryReader`, `ItemInteractions`, Dalamud `WindowSystem`/ImGui tables).

**File layout (new):**
- `Services/ListCodec.cs` — decode/validate `qq:list:v1:` → `ImportedList`.
- `Services/CraftListClient.cs` *or* extend `Services/ApiClient.cs` — `Task<ListBreakdown> GetListBreakdownAsync(IReadOnlyList<(int itemId,int qty,bool hq)> items)` (POST).
- `Models/CraftListModels.cs` — `ImportedList`, `ImportedListItem`, `ListBreakdown`, `BreakdownFinalItem`, `BreakdownIngredient` (System.Text.Json records with `[JsonPropertyName]`).
- `Windows/CraftListsTab.cs` — the sub-tabbed panel (LISTS/RECIPES/INGREDIENTS), drawn from `MainWindow` as a new "Craft Lists" tab via `DrawContent()`.
- `Configuration.cs` — add `List<ImportedList> ImportedLists` (persisted) + the active list id.

## Data model (plugin)

```csharp
public class ImportedList {
  public string Id { get; set; } = "";        // local guid
  public string Name { get; set; } = "";
  public long ImportedAt { get; set; }         // unix ms
  public List<ImportedListItem> Items { get; set; } = new();
}
public class ImportedListItem { public int ItemId; public int Qty; public bool Hq; }
```

`ListBreakdown`/`BreakdownFinalItem`/`BreakdownIngredient` mirror the API response shapes above.

## UI

### "Craft Lists" tab → sub-tab bar: LISTS · RECIPES · INGREDIENTS

**LISTS tab (mockup p8)**
- "Import from Qiqirn — paste a list code" input. On change, `ListCodec.Decode` runs; valid → green "✓ `<name>` — N recipes, M items · ready to import" + an **Import** button (adds to `Config.ImportedLists`, saves). Invalid → muted "Paste a `qq:list:v1:` code".
- A filterable list of imported lists: name, "`N recipes`", "imported `<ago>`", a select affordance, and a remove (×). Selecting sets the active list and triggers `GetListBreakdownAsync`; **Refresh** re-fetches; **Start crafting list** focuses the RECIPES tab.
- Empty state prompts to paste a code copied from qiqirn.tools.

**RECIPES tab (PDF Recipes)**
- Requires an active list + fetched breakdown (else "Select a list in the LISTS tab").
- Final Items section (editable qty per row), then crafted sub-crafts grouped by depth (Level 1, 2…), `item × qty`, job bead + recipe level.
- Row click → recipe detail (difficulty/durability/quality + ingredient lines) via existing `ApiClient.GetItemSourcesAsync(itemId)` (pick the `RecipeSource`).
- **"Auto-scale sub-crafts"** checkbox (default on): editing a final-item qty updates the active list and re-calls `GetListBreakdownAsync` so sub-craft quantities rescale; off = top-level qty edits don't recompute the tree.
- `ItemInteractions.HandleRow` on each item.

**INGREDIENTS tab (mockup p9)**
- ImGui table over `breakdown.ingredients`: **Item · Required · In Inventory · Remaining · Source · Used to Craft**.
- `In Inventory` from `InventoryReader.AggregatedBags(includeSaddlebag)`; `Remaining = max(0, Required − InInventory)`.
- Row color: **green** `InInventory ≥ Required`; **blue/neutral** source == Crafted and not fully in inventory ("will be crafted"); **red** a gather/buy source short of Required; **yellow** partial (some but not enough). Legend rendered below (mockup p11), noting retainers are not counted in v1.
- Controls: ☐ Include Saddlebag, ☐ **Only show HQ** (filters to `canHq` items), **Export remaining as plain text** (lines `Item xRemaining` for rows with Remaining>0, to clipboard).
- Source rendered as a colored tag mirroring the web `SourceTag` labels (CRAFTED/GATHERED/TIMED GATHER/VENDOR/MONSTER-OTHER/TOME-TOKEN/CRYSTAL).

## `ListCodec` (decode)

Mirror the Part-1 TS encoder. Strip prefix `qq:list:v1:`; base64url→bytes (restore `+//=`); `JsonSerializer.Deserialize` to `{ n: string, i: int[][] }`; map each `[id,qty,hq]` → `ImportedListItem`; validate `id>0`, `qty≥1`; return null on any failure (never throw). (Encoder reference: `src/features/craftLists/listCode.ts`.)

## Data flow

1. **Import:** paste code → decode → Import → cached in config.
2. **Activate:** select list → `POST /api/plugin/craft-breakdown {items}` → `ListBreakdown` cached in memory for the active list.
3. **Recipes:** render queue from `finalItems` + crafted `ingredients` (by depth); qty edit (+auto-scale) → update list items → re-fetch breakdown.
4. **Ingredients:** render `ingredients` + live inventory overlay; toggles/filters/export are client-side over the cached breakdown.

## Error handling

- Invalid/empty paste-code → inline muted hint; no crash (decoder returns null).
- Breakdown fetch failure (network/500) → tab shows a retry banner with the error; keep last good breakdown if present.
- Item not resolvable (no snapshot entry) → server still returns it with `itemName` fallback; plugin renders the id-named row.
- Not logged in / no character → inventory columns show "—" (In Inventory unavailable); breakdown + Required still work.
- Empty active list → "This list has no items."

## Testing

**Backend (ffxiv-helper):**
- `src/api/_list-breakdown-core.test.ts` — list validation (empty/over-200/bad qty → 400), and a small fixed-snapshot resolve producing the expected flattened `{finalItems, ingredients}` (depth, source, usedToCraft, crystal bucketing) — reusing the resolveList fixture style.
- `src/api/plugin-craft-breakdown.test.ts` — extend: existing GET single-item still works; new POST list returns grouped breakdown; bad body → 400.

**Plugin (qiqirn-companion):**
- `ListCodec` round-trip/΅reject tests if a test project exists; otherwise a manual decode check (paste a known code from the web, confirm name/items).
- Manual in-game: build → load dev plugin → paste a code → LISTS shows it → select → RECIPES + INGREDIENTS populate → inventory overlay + color + "Only HQ" + export verified.

> Note the plugin repo's existing test setup is unknown; if there is no C# test harness, `ListCodec` correctness is covered by a backend round-trip test (the TS encoder) plus manual verification, rather than introducing a test framework as part of this feature.

## Build sequence (for the implementation plan)

1. Backend: `_list-breakdown-core.ts` (validate + flatten resolveList) + POST branch in `plugin-craft-breakdown.ts` + tests. (ffxiv-helper)
2. Plugin models + `ListCodec` decoder. (qiqirn-companion)
3. Plugin `ApiClient.GetListBreakdownAsync` + `Configuration.ImportedLists`.
4. `CraftListsTab` shell + LISTS tab (paste/import/select/refresh).
5. INGREDIENTS tab (table + inventory overlay + color + filters + export).
6. RECIPES tab (queue + recipe detail + qty edit + auto-scale).
7. Wire the "Craft Lists" tab into `MainWindow`; manual in-game verification.

## Cross-repo note
This feature touches two repos: a small extension in `ffxiv-helper` (one endpoint + tests) and the bulk in `qiqirn-companion` (the panel). The implementation plan will sequence the backend first so the plugin can integrate against a live endpoint.
