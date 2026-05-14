# Gathering session planner — design

Date: 2026-05-14

## Problem

`/gathering` currently shows the same ranked-by-gil/day candidate table as `/crafts` and `/trading`. For brain-off gathering (e.g. running an auto-gatherer during a meeting), the user still has to:

1. Eyeball the table to pick what to grind.
2. Guess how much of each item fits in their session window.
3. Manually type each item + quantity into GatherBuddy Reborn's auto-gather list editor.

The planner closes that loop: pick a budget (time or gil), pick how many items, get a target-quantity table, copy a GBR-import string, paste in game, walk away.

## Non-goals

- **Saved routes / presets.** Each planning session is stateless. The UI store remembers the last-used inputs so reopens don't lose your setup, but there are no named saved routes. If routes ever become useful, the planner's `QueryFilter` + budget shape can be promoted to a persisted `GatheringRoute` model later.
- **In-app gathering execution / tracking.** GBR handles routing; we are a planning tool only.
- **Per-item gather-rate overrides.** Auto-gather throughput is dominated by travel time, not item-specific factors. A single global `itemsPerMin` constant is honest about the approximation.
- **BTN-vs-MIN class filtering.** The gathering catalog (`src/lib/gatheringCatalog.ts`) does not carry job info today. Adding it is a separate enhancement.

## User flow

1. User opens `/gathering`.
2. Top panel: **Plan a session.**
   - Budget mode toggle: ● Time `[ 45 ]` min  ○ Gil `[ ____ ]`
   - Item count slider: 1 – 10 (default 3)
   - Filter knobs: max level, include-timed toggle
3. Below the controls, a table of N picks with computed `Qty` and per-item subtotal, plus a total (gil and estimated minutes).
4. List name input + "Copy GBR clipboard string" button.
5. In game: open GBR's auto-gather list selector → click the "Import an auto-gather list from clipboard" icon → list appears with the chosen name and computed quantities.
6. Below the planner, the existing browsable table of all gatherables remains, ranked by gil/day.

## Architecture

### New files

- `src/lib/gatherBuddyExport.ts`
  Pure helper. `encodeGbrList(input: GbrListInput): Promise<string>`.
  Builds the GBR `AutoGatherList.Config` JSON shape, prepends a `0x05` version byte, gzips via `CompressionStream('gzip')`, base64-encodes. Round-trip-tested.

- `src/features/gathering/computePlan.ts`
  Pure planner math. `computePlan(rows, opts) => PlanRow[]`. No React.
  - Time mode: `totalItems = minutes * itemsPerMin`, then split across the top-N by `gilFlow` share.
  - Gil mode: per item, `qty = gilTarget * (gilFlow_i / Σ gilFlow) / unitPrice_i`. Total time is reported as `Σ qty / itemsPerMin`.
  - Skips rows with `unitPrice <= 0` (would divide-by-zero in gil mode); caps N at `rows.length`.

- `src/features/gathering/GatheringPlanner.tsx`
  Component for the top panel. Reads gathering rows passed in as props. Renders the budget controls, the computed table, and the export button. Reads/writes its state from the new `gatheringPlanStore` (below). Named `GatheringPlanner` rather than `SessionPlanner` because `src/features/session/SessionPlanner.tsx` already exists for the home-hub session planner.

- `src/features/gathering/gatheringPlanStore.ts`
  New persisted zustand slice (same `persist` middleware pattern as `src/features/ui/uiStore.ts`). Holds the planner's user inputs plus the `itemsPerMin` knob:
  ```ts
  interface GatheringPlanState {
    _v: 1;
    budgetMode: 'time' | 'gil';
    budgetTimeMin: number;       // default 45
    budgetGil: number;           // default 500000
    itemCount: number;           // default 3, range 1-10
    maxLevel: number;            // default 90
    includeTimed: boolean;       // default false
    listName: string;            // default 'AFK gather'
    itemsPerMin: number;         // default 100 — exposed as a small input in the planner UI
  }
  ```
  Persist key: `ffxiv-helper:gathering-plan`.

### Modified files

- `src/routes/Gathering.tsx`
  Render `<GatheringPlanner rows={...} />` above the existing `<QueriesView category="gathering" />`. Both views consume the same gathering query results.

- `src/features/queries/QueriesView.tsx`
  Minor: expose the loaded `rows` to its parent so `Gathering.tsx` can pipe them into the planner without running the query twice. Implementation choice (render-prop vs. lifting state vs. running a second query in the planner) is left to the plan phase — whichever fits the existing component shape most cleanly.

### Data flow

```
+------------------+     rows     +-----------------+
| /gathering query | -----------> | SessionPlanner  |
| (existing)       |              |                 |
+------------------+              |  computePlan()  |
        |                         |        |        |
        |                         |        v        |
        |                         |  PlanRow[]      |
        |                         |        |        |
        |                         |        v        |
        |                         |  encodeGbrList()|
        |                         |        |        |
        v                         +--------|--------+
+------------------+                       v
| QueryResults     |              clipboard (base64)
| (existing browse)|                       |
+------------------+                       v
                                  GBR auto-gather list
```

## GBR clipboard format

Source of truth: [AutoGatherList.cs](https://github.com/FFXIV-CombatReborn/GatherBuddyReborn/blob/main/GatherBuddy/AutoGather/Lists/AutoGatherList.cs) `Config.ToBase64` / `FromBase64` + `Functions.CompressedBase64`.

**Pipeline (encode):**

1. Build the `Config` JSON shape via standard `JSON.stringify`:
   ```json
   {
     "ItemIds": [5544, 5543, 5545],
     "Quantities": { "5544": 320, "5543": 151, "5545": 434 },
     "PrefferedLocations": {},
     "EnabledItems": { "5544": true, "5543": true, "5545": true },
     "Name": "AFK 45m",
     "Description": "",
     "FolderPath": "",
     "Order": 0,
     "Enabled": true,
     "Fallback": false
   }
   ```
   `PrefferedLocations` is misspelled in the GBR source; we copy the typo verbatim so the field is not silently dropped on import.
2. UTF-8 encode the JSON string.
3. Prepend a `0x05` version byte (matches GBR's `CurrentVersion = 5`).
4. Gzip via `CompressionStream('gzip')`.
5. Base64-encode (standard, not URL-safe) via `btoa` over the byte array.

**Version handling:** the version byte is pinned to `5`. If GBR ever bumps it, the round-trip test (see below) breaks loudly. We add a comment in `gatherBuddyExport.ts` pointing at the source file so the next person knows where to look.

## Calculation

Both modes operate on the top-N gatherable rows by `gilFlow` (alias `gilFlow`) after the user's filters apply.

**Time mode:**
```
totalItems = budgetTimeMin * itemsPerMin
sumGilDay  = Σ row.gilFlow  (over the top N picks)
qty_i      = round( totalItems * (row.gilFlow / sumGilDay) )
```

**Gil mode:**
```
sumGilDay   = Σ row.gilFlow
qty_i       = round( budgetGil * (row.gilFlow / sumGilDay) / row.unitPrice )
totalMin    = ceil( (Σ qty_i) / itemsPerMin )
```

Both modes:
- Drop rows where `unitPrice <= 0` from the weighting and render `—` for the row.
- Cap N at the number of available rows.
- Clamp each `qty_i` to `[1, 999_999]` (GBR's accepted range per `AutoGatherList`).

## Edge cases

- **No gatherable rows** (Universalis empty / catalog still loading): planner renders the existing "no items match" empty state; the export button is disabled.
- **N > available rows:** silently cap and show "only X matches" near the count slider.
- **Zero-price row in slice:** skip from weighting, render `—` row, do not include in the exported list.
- **`navigator.clipboard.writeText` blocked** (insecure context, denied permission): fall back to a modal with a `<textarea>` pre-selected so the user can `Ctrl+C` manually.
- **GBR format drift:** caught by `gatherBuddyExport.test.ts` (round-trip + version-byte assertions).

## Testing

- `computePlan.test.ts`
  - Time mode: weighting math, integer rounding, total stays close to budget.
  - Gil mode: weighting math, time estimate.
  - N-cap respected when fewer rows than requested.
  - Zero-price row skipped.

- `gatherBuddyExport.test.ts`
  - Encode a fixture `PlanRow[]` → base64 string.
  - Base64-decode → gunzip via `DecompressionStream` → first byte is `0x05`.
  - Remaining bytes decode to JSON deep-equal to the expected `Config` shape (including the `PrefferedLocations` typo and all default fields).

- `GatheringPlanner.test.tsx`
  - Render with fixture rows; toggle budget mode and assert the table updates.
  - Assert export button is disabled when rows are empty and enabled otherwise.
  - Assert the export handler writes the encoded string to `navigator.clipboard` (mocked).
