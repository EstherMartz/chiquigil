# CurrencySourceCard on `/item/:id` — Design Spec

**Status:** Approved 2026-05-18
**Phase:** /item/:id detail page follow-up (currency vendor source visibility)
**Depends on:** Currency Optimizer P4 (shipped 2026-05-17), NPC Vendor Flip P2-3 (shipped 2026-05-17 — `VendorSourceCard` is the structural mirror)

---

## Goal

Show "available from special-currency vendors" on the single-item detail page (`/item/:id`), mirroring the existing `VendorSourceCard`. When an item is sold by one or more special-shop vendors (Poetics, Scrips, MGP, Wolf Marks, Bicolor, etc.), render a section with one row per currency listing the per-unit currency cost, gil/currency-unit ratio against home market, and a clickable currency name that jumps to `/currency-flip?currency=<id>`.

## Non-goals

- No "currency advisor" suggesting which currency to spend (player decides; the card is informational).
- No multi-currency optimization or basket-pricing.
- No persistence of preferences — purely a read-only display.
- No changes to the `/currency-flip` route or the currency catalog.

## Architecture

A pure compute module + a presentational component, slotted into `Item.tsx` next to `VendorSourceCard`.

```
                              Item.tsx
                                  │
              ┌──────────────────┴──────────────────┐
              ▼                                       ▼
   useSpecialShopSnapshot                  findItemCurrencyOffers(id, snap)
              │                                       │
              └─────────────────┬─────────────────────┘
                                ▼
                    offers: CurrencyOffer[]
                                │
                                ▼
               <CurrencySourceCard offers={offers}
                                   homeMarket={phantomMarket}
                                   canHq={canHq}
                                   worldLabel={world} />
```

## Types

```ts
// src/features/items/currencyOffers.ts
import type { CurrencyDef } from '../../lib/currencies';
import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';

export interface CurrencyOffer {
  currency: CurrencyDef;
  costPerUnit: number;
  isHq: boolean;          // vendor delivers HQ (from ShopEntry.isHq)
}

export function findItemCurrencyOffers(
  itemId: number,
  shopSnapshot: SpecialShopSnapshot,
): CurrencyOffer[];
```

## `findItemCurrencyOffers` behavior

For each `[currencyId, entries]` pair in `shopSnapshot.byCurrency.entries()`:
1. Filter `entries` where `entry.itemId === itemId`.
2. If none, skip the bucket.
3. Among matches, pick the one with the lowest `costPerUnit`. Its `isHq` flag is preserved.
4. Look up `getCurrencyById(currencyId)`. If undefined (defensive), skip the bucket silently.
5. Push `{ currency, costPerUnit, isHq }` onto `out`.

Return `out` sorted by `costPerUnit` ascending (cheapest currency cost first). The component re-sorts using market data when present — but a pure ascending sort makes the function deterministic and easy to assert in tests.

## `CurrencySourceCard` behavior

```ts
interface Props {
  offers: CurrencyOffer[];
  homeMarket: MarketItem | undefined;
  canHq: boolean;
  worldLabel: string;
}
```

- If `offers.length === 0`, return `null`.
- Compute the home-market trusted sale tier via `pickHigherTrustedTier(homeMarket, canHq)` (function copied verbatim from `VendorSourceCard.tsx`; both will be deduped in the broader `pickTrustedSaleTier` refactor — out of scope).
- For each offer, compute `gilPerUnit = tier.unit / offer.costPerUnit` if tier exists, else `null`.
- Sort offers for rendering:
  - **At least one offer has a market tier:** sort by `gilPerUnit DESC`, with `null`-tier offers at the bottom in `costPerUnit ASC` order.
  - **No market tier on any row** (and no `homeMarket`): sort by `costPerUnit ASC`.
- Render `<SectionHeader label="Currency source" compact />` wrapping a single `border border-border-base bg-bg-card p-4` div containing one row per offer (line-spaced).

Per-row layout:

```
<Link to="/currency-flip?currency=<id>" className="text-aether hover:underline">
  {shortLabel}
</Link>
{' → '}
<span className="font-mono">{fmtCost(costPerUnit)} per unit</span>
{isHq && <span aria-label="HQ"><HqStar /></span>}
{tier && (
  <span className="text-text-low text-xs">
    {' · vs '}{worldLabel} {tier.isHq ? 'HQ' : 'NQ'}{' '}
    <span className="font-mono">{fmtGil(tier.unit)}</span>
    {' · '}
    <span className={gilPerUnit > 0 ? 'text-jade' : 'text-text-low'}>
      gil/unit <span className="font-mono">{Math.round(gilPerUnit)}</span>
    </span>
  </span>
)}
```

`fmtCost(n) = n < 10 ? n.toFixed(2) : Math.round(n).toString()` — same convention as the shopping-list info-line.

If no tier exists for the home market, the row shows only `<currency> → <cost> per unit` (no profit comparison).

## Item.tsx wiring

Add at the existing hook block (after `const vendors = useVendorShopSnapshot();` around line 65):

```ts
const shop = useSpecialShopSnapshot();
const currencyOffers = useMemo(
  () => valid ? findItemCurrencyOffers(itemId, shop.data?.snapshot ?? { byCurrency: new Map() }) : [],
  [itemId, valid, shop.data],
);
```

Add render directly after the existing `<VendorSourceCard>` block (around line 122):

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

The card is fully independent from `VendorSourceCard` — an item can render both, either, or neither depending on what's in the catalogs.

## Edge cases

- **Snapshot loading:** Hook returns `data: undefined` initially. `useMemo` falls back to `{ byCurrency: new Map() }` so `currencyOffers` is `[]` and the card hides cleanly.
- **Same item in same bucket with different deals** (e.g., HQ 1-pack and NQ 99-pack): pick lowest `costPerUnit`. May pick an HQ-bundle row if cheaper per unit. Acceptable — `costPerUnit` is the user-facing comparison metric.
- **Same item in multiple buckets** (e.g., Poetics + MGP): one row per bucket. No deduplication.
- **Malformed currency id** (a bucket key not in the `CURRENCIES` catalog): silently skipped. Defensive guard against catalog drift.
- **No home market data** (item not yet fetched by Universalis or no listings): card still renders, profit comparison just hidden. Cost-per-currency is shown either way.
- **No trusted tier** (item has prices but fails the trust filters in `pickHigherTrustedTier`): same as above — card renders, profit hidden.
- **HQ-delivery on a non-canHq item** (vendor sells "HQ" version of an item that's NQ-only in the snapshot): preserve `offer.isHq: true` but show HQ glyph regardless of `canHq`. The vendor's claim wins for display; the comparison uses NQ tier since canHq=false in pickHigherTrustedTier.

## Testing

**`src/features/items/currencyOffers.test.ts` (~6 tests):**
1. Item not in any bucket → `[]`
2. Item in one bucket with one matching entry → single offer with correct currency def, costPerUnit, isHq
3. Item in one bucket with three matching entries → picks lowest costPerUnit; preserves that entry's isHq flag
4. Item in three different buckets → three offers, sorted by costPerUnit ascending
5. HQ-delivery entry: `isHq: true` propagates to offer
6. Malformed currency id (not in CURRENCIES catalog): bucket silently skipped

**`src/features/items/CurrencySourceCard.test.tsx` (~5 tests):**
1. Renders nothing when `offers.length === 0`
2. Renders one row per offer; currency `shortLabel` is a `Link` to `/currency-flip?currency=<id>`
3. HQ glyph rendered on rows where `offer.isHq` is true; absent otherwise
4. Profit comparison rendered when `homeMarket` exists AND tier is trusted: gil/unit text + `text-jade` class for positive ratios
5. Profit comparison hidden when no trusted tier: cost line still shown, no `gil/unit` text

**`src/routes/Item.test.tsx` extensions (~2 tests):**
1. CurrencySourceCard appears when `useSpecialShopSnapshot` mock provides an offer for the item id
2. CurrencySourceCard hidden when shop snapshot is empty (the existing test default)

The existing test already mocks `useVendorShopSnapshot`; add a structurally identical mock for `useSpecialShopSnapshot`. Default mock returns empty `byCurrency` Map so existing test assertions pass unchanged.

**Total new tests:** ~13. Suite: 602 → ~615.

## File list

**Create:**
- `src/features/items/currencyOffers.ts`
- `src/features/items/currencyOffers.test.ts`
- `src/features/items/CurrencySourceCard.tsx`
- `src/features/items/CurrencySourceCard.test.tsx`

**Modify:**
- `src/routes/Item.tsx` (add hook + memo + render)
- `src/routes/Item.test.tsx` (add mock + 2 assertions)

No changes to `currencies.ts`, `specialShopSnapshot.ts`, `useSpecialShopSnapshot`, `VendorSourceCard`, or any other feature.

## Phased delivery (single PR, 4 commits)

1. **`findItemCurrencyOffers`** + 6 tests
2. **`CurrencySourceCard`** component + 5 tests (renders against fixture offers, no Item.tsx integration yet)
3. **`Item.tsx` wiring** + `Item.test.tsx` mock + 2 new assertions
4. **Final verification** — suite + tsc + browser smoke test

Each commit ships independently passing tests + tsc clean.

## Known follow-up (out of scope)

- The duplicated `pickHigherTrustedTier` (now in `VendorSourceCard`, `CurrencySourceCard`, `runVendorFlip`, `runCurrencyFlip`) is overdue for extraction into a shared util in `src/lib/priceTrust.ts`. The "first-match" variant in `runMaterialFlip` is the wrinkle — that refactor needs to expose both modes as options. Deferred to a dedicated refactor task.
