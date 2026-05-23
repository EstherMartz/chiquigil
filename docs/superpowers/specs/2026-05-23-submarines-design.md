# Submarines — Design Spec

**Date:** 2026-05-23
**Scope:** Two-tab page (Route Valuator + Loot Pricer) for submarine voyage profitability analysis, using static sector/loot data + live Universalis prices.

---

## 1. Data Source

Static file `src/data/submarineSectors.json` — 143 sectors across 7 zones, 345 unique loot items. Each sector has:

```ts
{
  id: number;          // XIVAPI row ID
  name: string;        // e.g. "the Ivory Shoals"
  letter: string;      // e.g. "A"
  zone: string;        // e.g. "Deep-sea Site"
  rankReq: number;     // 1–145
  durationMin: number; // voyage duration in minutes (180–2000)
  loot: {
    itemId: number;
    name: string;
    tier: "common" | "uncommon" | "rare";
  }[];
}
```

---

## 2. Settings Additions

Two new fields in `useSettingsStore`:

| Field | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `submarineRank` | `number` | `1` | 1–125 | Filters sectors by `rankReq ≤ rank` |
| `submarineSlots` | `number` | `1` | 1–5 | Max sectors per route |

Editable inline on the Submarines page header via small number inputs — no need to visit Settings page.

---

## 3. Tab 1: Route Valuator

### 3a. Layout

Top bar:
- Zone dropdown (default: "All zones") — filters sector grid to one zone
- **Suggest best route** button — auto-fills optimal sectors (see §3d)
- Inline rank/slots inputs from settings

Below top bar:
- Selected sectors shown as removable gold pills
- Sector grid table (filterable by zone + rank)

Below sector grid:
- Route summary panel (appears when ≥1 sector selected and scan complete)

### 3b. Sector Grid

Table columns: Letter, Name, Zone, Rank Req, Duration (min). Sortable by all columns.

- Rows filtered to `rankReq ≤ submarineRank`
- Clicking a row toggles it into the route (max `submarineSlots` sectors)
- Selected rows highlighted with `border-gold` / `bg-gold/10`
- If route is full (slots used), clicking another row does nothing (disabled state)

### 3c. Route Summary

Appears after RUN SCAN fetches prices. Shows:

**Per-sector breakdown table:**

| Sector | Item | Tier | Drop Rate | Price | Expected |
|--------|------|------|-----------|-------|----------|
| A — Ivory Shoals | Red Moko Grass | Common | 0.30 | 500 | 150 |
| ... | ... | ... | ... | ... | ... |
| | | | | **Sector total** | **1,200** |

**Route totals:**
- Total voyage duration: sum of sector durations (formatted as Xh Ym)
- Expected gil/voyage: sum of all sector totals
- **Expected gil/hour**: total ÷ (duration in hours) — the primary metric, displayed prominently in gold

**Drop rate constants (tier-based approximation):**
- Common: 0.30
- Uncommon: 0.15
- Rare: 0.05

InfoTooltip disclaimer: "Drop rates are rough estimates based on community data tiers. Actual rates vary by submarine stats and RNG."

### 3d. Suggest Best Route

1. Filter sectors by `rankReq ≤ submarineRank` within the selected zone (if "All zones", pick the zone with the highest total score)
2. Score each sector: `Σ(drop_rate × market_price)` for its loot items
3. Pick top N sectors (N = `submarineSlots`) by score descending
4. Populate route with those sectors

If prices haven't been fetched yet for that zone, triggers a scan for all loot items in the zone first, then runs the optimizer.

### 3e. RUN SCAN

Fetches Universalis prices for all unique loot item IDs across selected sectors. Uses `fetchInBatches` (chunkSize: 100, concurrency: 4) with ProgressBar. Results cached in component state.

---

## 4. Tab 2: Loot Pricer

### 4a. Layout

Top bar: Zone dropdown filter + RUN SCAN button.

Results table below, populated after scan.

### 4b. RUN SCAN

Fetches prices for all unique loot items in filtered zones (or all 345 items if "All zones"). Same `fetchInBatches` pattern with ProgressBar.

### 4c. Results Table

Columns: Item (ItemNameLinks), Zone(s), Tier, Price (min listing NQ), Avg Price, Velocity, Indicator.

Sortable by all numeric columns. Default sort: price descending. Uses `useLoadMore` with page size 25.

### 4d. Indicator Logic

Three states based on fetched market data:

| Indicator | Condition | Color |
|-----------|-----------|-------|
| **SELL** | velocity ≥ 1 AND minPrice ≥ 100 | jade |
| **HOLD** | velocity ≥ 1 AND minPrice < averagePrice × 0.8 | gold |
| **SKIP** | velocity < 1 OR minPrice < 100 | text-low |

Evaluation order: HOLD first (must meet velocity threshold AND be depressed), then SELL (meets thresholds), then SKIP (everything else).

---

## 5. Navigation

Add "Submarines" to Sidebar under Gil-Making group, after Currencies. Route: `/submarines`.

---

## 6. Files

### New Files

| File | Purpose |
|------|---------|
| `src/routes/Submarines.tsx` | Page shell with tab switcher + inline settings |
| `src/features/submarines/RouteValuator.tsx` | Sector picker + route summary + suggest |
| `src/features/submarines/LootPricer.tsx` | All-loot table with indicators |
| `src/features/submarines/SectorGrid.tsx` | Filterable sector selection table |
| `src/features/submarines/RouteSummary.tsx` | Selected route breakdown + gil/hr |
| `src/features/submarines/suggestRoute.ts` | Zone-constrained greedy optimizer |
| `src/features/submarines/submarineTypes.ts` | Shared types (Sector, LootItem, RouteResult) |
| `src/features/submarines/dropRates.ts` | Tier → rate constants + disclaimer text |

### Modified Files

| File | Changes |
|------|---------|
| `src/features/settings/store.ts` | Add `submarineRank`, `submarineSlots` with defaults and setters |
| `src/components/layout/Sidebar.tsx` | Add Submarines nav item under Gil-Making |
| `src/App.tsx` | Add `/submarines` route with lazy import |
