# Source Card NPC + Zone Enrichment — Design Spec

**Status:** Approved 2026-05-18
**Scope:** Enrich `VendorSourceCard` and `CurrencySourceCard` on `/item/:id` with the selling NPC's name and zone.
**Depends on:** VendorSourceCard (shipped 2026-05-17), CurrencySourceCard (shipped 2026-05-18), `useGarlandItem` (existing).

---

## Goal

Both source cards currently answer "should I buy this from a vendor?" but not "**where do I actually go**?". This spec wires Garland Tools NPC + zone data into both cards so each source line reads like:

```
Sold by NPC: 290 gil
└─ Storm Quartermaster · Limsa Lominsa Upper Decks
   (vs. Phantom NQ 510 · profit 220/unit)
```

```
Poetics → 10 per unit · vs Phantom NQ 5,200 · gil/unit 520 · Auriana · Mor Dhona
```

The cards still render usefully when Garland data is missing — the new lines simply omit.

## Non-goals

- No NPC coordinates.
- No NPC `title` field (e.g. "Guild Supplier") — redundant with card headers.
- No filtering by zone-unlock or job availability.
- No new currencies, no new offers — purely enriching existing displays.

## Architecture

### Data sources

Garland provides both pieces, split across two endpoints:

**Per-item doc** (already fetched by `useGarlandItem`):
- `item.vendors: number[]` — NPC IDs that sell this item in a gil shop.
- `item.tradeShops: Array<{ shop, npcs: number[], listings: Array<{ item, currency }> }>` — special-shop trades. Each listing's `currency[0].id` is a stringified XIVAPI item ID (e.g. `"28"` = Poetics).
- NPC partials in `partials[]` with `obj: { n: name, t?: title, l?: locationId }`.

**Global doc** (`/db/doc/core/en/3/data.json`): immutable, single fetch per session.
- `locationIndex: { [id]: { id, name, parentId, size } }` — resolves zone names.

### New modules

- `src/lib/garlandLocations.ts`
  - `parseGarlandLocations(raw): Map<number, string>` — pure parse of the global doc's `locationIndex` into `id → name`.
  - `fetchGarlandLocations(): Promise<Map<number, string>>` — fetch + parse.
- `src/features/queries/useGarlandLocations.ts`
  - `useGarlandLocations()` — tanstack-query hook, queryKey `['garland-locations']`, `staleTime: Infinity`, `retry: false`.

### Extended modules

`src/lib/garlandData.ts` — `parseGarlandItem` returns two new fields:

```ts
export interface GarlandNpcRef {
  id: number;
  name: string;
  locationId?: number;
}

export interface GarlandTradeShopNpc extends GarlandNpcRef {
  currencyItemId: number;
}

export interface GarlandItem {
  // ...existing
  gilShopNpcs: GarlandNpcRef[];        // from item.vendors ∩ partials
  tradeShopNpcs: GarlandTradeShopNpc[]; // one entry per (npc × currency) pair
}
```

Parser changes:
- Build `npcPartials: Map<number, { name, locationId? }>` (extends existing extraction; currently only captures `n`).
- `gilShopNpcs`: iterate `item.vendors`; for each NPC ID found in partials, push `{ id, name, locationId }`. Cap at 5 (defensive — the UI shows 1; cap avoids huge memory for items with 30+ vendors).
- `tradeShopNpcs`: for each `item.tradeShops[i]`, for each `listings[j]`, parse `currency[0].id` as a number; for each NPC in `shops[i].npcs`, push `{ id, name, locationId, currencyItemId }`. Dedupe by `(id, currencyItemId)` — same NPC offering multiple listings with the same currency only appears once.
- Both arrays default to `[]` when fields are missing.

### Component changes

**`VendorSourceCard`** — accept new optional props:
```ts
interface Props {
  vendorPrice: number;
  homeMarket: MarketItem | undefined;
  canHq: boolean;
  worldLabel: string;
  npcName?: string;
  npcZone?: string;
}
```

Render a new small line between the gil-price line and the existing market-comparison line:
```tsx
{npcName && (
  <div className="font-mono text-[10px] text-text-low mt-0.5">
    └─ {npcName}{npcZone && <> · {npcZone}</>}
  </div>
)}
```

If both props are absent: card renders exactly as today.

**`CurrencySourceCard`** — accept one new optional prop:
```ts
interface Props {
  // ...existing
  npcsByCurrencyItemId?: Map<number, { name: string; zone?: string }>;
}
```

In the per-row render, after the existing `gil/unit` span, append:
```tsx
{npcsByCurrencyItemId?.get(offer.currency.itemId) && (
  <span className="text-text-low text-xs">
    {' · '}{npcsByCurrencyItemId.get(offer.currency.itemId)!.name}
    {npcsByCurrencyItemId.get(offer.currency.itemId)!.zone &&
      <> · {npcsByCurrencyItemId.get(offer.currency.itemId)!.zone}</>}
  </span>
)}
```

If the map is undefined or the row's currency has no entry: row renders as today (no layout shift).

### Wire-up in `src/routes/Item.tsx`

Add `useGarlandLocations()` next to the existing `useGarlandItem()` call. Two new memos:

```ts
const vendorNpc = useMemo(() => {
  if (!isInGilShop || !garland.data?.gilShopNpcs.length) return undefined;
  const first = garland.data.gilShopNpcs[0];
  const zone = first.locationId != null ? locations.data?.get(first.locationId) : undefined;
  return { name: first.name, zone };
}, [isInGilShop, garland.data, locations.data]);

const currencyNpcsByItemId = useMemo(() => {
  if (!garland.data?.tradeShopNpcs.length) return undefined;
  const map = new Map<number, { name: string; zone?: string }>();
  for (const npc of garland.data.tradeShopNpcs) {
    if (map.has(npc.currencyItemId)) continue; // first wins per currency
    const zone = npc.locationId != null ? locations.data?.get(npc.locationId) : undefined;
    map.set(npc.currencyItemId, { name: npc.name, zone });
  }
  return map.size ? map : undefined;
}, [garland.data, locations.data]);
```

Pass these to the respective cards. Both branches degrade silently if either hook is loading/erroring — undefined props simply skip the new lines.

## Edge cases & decisions

- **Multiple gil-shop NPCs:** common (item 4566 has 22). Show only the first by stable ID order. Roadmap follow-up noted: "show closer/lower-level NPC if first is gated by a late-game zone".
- **Multiple NPCs per currency in tradeShopNpcs:** rare but possible (e.g. one NPC in Mor Dhona, another in Idyllshire both sell Poetics-tier items). First wins per currency.
- **Missing zone:** show NPC name alone; the `·` separator is conditional on `zone` being truthy.
- **Garland CORS/network failure:** both hooks set `retry: false`; cards skip the NPC line and render as today. No error banner needed.
- **Stringified currency IDs in `tradeShops`:** Garland encodes them as strings; coerce via `Number()` and skip if `NaN`.
- **`currencyByItemId` mismatch:** if `tradeShops` carries a currency we don't list in `src/lib/currencies.ts`, the corresponding `CurrencySourceCard` row simply doesn't exist (it never made it through `findItemCurrencyOffers`), so the orphan NPC entry in `npcsByCurrencyItemId` is harmless.

## Testing

| Test file | New / Modified | Coverage |
|---|---|---|
| `src/lib/garlandData.test.ts` | Modified (+2 tests) | Parser extracts `gilShopNpcs` from `vendors` + partials; extracts `tradeShopNpcs` with `currencyItemId`; both default to `[]` when fields missing |
| `src/lib/garlandLocations.test.ts` | New (+2 tests) | `parseGarlandLocations` builds Map from `locationIndex`; missing/empty input returns empty Map |
| `src/features/items/VendorSourceCard.test.tsx` | New (+2 tests) | Renders NPC name + zone when props provided; omits the line when props absent |
| `src/features/items/CurrencySourceCard.test.tsx` | Modified (+1 test) | Per-row NPC name appears when map matches row's currency; absent map = no append |

Suite: 626 → 633 (+7 tests).

## File list

**Create:**
- `src/lib/garlandLocations.ts`
- `src/lib/garlandLocations.test.ts`
- `src/features/queries/useGarlandLocations.ts`
- `src/features/items/VendorSourceCard.test.tsx`

**Modify:**
- `src/lib/garlandData.ts` (extend parser, add types)
- `src/lib/garlandData.test.ts` (extend fixture, add 2 assertions)
- `src/features/items/VendorSourceCard.tsx` (new props + line)
- `src/features/items/CurrencySourceCard.tsx` (new prop + per-row append)
- `src/features/items/CurrencySourceCard.test.tsx` (add 1 test)
- `src/routes/Item.tsx` (wire `useGarlandLocations`, two memos, pass props)

## Out of scope / deferred

- **NPC title display** (`obj.t`) — defer; can revisit if users ask for trade context.
- **NPC coords** — defer; FFXIV wiki has these.
- **Smart NPC ordering** (closest/lowest-level-gated) — defer; first-by-ID is good enough.
- **Cache `data.json` to IndexedDB** — defer; tanstack-query in-memory cache is fine for a static doc fetched once per session.
- **Localizing zone names** — defer; English only matches the rest of the app.
