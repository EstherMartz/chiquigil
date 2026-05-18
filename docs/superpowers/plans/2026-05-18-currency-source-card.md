# CurrencySourceCard on `/item/:id` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show "available from special-currency vendors" on `/item/:id` with one row per matching currency (cost/unit + gil/unit ratio vs home market + clickable currency name → `/currency-flip?currency=<id>`).

**Architecture:** Pure compute `findItemCurrencyOffers` derives the list of currencies a given item is sold by. A new `CurrencySourceCard` component (mirror of `VendorSourceCard`) renders one row per offer. `Item.tsx` wires `useSpecialShopSnapshot` next to the existing `useVendorShopSnapshot` and renders the card after `VendorSourceCard`.

**Tech Stack:** TypeScript, React, TanStack Query (existing `useSpecialShopSnapshot`), Vitest + React Testing Library, Tailwind, `react-router-dom`.

**IMPORTANT GIT SAFETY RULE for implementers:** Do NOT run `git checkout`, `git reset`, `git stash`, `git clean`, `git rebase`, `git restore`, `git switch`. Only `git add`, `git commit`, `git log`, `git diff`, `git show`, `git status`, `git cat-file`, `git fsck` are allowed. The repo has unrelated modified files from prior session work — only stage the files each task touches.

**Commit trailer (every commit):**
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## File Structure

**Create:**
- `src/features/items/currencyOffers.ts` — `findItemCurrencyOffers` pure function + `CurrencyOffer` type
- `src/features/items/currencyOffers.test.ts` — 6 tests
- `src/features/items/CurrencySourceCard.tsx` — presentational component (copies `pickHigherTrustedTier` from `VendorSourceCard.tsx`)
- `src/features/items/CurrencySourceCard.test.tsx` — 5 tests

**Modify:**
- `src/routes/Item.tsx` — add `useSpecialShopSnapshot` hook call + `currencyOffers` memo + render `<CurrencySourceCard>` after the existing `<VendorSourceCard>` block
- `src/routes/Item.test.tsx` — add `clearSpecialShopCache()` to `beforeEach` cleanup; add 2 new tests using `putCachedSpecialShop` to seed fixtures

No changes outside these touch points.

---

## Task 1: findItemCurrencyOffers pure compute

**Files:**
- Create: `src/features/items/currencyOffers.ts`
- Create: `src/features/items/currencyOffers.test.ts`

Reference:
- `SpecialShopSnapshot.byCurrency` is `Map<CurrencyId, ShopEntry[]>` per `src/lib/specialShopSnapshot.ts`. `ShopEntry = { itemId, receiveQty, costPerUnit, isHq }`.
- `CurrencyDef` and `getCurrencyById` from `src/lib/currencies.ts`.

- [ ] **Step 1: Write the failing test** at `src/features/items/currencyOffers.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { findItemCurrencyOffers } from './currencyOffers';
import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
import type { CurrencyId } from '../../lib/currencies';

function mkShop(entries: Partial<Record<CurrencyId | string, Array<{ itemId: number; costPerUnit: number; receiveQty?: number; isHq?: boolean }>>>): SpecialShopSnapshot {
  const byCurrency = new Map();
  for (const [cur, list] of Object.entries(entries)) {
    byCurrency.set(cur, list!.map((e) => ({
      itemId: e.itemId, receiveQty: e.receiveQty ?? 1, costPerUnit: e.costPerUnit, isHq: e.isHq ?? false,
    })));
  }
  return { byCurrency };
}

describe('findItemCurrencyOffers', () => {
  it('returns [] when item is not in any bucket', () => {
    const shop = mkShop({ poetics: [{ itemId: 200, costPerUnit: 10 }] });
    expect(findItemCurrencyOffers(100, shop)).toEqual([]);
  });

  it('returns one offer when item is in one bucket with one matching entry', () => {
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10 }] });
    const offers = findItemCurrencyOffers(100, shop);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toEqual({
      currency: { id: 'poetics', label: 'Allagan Tomestone of Poetics', shortLabel: 'Poetics', itemId: 28 },
      costPerUnit: 10,
      isHq: false,
    });
  });

  it('picks the lowest costPerUnit when one bucket has multiple matching entries (and preserves that entry isHq)', () => {
    const shop = mkShop({ poetics: [
      { itemId: 100, costPerUnit: 50, isHq: false },
      { itemId: 100, costPerUnit: 10, isHq: true },   // cheapest
      { itemId: 100, costPerUnit: 25, isHq: false },
    ]});
    const offers = findItemCurrencyOffers(100, shop);
    expect(offers).toHaveLength(1);
    expect(offers[0].costPerUnit).toBe(10);
    expect(offers[0].isHq).toBe(true);
  });

  it('returns one offer per matching currency bucket, sorted by costPerUnit ascending', () => {
    const shop = mkShop({
      poetics: [{ itemId: 100, costPerUnit: 50 }],
      mgp: [{ itemId: 100, costPerUnit: 5000 }],
      whiteCrafter: [{ itemId: 100, costPerUnit: 5 }],
    });
    const offers = findItemCurrencyOffers(100, shop);
    expect(offers.map((o) => o.currency.id)).toEqual(['whiteCrafter', 'poetics', 'mgp']);
  });

  it('preserves isHq flag from the chosen entry', () => {
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10, isHq: true }] });
    expect(findItemCurrencyOffers(100, shop)[0].isHq).toBe(true);
  });

  it('silently skips a bucket whose currency id is not in the CURRENCIES catalog (defensive)', () => {
    const shop = mkShop({
      bogus: [{ itemId: 100, costPerUnit: 5 }],
      poetics: [{ itemId: 100, costPerUnit: 10 }],
    });
    const offers = findItemCurrencyOffers(100, shop);
    expect(offers).toHaveLength(1);
    expect(offers[0].currency.id).toBe('poetics');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/items/currencyOffers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement at `src/features/items/currencyOffers.ts`**

```ts
import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
import { getCurrencyById, type CurrencyDef } from '../../lib/currencies';

export interface CurrencyOffer {
  currency: CurrencyDef;
  costPerUnit: number;
  isHq: boolean;
}

export function findItemCurrencyOffers(
  itemId: number,
  shopSnapshot: SpecialShopSnapshot,
): CurrencyOffer[] {
  const out: CurrencyOffer[] = [];
  for (const [currencyId, entries] of shopSnapshot.byCurrency.entries()) {
    let best: { costPerUnit: number; isHq: boolean } | null = null;
    for (const entry of entries) {
      if (entry.itemId !== itemId) continue;
      if (!best || entry.costPerUnit < best.costPerUnit) {
        best = { costPerUnit: entry.costPerUnit, isHq: entry.isHq };
      }
    }
    if (!best) continue;
    const currency = getCurrencyById(currencyId);
    if (!currency) continue;
    out.push({ currency, costPerUnit: best.costPerUnit, isHq: best.isHq });
  }
  out.sort((a, b) => a.costPerUnit - b.costPerUnit);
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/features/items/currencyOffers.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + full suite smoke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; all pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/items/currencyOffers.ts src/features/items/currencyOffers.test.ts
git commit -m "feat(items): findItemCurrencyOffers pure compute

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: CurrencySourceCard component

**Files:**
- Create: `src/features/items/CurrencySourceCard.tsx`
- Create: `src/features/items/CurrencySourceCard.test.tsx`

Reference pattern:
- `src/features/items/VendorSourceCard.tsx` — copy the `pickHigherTrustedTier` function verbatim (it'll be deduped in the broader pickTrustedSaleTier refactor — out of scope here).
- Existing `MIN_RECENT_SALES`, `MAX_LISTING_RATIO` from `src/lib/priceTrust.ts`.
- `<SectionHeader label="..." compact />` from `src/components/SectionHeader`.
- `<HqStar />` from `src/components/HqStar`.
- `fmtGil` from `src/lib/format`.

- [ ] **Step 1: Write the failing test** at `src/features/items/CurrencySourceCard.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CurrencySourceCard } from './CurrencySourceCard';
import type { CurrencyOffer } from './currencyOffers';
import type { MarketItem } from '../../lib/universalis';

function mkMarket(opts: Partial<MarketItem> = {}): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0,
    lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...opts,
  };
}

const poeticsOffer: CurrencyOffer = {
  currency: { id: 'poetics', label: 'Allagan Tomestone of Poetics', shortLabel: 'Poetics', itemId: 28 },
  costPerUnit: 10, isHq: false,
};
const mgpOffer: CurrencyOffer = {
  currency: { id: 'mgp', label: 'MGP', shortLabel: 'MGP', itemId: 29 },
  costPerUnit: 50000, isHq: true,
};

function renderCard(props: Partial<React.ComponentProps<typeof CurrencySourceCard>> = {}) {
  return render(
    <MemoryRouter>
      <CurrencySourceCard
        offers={props.offers ?? [poeticsOffer]}
        homeMarket={props.homeMarket}
        canHq={props.canHq ?? false}
        worldLabel={props.worldLabel ?? 'Phantom'}
      />
    </MemoryRouter>,
  );
}

describe('CurrencySourceCard', () => {
  it('renders nothing when offers is empty', () => {
    const { container } = renderCard({ offers: [] });
    expect(container.textContent).toBe('');
  });

  it('renders one row per offer; currency shortLabel links to /currency-flip?currency=<id>', () => {
    renderCard({ offers: [poeticsOffer, mgpOffer] });
    const poeticsLink = screen.getByRole('link', { name: /^Poetics$/ });
    expect(poeticsLink.getAttribute('href')).toBe('/currency-flip?currency=poetics');
    const mgpLink = screen.getByRole('link', { name: /^MGP$/ });
    expect(mgpLink.getAttribute('href')).toBe('/currency-flip?currency=mgp');
  });

  it('renders HQ glyph on rows where offer.isHq is true', () => {
    renderCard({ offers: [poeticsOffer, mgpOffer] });
    const poeticsRow = screen.getByRole('link', { name: /^Poetics$/ }).closest('div')!;
    const mgpRow = screen.getByRole('link', { name: /^MGP$/ }).closest('div')!;
    expect(poeticsRow.querySelector('[aria-label="HQ"]')).toBeNull();
    expect(mgpRow.querySelector('[aria-label="HQ"]')).not.toBeNull();
  });

  it('renders profit comparison when homeMarket has a trusted tier', () => {
    const homeMarket = mkMarket({
      minNQ: 2000, medianNQ: 2000, recentSalesNQ: 20,
    });
    renderCard({ offers: [poeticsOffer], homeMarket, canHq: false });
    // costPerUnit 10, salePrice 2000 → gilPerUnit 200
    expect(screen.getByText(/Phantom\s+NQ/i)).toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();
    expect(screen.getByText(/gil\/unit/i)).toBeInTheDocument();
  });

  it('hides profit comparison when no trusted tier exists', () => {
    const homeMarket = mkMarket({});  // no minNQ/minHQ → no tier
    renderCard({ offers: [poeticsOffer], homeMarket, canHq: false });
    expect(screen.queryByText(/gil\/unit/i)).not.toBeInTheDocument();
    // Cost-line still present:
    expect(screen.getByText(/10\s+per unit/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/items/CurrencySourceCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement at `src/features/items/CurrencySourceCard.tsx`**

```tsx
import { Link } from 'react-router-dom';
import type { MarketItem } from '../../lib/universalis';
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
import { fmtGil } from '../../lib/format';
import { SectionHeader } from '../../components/SectionHeader';
import { HqStar } from '../../components/HqStar';
import type { CurrencyOffer } from './currencyOffers';

interface Props {
  offers: CurrencyOffer[];
  homeMarket: MarketItem | undefined;
  canHq: boolean;
  worldLabel: string;
}

function pickHigherTrustedTier(m: MarketItem, canHq: boolean): { unit: number; isHq: boolean } | null {
  const candidates: Array<{ rawMin: number | null; median: number | null; recent: number; isHq: boolean }> = [];
  if (canHq) candidates.push({ rawMin: m.minHQ, median: m.medianHQ, recent: m.recentSalesHQ, isHq: true });
  candidates.push({ rawMin: m.minNQ, median: m.medianNQ, recent: m.recentSalesNQ, isHq: false });
  let best: { unit: number; isHq: boolean } | null = null;
  for (const c of candidates) {
    if (c.rawMin == null) continue;
    if (c.recent < MIN_RECENT_SALES) continue;
    if (c.median == null) continue;
    if (c.rawMin > c.median * MAX_LISTING_RATIO) continue;
    const unit = Math.min(c.rawMin, c.median);
    if (!best || unit > best.unit) best = { unit, isHq: c.isHq };
  }
  return best;
}

function fmtCost(n: number): string {
  return n < 10 ? n.toFixed(2) : String(Math.round(n));
}

interface DisplayRow {
  offer: CurrencyOffer;
  tier: { unit: number; isHq: boolean } | null;
  gilPerUnit: number | null;
}

export function CurrencySourceCard({ offers, homeMarket, canHq, worldLabel }: Props) {
  if (offers.length === 0) return null;
  const tier = homeMarket ? pickHigherTrustedTier(homeMarket, canHq) : null;

  const rows: DisplayRow[] = offers.map((offer) => ({
    offer,
    tier,
    gilPerUnit: tier ? tier.unit / offer.costPerUnit : null,
  }));

  // Sort: rows with a gil/unit ratio first (descending), then rows without (by costPerUnit ascending).
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
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/features/items/CurrencySourceCard.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + full suite smoke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; all pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/items/CurrencySourceCard.tsx src/features/items/CurrencySourceCard.test.tsx
git commit -m "feat(items): CurrencySourceCard one row per currency the item is sold by

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire CurrencySourceCard into Item.tsx + extend Item.test.tsx

**Files:**
- Modify: `src/routes/Item.tsx`
- Modify: `src/routes/Item.test.tsx`

The existing `Item.test.tsx` uses real IDB cache + stubbed fetch (NOT `vi.mock`). To mock special-shop data, we use `putCachedSpecialShop` (from `src/lib/recipeCache.ts`) the same way the existing tests use `putCachedItems` / `putCachedRecipeSnapshot`. Add a `clearSpecialShopCache()` call to the `beforeEach` cleanup so tests don't leak fixtures.

### Step 1: Update `src/routes/Item.tsx`

- [ ] **Step 1a: Add imports**

In `src/routes/Item.tsx`, add to the existing import block (near the other `use*Snapshot` hook imports around line 10):

```tsx
import { useSpecialShopSnapshot } from '../features/queries/useSpecialShopSnapshot';
```

And alongside the `VendorSourceCard` import (line 12):

```tsx
import { CurrencySourceCard } from '../features/items/CurrencySourceCard';
import { findItemCurrencyOffers } from '../features/items/currencyOffers';
```

- [ ] **Step 1b: Add hook call + memo**

Inside `export default function Item()`, immediately after `const vendors = useVendorShopSnapshot();` (around line 65), add:

```tsx
const shop = useSpecialShopSnapshot();
const currencyOffers = useMemo(
  () => valid ? findItemCurrencyOffers(itemId, shop.data?.snapshot ?? { byCurrency: new Map() }) : [],
  [itemId, valid, shop.data],
);
```

- [ ] **Step 1c: Add render**

Inside the JSX, immediately after the existing `<VendorSourceCard ... />` block (around line 122), add:

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

- [ ] **Step 1d: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Step 2: Update `src/routes/Item.test.tsx`

- [ ] **Step 2a: Add cache import + cleanup**

Add `clearSpecialShopCache` and `putCachedSpecialShop` to the existing import from `recipeCache` (around line 8):

```tsx
import {
  clearItemCache, clearRecipeSnapshot, putCachedItems, putCachedRecipeSnapshot,
  clearMarketCache, clearGatheringCatalog,
  clearSpecialShopCache, putCachedSpecialShop,
} from '../lib/recipeCache';
```

Add `await clearSpecialShopCache();` to the `beforeEach` (after `await clearGatheringCatalog();`):

```tsx
beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  await clearItemCache();
  await clearRecipeSnapshot();
  await clearMarketCache();
  await clearGatheringCatalog();
  await clearSpecialShopCache();
  _resetMarketCacheForTests();
  vi.restoreAllMocks();
});
```

- [ ] **Step 2b: Add 2 new tests** at the end of the `describe('Item route', ...)` block, before the closing `});`:

```tsx
  it('renders the CurrencySourceCard when the item is sold by a special-shop currency', async () => {
    await putCachedItems([
      { id: 5057, name: 'Earth Shard', sc: 58, ui: 0, ilvl: 1, canHq: false },
    ]);
    await putCachedRecipeSnapshot([]);
    await putCachedSpecialShop({
      byCurrency: new Map([
        ['poetics', [
          { itemId: 5057, receiveQty: 1, costPerUnit: 10, isHq: false },
        ]],
      ]),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    render(withProviders('/item/5057'));

    await waitFor(() => {
      expect(screen.getByText(/currency source/i)).toBeInTheDocument();
    });
    const poeticsLink = screen.getByRole('link', { name: /^Poetics$/ });
    expect(poeticsLink.getAttribute('href')).toBe('/currency-flip?currency=poetics');
  });

  it('hides the CurrencySourceCard when the item is not in the special-shop catalog', async () => {
    await putCachedItems([
      { id: 5057, name: 'Earth Shard', sc: 58, ui: 0, ilvl: 1, canHq: false },
    ]);
    await putCachedRecipeSnapshot([]);
    // No putCachedSpecialShop call — catalog is empty.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    render(withProviders('/item/5057'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /earth shard/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/currency source/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the route tests**

Run: `npx vitest run src/routes/Item.test.tsx`
Expected: ALL existing tests still PASS + the 2 new ones PASS.

- [ ] **Step 4: Full suite + tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS; tsc clean.

If a pre-existing flake re-appears in `Item.test.tsx` unrelated to these changes, note it; otherwise proceed.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Item.tsx src/routes/Item.test.tsx
git commit -m "feat(items): wire CurrencySourceCard into /item/:id route + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Final verification

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: ALL tests pass. Baseline before this branch was 602; this plan adds 13 new tests (Task 1: 6, Task 2: 5, Task 3: 2). Expected total ≈ 615.

- [ ] **Step 3: Browser smoke test**

Run: `npm run dev`

In the browser:
1. Visit `/item/<id>` for an item known to be sold by a special-shop vendor.
   - **Quick path:** Visit `/currency-flip`, click "Run scan" with Poetics selected, click an item's name in the results table — that navigates to `/item/<id>` for a confirmed currency-bearing item.
2. Verify the "Currency source" section appears below "Vendor source" (or in place of it if no NPC gilshop entry).
3. Each currency row shows `<shortLabel> → <cost> per unit`. The shortLabel is a link (hover underlines it).
4. Clicking the link navigates to `/currency-flip?currency=<id>` and the currency picker pre-selects that currency.
5. If the item also has trusted home-market data, each row appends `· vs <worldLabel> <NQ|HQ> <price> · gil/unit <ratio>`; ratio shows in jade when positive.
6. Visit an item NOT sold by any currency vendor (e.g., a basic crafting material). Section is hidden.
7. Visit an item with multiple currency listings (e.g., a Bicolor Gem item that also has Wolf Marks). Multiple rows appear.

- [ ] **Step 4: Done — no commit for verification**

If browser smoke reveals issues, file follow-ups; otherwise the feature ships clean.

---

## Notes for the implementer

- **`pickHigherTrustedTier` is intentionally duplicated** — this is the third copy (after `VendorSourceCard.tsx` and `runVendorFlip.ts` / `runCurrencyFlip.ts`). The broader pickTrustedSaleTier shared-util refactor is on the deferred backlog. Don't extract it here; that's a separate scoped change.
- **`shop.data?.snapshot` not `shop.data`:** `useSpecialShopSnapshot` returns `{ snapshot, updatedAt }`. The actual SpecialShopSnapshot is nested under `.snapshot`.
- **The `fmtCost` helper** is defined locally in `CurrencySourceCard.tsx`. The same logic appears in the shopping-list info-line. Don't dedupe in this task.
- **Test data hint:** Earth Shard (id 5057) is in the existing tests already. If it's NOT actually sold by Poetics in the live SpecialShop catalog, that's fine for the test — we're seeding fixtures via `putCachedSpecialShop`, not relying on live data. The test asserts component behavior, not catalog truth.
- **Catalog drift edge case:** If a future special-shop entry references an itemId that's not in the item snapshot, `findItemCurrencyOffers` is called per-id from `Item.tsx`, so it'll work for any valid item id. The catalog-side gate is in `surveyIngredients` (shopping list), not here.
