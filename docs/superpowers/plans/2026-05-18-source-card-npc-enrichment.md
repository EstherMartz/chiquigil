# Source Card NPC + Zone Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NPC name + zone to `VendorSourceCard` and `CurrencySourceCard` on `/item/:id` by extending the Garland parser and adding a global locations lookup.

**Architecture:** (1) New `garlandLocations.ts` module with a single-fetch global locationId→name Map (cached forever via tanstack-query). (2) Extended `parseGarlandItem` returns `gilShopNpcs` + `tradeShopNpcs` arrays derived from `item.vendors` / `item.tradeShops` and npc partials. (3) Both source cards accept optional NPC props and render an extra small line; props are wired in `Item.tsx` via two `useMemo`s that combine the two hooks.

**Tech Stack:** TypeScript, React, tanstack-query, Vitest + React Testing Library, Garland Tools static-doc API.

**IMPORTANT GIT SAFETY RULE for implementers:** Do NOT run `git checkout`, `git reset`, `git stash`, `git clean`, `git rebase`, `git restore`, `git switch`. Only `git add`, `git commit`, `git log`, `git diff`, `git show`, `git status`, `git cat-file`, `git fsck` are allowed.

**Commit trailer:**
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 1: Garland locations module (parser + fetcher) — pure lib

**Files:**
- Create: `src/lib/garlandLocations.ts`
- Create: `src/lib/garlandLocations.test.ts`

- [ ] **Step 1: Write the failing test** at `src/lib/garlandLocations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseGarlandLocations } from './garlandLocations';

describe('parseGarlandLocations', () => {
  it('builds Map<number, string> from locationIndex', () => {
    const raw = {
      locationIndex: {
        '20': { id: 20, name: 'Hydaelyn', parentId: 20, size: 1 },
        '28': { id: 28, name: 'Limsa Lominsa Upper Decks', parentId: 22, size: 1 },
        '52': { id: 52, name: 'Mor Dhona', parentId: 22, size: 1 },
      },
    };
    const out = parseGarlandLocations(raw);
    expect(out.size).toBe(3);
    expect(out.get(20)).toBe('Hydaelyn');
    expect(out.get(28)).toBe('Limsa Lominsa Upper Decks');
    expect(out.get(52)).toBe('Mor Dhona');
  });

  it('returns empty Map when locationIndex is missing or empty', () => {
    expect(parseGarlandLocations({}).size).toBe(0);
    expect(parseGarlandLocations({ locationIndex: {} }).size).toBe(0);
  });

  it('skips entries with missing or non-string name', () => {
    const raw = {
      locationIndex: {
        '1': { id: 1, name: 'OK' },
        '2': { id: 2 },
        '3': { id: 3, name: '' },
      },
    };
    const out = parseGarlandLocations(raw);
    expect(out.size).toBe(1);
    expect(out.get(1)).toBe('OK');
  });

  it('skips entries with non-numeric key', () => {
    const raw = {
      locationIndex: {
        'abc': { id: 999, name: 'Garbage' },
        '7': { id: 7, name: 'Real' },
      },
    };
    const out = parseGarlandLocations(raw);
    expect(out.size).toBe(1);
    expect(out.get(7)).toBe('Real');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/garlandLocations.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the module** at `src/lib/garlandLocations.ts`:

```ts
/**
 * Garland Tools global data doc — used to resolve location IDs (from item NPC
 * partials' `l` field) to human-readable zone names.
 *
 * Endpoint: https://www.garlandtools.org/db/doc/core/en/3/data.json
 * Shape (subset we use):
 *   { locationIndex: { [stringId]: { id: number; name: string; parentId?: number } } }
 *
 * Best-effort: if the fetch fails, callers fall back to no zone (NPC name only).
 */

const GARLAND_DATA_URL = 'https://www.garlandtools.org/db/doc/core/en/3/data.json';

interface RawLocationEntry { id?: number; name?: string }
interface RawGarlandData { locationIndex?: Record<string, RawLocationEntry> }

export function parseGarlandLocations(raw: RawGarlandData): Map<number, string> {
  const out = new Map<number, string>();
  const idx = raw.locationIndex ?? {};
  for (const [key, entry] of Object.entries(idx)) {
    const id = Number(key);
    if (!Number.isFinite(id)) continue;
    const name = entry?.name;
    if (typeof name !== 'string' || name.length === 0) continue;
    out.set(id, name);
  }
  return out;
}

export async function fetchGarlandLocations(): Promise<Map<number, string>> {
  const res = await fetch(GARLAND_DATA_URL);
  if (!res.ok) throw new Error(`Garland data ${res.status}`);
  return parseGarlandLocations(await res.json());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/garlandLocations.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/garlandLocations.ts src/lib/garlandLocations.test.ts
git commit -m "$(cat <<'EOF'
feat(garland): locations lookup module (id -> zone name)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: tanstack-query hook for locations

**Files:**
- Create: `src/features/queries/useGarlandLocations.ts`

This task has no new test — the hook is a thin shell over `useQuery` matching the existing `useGarlandItem` pattern. Existing patterns to mirror are at `src/features/queries/useGarlandItem.ts`.

- [ ] **Step 1: Create the hook** at `src/features/queries/useGarlandLocations.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { fetchGarlandLocations } from '../../lib/garlandLocations';

export function useGarlandLocations() {
  return useQuery<Map<number, string>>({
    queryKey: ['garland-locations'],
    staleTime: Infinity,
    retry: false,
    queryFn: fetchGarlandLocations,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/useGarlandLocations.ts
git commit -m "$(cat <<'EOF'
feat(garland): useGarlandLocations hook (cached forever)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extend parseGarlandItem with gilShopNpcs + tradeShopNpcs

**Files:**
- Modify: `src/lib/garlandData.ts`
- Modify: `src/lib/garlandData.test.ts`

- [ ] **Step 1: Add the failing tests** to `src/lib/garlandData.test.ts` at the end of the existing `describe('parseGarlandItem', ...)` block (after the "uses #id placeholder" test):

```ts
  it('extracts gilShopNpcs from item.vendors intersected with npc partials', () => {
    const raw = {
      item: {
        id: 4566,
        name: 'Linen Cloth',
        ilvl: 50,
        vendors: [1000239, 1003252, 1001967], // 3 NPCs sell it
      },
      partials: [
        { type: 'npc', id: 1000239, obj: { n: 'Jossy', l: 28 } },
        { type: 'npc', id: 1003252, obj: { n: 'Domitia', l: 52 } },
        // Note: id 1001967 has no partial — should be skipped
      ],
    };
    const out = parseGarlandItem(raw);
    expect(out?.gilShopNpcs).toEqual([
      { id: 1000239, name: 'Jossy', locationId: 28 },
      { id: 1003252, name: 'Domitia', locationId: 52 },
    ]);
    expect(out?.tradeShopNpcs).toEqual([]);
  });

  it('extracts tradeShopNpcs as (npc x currency) pairs from item.tradeShops', () => {
    const raw = {
      item: {
        id: 41671,
        name: 'Some Mat',
        ilvl: 600,
        tradeShops: [
          {
            shop: 'Auriana',
            npcs: [1018997],
            listings: [
              { item: [{ id: '41671', amount: 1 }], currency: [{ id: '28', amount: 25 }] },
            ],
          },
          {
            shop: 'Hismena',
            npcs: [1019100],
            listings: [
              { item: [{ id: '41671', amount: 1 }], currency: [{ id: '25199', amount: 100 }] },
              // Duplicate currency for same npc — should dedupe
              { item: [{ id: '41671', amount: 2 }], currency: [{ id: '25199', amount: 180 }] },
            ],
          },
        ],
      },
      partials: [
        { type: 'npc', id: 1018997, obj: { n: 'Auriana', l: 52 } },
        { type: 'npc', id: 1019100, obj: { n: 'Hismena', l: 478 } },
      ],
    };
    const out = parseGarlandItem(raw);
    expect(out?.tradeShopNpcs).toEqual([
      { id: 1018997, name: 'Auriana', locationId: 52, currencyItemId: 28 },
      { id: 1019100, name: 'Hismena', locationId: 478, currencyItemId: 25199 },
    ]);
    expect(out?.gilShopNpcs).toEqual([]);
  });

  it('defaults gilShopNpcs and tradeShopNpcs to [] when fields absent', () => {
    const raw = {
      item: { id: 1, name: 'Plain', ilvl: 1 },
      partials: [],
    };
    const out = parseGarlandItem(raw);
    expect(out?.gilShopNpcs).toEqual([]);
    expect(out?.tradeShopNpcs).toEqual([]);
  });

  it('caps gilShopNpcs at 5 entries', () => {
    const raw = {
      item: {
        id: 1, name: 'Popular', ilvl: 1,
        vendors: [101, 102, 103, 104, 105, 106, 107],
      },
      partials: [101, 102, 103, 104, 105, 106, 107].map((id) => ({
        type: 'npc', id, obj: { n: `NPC ${id}`, l: 10 },
      })),
    };
    const out = parseGarlandItem(raw);
    expect(out?.gilShopNpcs).toHaveLength(5);
    expect(out?.gilShopNpcs[0]).toEqual({ id: 101, name: 'NPC 101', locationId: 10 });
    expect(out?.gilShopNpcs[4]).toEqual({ id: 105, name: 'NPC 105', locationId: 10 });
  });

  it('skips tradeShop listings with non-numeric currency id', () => {
    const raw = {
      item: {
        id: 1, name: 'X', ilvl: 1,
        tradeShops: [{
          shop: 'Mystery',
          npcs: [200],
          listings: [
            { item: [{ id: '1', amount: 1 }], currency: [{ id: 'oops', amount: 5 }] },
            { item: [{ id: '1', amount: 1 }], currency: [{ id: '28', amount: 10 }] },
          ],
        }],
      },
      partials: [{ type: 'npc', id: 200, obj: { n: 'Mystery NPC', l: 1 } }],
    };
    const out = parseGarlandItem(raw);
    expect(out?.tradeShopNpcs).toEqual([
      { id: 200, name: 'Mystery NPC', locationId: 1, currencyItemId: 28 },
    ]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/garlandData.test.ts`
Expected: 5 new tests FAIL — `gilShopNpcs` / `tradeShopNpcs` are undefined on the returned object.

- [ ] **Step 3: Update types and parser** in `src/lib/garlandData.ts`. Replace the file's content with:

```ts
/**
 * Garland Tools static-doc API for item details + ingredient source classification.
 *
 * Endpoint shape (subset we rely on):
 *   {
 *     item: {
 *       id, name, ilvl,
 *       ingredients?: [{ id, amount }],
 *       craft?: [{ ingredients }],
 *       vendors?: number[],
 *       tradeShops?: Array<{
 *         shop: string,
 *         npcs: number[],
 *         listings: Array<{ item: [{ id, amount }], currency: [{ id, amount }] }>,
 *       }>,
 *     },
 *     partials: [
 *       { type: 'item', id, obj: { n, i?, v?, s?, c?, f?, t?, ... } },
 *       { type: 'npc',  id, obj: { n, l? } },
 *       { type: 'node', id, obj: { n, t? } },
 *     ]
 *   }
 *
 * Source flags on item partials we observe in the wild:
 *   v: 1   → sold by vendor (Gil shop)
 *   t: 1   → has a recipe (craftable)
 *   has linked node/instance partials in graph → gatherable / drop
 *
 * Best-effort: if Garland blocks CORS or response shape shifts, callers fall back.
 */

const GARLAND_BASE = 'https://www.garlandtools.org/db/doc/item/en/3';
const MAX_GIL_SHOP_NPCS = 5;

export type IngredientSource = 'vendor' | 'gather' | 'craft' | 'other';

export interface GarlandIngredient {
  id: number;
  amount: number;
  name: string;
  ilvl: number;
  source: IngredientSource;
  vendorName?: string;
  nodeName?: string;
}

export interface GarlandNpcRef {
  id: number;
  name: string;
  locationId?: number;
}

export interface GarlandTradeShopNpc extends GarlandNpcRef {
  currencyItemId: number;
}

export interface GarlandItem {
  id: number;
  name: string;
  ilvl: number;
  ingredients: GarlandIngredient[];
  gilShopNpcs: GarlandNpcRef[];
  tradeShopNpcs: GarlandTradeShopNpc[];
}

interface RawPartialItemObj {
  n?: string;
  i?: number;
  v?: number;
  t?: number;
  s?: number;
  partials?: Array<[string, number]>;
}
interface RawNpcObj { n?: string; l?: number }
interface RawPartial {
  type?: string;
  id?: number | string;
  obj?: (RawPartialItemObj & RawNpcObj);
}
interface RawTradeListing {
  item?: Array<{ id?: string | number; amount?: number }>;
  currency?: Array<{ id?: string | number; amount?: number }>;
}
interface RawTradeShop {
  shop?: string;
  npcs?: number[];
  listings?: RawTradeListing[];
}
interface RawItem {
  id?: number;
  name?: string;
  ilvl?: number;
  ingredients?: Array<{ id?: number; amount?: number }>;
  craft?: Array<{ ingredients?: Array<{ id?: number; amount?: number }> }>;
  vendors?: number[];
  tradeShops?: RawTradeShop[];
}
interface RawResponse { item?: RawItem; partials?: RawPartial[] }

function classify(obj: RawPartialItemObj | undefined): IngredientSource {
  if (!obj) return 'other';
  if (obj.t === 1) return 'craft';
  if (obj.v === 1) return 'vendor';
  if (obj.s === 1) return 'gather';
  return 'other';
}

export function parseGarlandItem(raw: RawResponse): GarlandItem | null {
  const item = raw.item;
  if (!item || item.id == null) return null;
  const partials = raw.partials ?? [];
  const itemPartials = new Map<number, RawPartialItemObj>();
  const npcPartials = new Map<number, RawNpcObj>();
  for (const p of partials) {
    const id = typeof p.id === 'string' ? Number(p.id) : p.id;
    if (id == null || Number.isNaN(id)) continue;
    if (p.type === 'item' && p.obj) itemPartials.set(id, p.obj);
    else if (p.type === 'npc' && p.obj?.n) npcPartials.set(id, p.obj);
  }
  const ingSrc = item.craft?.[0]?.ingredients ?? item.ingredients ?? [];
  const ingredients: GarlandIngredient[] = [];
  for (const ing of ingSrc) {
    const id = ing.id;
    const amount = ing.amount;
    if (id == null || amount == null || amount <= 0) continue;
    const part = itemPartials.get(id);
    ingredients.push({
      id,
      amount,
      name: part?.n ?? `#${id}`,
      ilvl: part?.i ?? 0,
      source: classify(part),
    });
  }

  const gilShopNpcs: GarlandNpcRef[] = [];
  for (const npcId of item.vendors ?? []) {
    if (gilShopNpcs.length >= MAX_GIL_SHOP_NPCS) break;
    const partial = npcPartials.get(npcId);
    if (!partial?.n) continue;
    gilShopNpcs.push({
      id: npcId,
      name: partial.n,
      ...(partial.l != null ? { locationId: partial.l } : {}),
    });
  }

  const tradeShopNpcs: GarlandTradeShopNpc[] = [];
  const seen = new Set<string>(); // `${npcId}:${currencyItemId}`
  for (const shop of item.tradeShops ?? []) {
    for (const listing of shop.listings ?? []) {
      const currencyId = Number(listing.currency?.[0]?.id);
      if (!Number.isFinite(currencyId)) continue;
      for (const npcId of shop.npcs ?? []) {
        const key = `${npcId}:${currencyId}`;
        if (seen.has(key)) continue;
        const partial = npcPartials.get(npcId);
        if (!partial?.n) continue;
        seen.add(key);
        tradeShopNpcs.push({
          id: npcId,
          name: partial.n,
          ...(partial.l != null ? { locationId: partial.l } : {}),
          currencyItemId: currencyId,
        });
      }
    }
  }

  return {
    id: item.id,
    name: item.name ?? '',
    ilvl: item.ilvl ?? 0,
    ingredients,
    gilShopNpcs,
    tradeShopNpcs,
  };
}

export async function fetchGarlandItem(itemId: number): Promise<GarlandItem | null> {
  const res = await fetch(`${GARLAND_BASE}/${itemId}.json`);
  if (!res.ok) throw new Error(`Garland ${res.status}`);
  return parseGarlandItem(await res.json());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/garlandData.test.ts`
Expected: all tests PASS (existing 4 + new 5 = 9).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/garlandData.ts src/lib/garlandData.test.ts
git commit -m "$(cat <<'EOF'
feat(garland): parse gilShopNpcs + tradeShopNpcs from item doc

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: VendorSourceCard — accept and render NPC props

**Files:**
- Modify: `src/features/items/VendorSourceCard.tsx`
- Create: `src/features/items/VendorSourceCard.test.tsx`

- [ ] **Step 1: Write failing tests** at `src/features/items/VendorSourceCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VendorSourceCard } from './VendorSourceCard';

describe('VendorSourceCard', () => {
  it('renders NPC name + zone line when both props provided', () => {
    render(
      <VendorSourceCard
        vendorPrice={290}
        homeMarket={undefined}
        canHq={false}
        worldLabel="Phantom"
        npcName="Storm Quartermaster"
        npcZone="Limsa Lominsa Upper Decks"
      />,
    );
    expect(
      screen.getByText(/Storm Quartermaster\s*·\s*Limsa Lominsa Upper Decks/),
    ).toBeInTheDocument();
  });

  it('renders NPC name alone when zone is absent', () => {
    render(
      <VendorSourceCard
        vendorPrice={290}
        homeMarket={undefined}
        canHq={false}
        worldLabel="Phantom"
        npcName="Storm Quartermaster"
      />,
    );
    const line = screen.getByText(/Storm Quartermaster/);
    expect(line.textContent).not.toContain('·');
  });

  it('omits the NPC line entirely when npcName is absent', () => {
    const { container } = render(
      <VendorSourceCard
        vendorPrice={290}
        homeMarket={undefined}
        canHq={false}
        worldLabel="Phantom"
      />,
    );
    expect(container.textContent).not.toContain('└─');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/items/VendorSourceCard.test.tsx`
Expected: first 2 tests FAIL — the card doesn't render NPC text. Third may pass by accident, but won't after the implementation.

- [ ] **Step 3: Update the component** at `src/features/items/VendorSourceCard.tsx`. Replace the file with:

```tsx
import type { MarketItem } from '../../lib/universalis';
import { pickHighestTrustedTier } from '../../lib/priceTrust';
import { fmtGil } from '../../lib/format';
import { SectionHeader } from '../../components/SectionHeader';

interface Props {
  vendorPrice: number;
  homeMarket: MarketItem | undefined;
  canHq: boolean;
  worldLabel: string;
  npcName?: string;
  npcZone?: string;
}

export function VendorSourceCard({
  vendorPrice, homeMarket, canHq, worldLabel, npcName, npcZone,
}: Props) {
  const tier = homeMarket ? pickHighestTrustedTier(homeMarket, 'either', canHq) : null;
  const profit = tier ? tier.unit - vendorPrice : null;
  const profitClass = profit == null ? 'text-text-low'
    : profit > 0 ? 'text-jade'
    : profit < 0 ? 'text-crimson'
    : 'text-text-cream';

  return (
    <section>
      <SectionHeader label="Vendor source" compact />
      <div className="border border-border-base bg-bg-card p-4">
        <div className="text-sm">Sold by NPC: <span className="font-mono text-gold">{fmtGil(vendorPrice)}</span></div>
        {npcName && (
          <div className="font-mono text-[10px] text-text-low mt-0.5">
            └─ {npcName}{npcZone ? ` · ${npcZone}` : ''}
          </div>
        )}
        {tier && profit != null && (
          <div className="text-xs text-text-low mt-1">
            (vs. {worldLabel} {tier.isHq ? 'HQ' : 'NQ'} <span className="font-mono">{fmtGil(tier.unit)}</span>
            {' · '}
            <span className={profitClass}>profit <span className="font-mono">{fmtGil(profit)}</span>/unit</span>)
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/items/VendorSourceCard.test.tsx`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/items/VendorSourceCard.tsx src/features/items/VendorSourceCard.test.tsx
git commit -m "$(cat <<'EOF'
feat(VendorSourceCard): render optional NPC name + zone line

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: CurrencySourceCard — accept and render per-row NPC

**Files:**
- Modify: `src/features/items/CurrencySourceCard.tsx`
- Modify: `src/features/items/CurrencySourceCard.test.tsx`

- [ ] **Step 1: Add failing test** to `src/features/items/CurrencySourceCard.test.tsx`. Append inside the `describe('CurrencySourceCard', ...)` block (after the existing "hides profit comparison" test):

```tsx
  it('renders per-row NPC name + zone when the map matches the row currency itemId', () => {
    const npcMap = new Map<number, { name: string; zone?: string }>([
      [28, { name: 'Auriana', zone: 'Mor Dhona' }],
      [29, { name: 'Ironworks Hand', zone: 'Mor Dhona' }],
    ]);
    renderCard({
      offers: [poeticsOffer, mgpOffer],
      // @ts-expect-error: prop added in this task
      npcsByCurrencyItemId: npcMap,
    });
    const poeticsRow = screen.getByRole('link', { name: /^Poetics$/ }).closest('div')!;
    expect(poeticsRow.textContent).toMatch(/Auriana/);
    expect(poeticsRow.textContent).toMatch(/Mor Dhona/);
    const mgpRow = screen.getByRole('link', { name: /^MGP$/ }).closest('div')!;
    expect(mgpRow.textContent).toMatch(/Ironworks Hand/);
  });

  it('renders NPC name without zone separator when zone is absent', () => {
    const npcMap = new Map<number, { name: string; zone?: string }>([
      [28, { name: 'Auriana' }],
    ]);
    renderCard({
      offers: [poeticsOffer],
      // @ts-expect-error: prop added in this task
      npcsByCurrencyItemId: npcMap,
    });
    const row = screen.getByRole('link', { name: /^Poetics$/ }).closest('div')!;
    expect(row.textContent).toMatch(/Auriana/);
    // The row already contains '·' from other separators, so check Auriana isn't followed by ' · ' before end
    expect(row.textContent).not.toMatch(/Auriana\s+·\s+\w/);
  });

  it('omits NPC append when map is undefined', () => {
    renderCard({ offers: [poeticsOffer] });
    const row = screen.getByRole('link', { name: /^Poetics$/ }).closest('div')!;
    expect(row.textContent).not.toMatch(/Auriana/);
  });
```

Then update the `renderCard` helper at the top of the same file to forward the new optional prop. Replace the existing `renderCard` definition with:

```tsx
function renderCard(props: Partial<React.ComponentProps<typeof CurrencySourceCard>> = {}) {
  return render(
    <MemoryRouter>
      <CurrencySourceCard
        offers={props.offers ?? [poeticsOffer]}
        homeMarket={props.homeMarket}
        canHq={props.canHq ?? false}
        worldLabel={props.worldLabel ?? 'Phantom'}
        npcsByCurrencyItemId={props.npcsByCurrencyItemId}
      />
    </MemoryRouter>,
  );
}
```

(With the helper updated to pass-through, you can remove the two `@ts-expect-error` directives from the new tests above.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/items/CurrencySourceCard.test.tsx`
Expected: 2 of the 3 new tests FAIL (the "omits NPC append" test may pass since the component currently never renders NPC text). The other tests fail because props don't exist yet on the component.

- [ ] **Step 3: Update the component** at `src/features/items/CurrencySourceCard.tsx`. Replace the file with:

```tsx
import { Link } from 'react-router-dom';
import type { MarketItem } from '../../lib/universalis';
import { pickHighestTrustedTier } from '../../lib/priceTrust';
import { fmtGil } from '../../lib/format';
import { SectionHeader } from '../../components/SectionHeader';
import { HqStar } from '../../components/HqStar';
import type { CurrencyOffer } from './currencyOffers';

interface Props {
  offers: CurrencyOffer[];
  homeMarket: MarketItem | undefined;
  canHq: boolean;
  worldLabel: string;
  npcsByCurrencyItemId?: Map<number, { name: string; zone?: string }>;
}

function fmtCost(n: number): string {
  return n < 10 ? n.toFixed(2) : String(Math.round(n));
}

interface DisplayRow {
  offer: CurrencyOffer;
  tier: { unit: number; isHq: boolean } | null;
  gilPerUnit: number | null;
}

export function CurrencySourceCard({
  offers, homeMarket, canHq, worldLabel, npcsByCurrencyItemId,
}: Props) {
  if (offers.length === 0) return null;
  const tier = homeMarket ? pickHighestTrustedTier(homeMarket, 'either', canHq) : null;

  const rows: DisplayRow[] = offers.map((offer) => ({
    offer,
    tier,
    gilPerUnit: tier ? tier.unit / offer.costPerUnit : null,
  }));

  rows.sort((a, b) => {
    if (a.gilPerUnit != null && b.gilPerUnit != null) return b.gilPerUnit - a.gilPerUnit;
    if (a.gilPerUnit != null) return -1;
    if (b.gilPerUnit != null) return 1;
    return a.offer.costPerUnit - b.offer.costPerUnit;
  });

  return (
    <section>
      <SectionHeader label="Currency source" compact />
      <div className="border border-border-base bg-bg-card p-4 space-y-2">
        {rows.map(({ offer, tier, gilPerUnit }) => {
          const profitable = gilPerUnit != null && gilPerUnit > 0;
          const npc = npcsByCurrencyItemId?.get(offer.currency.itemId);
          return (
            <div key={offer.currency.id} className="flex items-baseline gap-2 flex-wrap text-sm">
              <Link
                to={`/currency-flip?currency=${offer.currency.id}`}
                className="text-aether hover:underline decoration-1 underline-offset-4"
              >
                {offer.currency.shortLabel}
              </Link>
              <span className="text-text-low">→</span>
              <span className="font-mono text-gold">{fmtCost(offer.costPerUnit)} per unit</span>
              {offer.isHq && (
                <span aria-label="HQ" className="text-gold inline-flex items-baseline"><HqStar /></span>
              )}
              {tier && gilPerUnit != null && (
                <span className="text-text-low text-xs">
                  · vs {worldLabel} {tier.isHq ? 'HQ' : 'NQ'}{' '}
                  <span className="font-mono">{fmtGil(tier.unit)}</span>
                  {' · '}
                  <span className={profitable ? 'text-jade' : 'text-text-low'}>
                    gil/unit <span className="font-mono">{Math.round(gilPerUnit)}</span>
                  </span>
                </span>
              )}
              {npc && (
                <span className="text-text-low text-xs">
                  · {npc.name}{npc.zone ? ` · ${npc.zone}` : ''}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/items/CurrencySourceCard.test.tsx`
Expected: all tests PASS (existing 5 + new 3 = 8).

- [ ] **Step 5: Commit**

```bash
git add src/features/items/CurrencySourceCard.tsx src/features/items/CurrencySourceCard.test.tsx
git commit -m "$(cat <<'EOF'
feat(CurrencySourceCard): render optional per-row NPC name + zone

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire it all up in Item.tsx

**Files:**
- Modify: `src/routes/Item.tsx`

This task has no new unit test — `Item.test.tsx` already covers the cards' presence/absence, and the new wiring is one hook call + two memos that the existing tests will load through. Verification happens in the next task via full-suite + tsc.

- [ ] **Step 1: Add the import** at the top of `src/routes/Item.tsx`. Find the existing line:

```tsx
import { useGarlandItem } from '../features/queries/useGarlandItem';
```

Add immediately after it:

```tsx
import { useGarlandLocations } from '../features/queries/useGarlandLocations';
```

- [ ] **Step 2: Call the new hook**. Find this line inside `Item()`:

```tsx
  const garland = useGarlandItem(valid ? itemId : null);
```

Add immediately after it:

```tsx
  const locations = useGarlandLocations();
```

- [ ] **Step 3: Build the two NPC memos**. Find the existing `currencyOffers` useMemo block:

```tsx
  const currencyOffers = useMemo(
    () => valid ? findItemCurrencyOffers(itemId, shop.data?.snapshot ?? { byCurrency: new Map() }) : [],
    [itemId, valid, shop.data],
  );
```

Add immediately after it:

```tsx
  const vendorNpc = useMemo(() => {
    if (!vendorPrice || !garland.data?.gilShopNpcs.length) return undefined;
    const first = garland.data.gilShopNpcs[0];
    const zone = first.locationId != null ? locations.data?.get(first.locationId) : undefined;
    return { name: first.name, zone };
  }, [vendorPrice, garland.data, locations.data]);

  const currencyNpcsByItemId = useMemo(() => {
    if (!garland.data?.tradeShopNpcs.length) return undefined;
    const map = new Map<number, { name: string; zone?: string }>();
    for (const npc of garland.data.tradeShopNpcs) {
      if (map.has(npc.currencyItemId)) continue;
      const zone = npc.locationId != null ? locations.data?.get(npc.locationId) : undefined;
      map.set(npc.currencyItemId, { name: npc.name, zone });
    }
    return map.size ? map : undefined;
  }, [garland.data, locations.data]);
```

- [ ] **Step 4: Pass the props to VendorSourceCard**. Find:

```tsx
      {vendorPrice ? (
        <VendorSourceCard
          vendorPrice={vendorPrice}
          homeMarket={phantomMarket}
          canHq={canHq}
          worldLabel={world}
        />
      ) : null}
```

Replace with:

```tsx
      {vendorPrice ? (
        <VendorSourceCard
          vendorPrice={vendorPrice}
          homeMarket={phantomMarket}
          canHq={canHq}
          worldLabel={world}
          npcName={vendorNpc?.name}
          npcZone={vendorNpc?.zone}
        />
      ) : null}
```

- [ ] **Step 5: Pass the props to CurrencySourceCard**. Find:

```tsx
      {currencyOffers.length > 0 && (
        <CurrencySourceCard
          offers={currencyOffers}
          homeMarket={phantomMarket}
          canHq={canHq}
          worldLabel={world}
        />
      )}
```

Replace with:

```tsx
      {currencyOffers.length > 0 && (
        <CurrencySourceCard
          offers={currencyOffers}
          homeMarket={phantomMarket}
          canHq={canHq}
          worldLabel={world}
          npcsByCurrencyItemId={currencyNpcsByItemId}
        />
      )}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Run the existing Item route tests**

Run: `npx vitest run src/routes/Item.test.tsx`
Expected: all existing tests PASS (the new props are optional and missing data degrades to undefined — no test fixtures need updating).

- [ ] **Step 8: Commit**

```bash
git add src/routes/Item.tsx
git commit -m "$(cat <<'EOF'
feat(item-route): wire NPC name + zone into source cards

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Full suite + final verification

**Files:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: 641 tests pass (was 626; this plan adds 4 + 5 + 3 + 3 = +15). The exact count is approximate; what matters is **zero failures**.

If the count differs by more than ±2 from 641: re-read each task's "Expected" count and reconcile.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Report**

Report back the exact `Tests` line from vitest output and confirm tsc was clean. No commit — this task is verification only.

---

## Notes for the implementer

- **Garland location IDs come as numbers** in the per-item doc (e.g. `"l": 28`) but as **string keys** in the global `locationIndex` (e.g. `"28"`). Task 1's `parseGarlandLocations` handles this with `Number(key)`. Task 3's parser uses the number directly from `partial.l`.
- **Currency IDs in `tradeShops.listings[].currency[0].id` are strings** (e.g. `"28"`). Task 3 coerces with `Number()` and skips `NaN`.
- **Same NPC + same currency across multiple listings**: the parser dedupes by `(npcId, currencyItemId)` so per-currency NPC lookups give one stable result.
- The `npcPartials` Map type changed from `Map<number, string>` to `Map<number, RawNpcObj>` in Task 3 to preserve `l` alongside `n`. No existing consumers read the old type — only the parser internals use it.
- **No `Item.test.tsx` changes required** in Task 6 because both card-prop additions are optional with undefined defaults. The existing tests don't render the new NPC text (their fixtures don't stub the new Garland fields), and they shouldn't.
- **Manual smoke test (optional, recommended)**: after Task 7, run `npm run dev` and visit `/item/4566` (Linen Cloth — gil shop) and `/item/41671` (a currency-shop item if you have one; otherwise pick any item that already shows a Currency Source card). Confirm the NPC line renders. If Garland's CORS is acting up, both lines simply won't render — that's the expected fallback.
