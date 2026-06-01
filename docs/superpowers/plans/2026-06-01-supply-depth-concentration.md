# Supply Depth + Market Concentration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a supply-depth histogram and a seller-concentration (HHI) risk indicator to `/item/:id`, both fed by enriching the cached market listings with per-listing quantity and seller name.

**Architecture:** One data-layer change (`parseMarketResponse` keeps quantity + seller and stops truncating to 10 rows) unlocks two pure-compute modules (`depthBuckets`, `concentrationHHI`) and two presentational blocks mounted on the item page, scoped to the home-world book (`phantomMarket.worldListings`). No change to the verdict pipeline.

**Tech Stack:** TypeScript, React 18, Vitest + Testing Library, Tailwind. CSS-bar histograms (no recharts — deterministic and test-friendly). Bundled API regenerated with esbuild via `npm run build:api`.

Spec: `docs/superpowers/specs/2026-06-01-supply-depth-concentration-design.md`

---

### Task 1: Enrich `WorldListing` + parser with quantity & seller

**Files:**
- Modify: `src/lib/universalis.ts`
- Test: `src/lib/universalis.test.ts`

Fields are **optional** so the ~54 files that build `worldListings` literals stay untouched. Compute modules default them.

- [ ] **Step 1: Update the failing tests first**

In `src/lib/universalis.test.ts`, update the `parseMarketResponse` "extracts min NQ…" expectation so each `worldListings` entry includes the new fields, and update the kept-rows test. Replace the `worldListings` array in the first test (around line 58-62) with:

```ts
      worldListings: [
        { world: 'Phantom', price: 50, hq: false, quantity: 1, seller: '' },
        { world: 'Phantom', price: 200, hq: true, quantity: 1, seller: '' },
        { world: 'Lich', price: 180, hq: true, quantity: 1, seller: '' },
      ],
```

Add a new test asserting quantity/seller are read when present. Insert after that first test's closing `});`:

```ts
  it('reads per-listing quantity and seller name when present', () => {
    const raw = {
      items: {
        '101': {
          listings: [
            { hq: false, pricePerUnit: 50, worldName: 'Phantom', quantity: 3, retainerName: 'Alice' },
            { hq: false, pricePerUnit: 60, worldName: 'Phantom', quantity: 1, retainerName: 'Bob' },
          ],
          recentHistory: [],
          regularSaleVelocity: 0,
          lastUploadTime: 0,
        },
      },
    };
    const out = parseMarketResponse(raw);
    expect(out['101'].worldListings).toEqual([
      { world: 'Phantom', price: 50, hq: false, quantity: 3, seller: 'Alice' },
      { world: 'Phantom', price: 60, hq: false, quantity: 1, seller: 'Bob' },
    ]);
  });
```

Update the "keeps only the cheapest 10 rows" test (around line 68-87). With `LISTINGS_KEPT` now 50, 14 rows are all kept:

```ts
  it('uses the true listingsCount and keeps up to LISTINGS_CAP rows', () => {
    const listings = Array.from({ length: 14 }, (_, i) => ({
      hq: false, pricePerUnit: 100 + i, worldName: 'Phantom',
    }));
    const raw = {
      items: {
        '300': {
          listings,
          recentHistory: [],
          regularSaleVelocity: 1,
          lastUploadTime: 0,
          listingsCount: 47, // true total (capped at the fetch cap)
        },
      },
    };
    const out = parseMarketResponse(raw);
    expect(out['300'].listingCount).toBe(47);          // true total
    expect(out['300'].worldListings).toHaveLength(14);  // all rows kept (< cap)
    expect(out['300'].minNQ).toBe(100);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/universalis.test.ts`
Expected: FAIL — parser still emits 3-field listings / truncates to 10.

- [ ] **Step 3: Implement the parser change**

In `src/lib/universalis.ts`:

Update the `WorldListing` interface (line 6):

```ts
export interface WorldListing { world: string; price: number; hq: boolean; quantity?: number; seller?: string }
```

Update `RawListing` (line 38):

```ts
interface RawListing { hq: boolean; pricePerUnit: number; worldName?: string; quantity?: number; retainerName?: string }
```

Update `LISTINGS_KEPT` (line 36) to keep the whole fetched book:

```ts
/** Listing rows kept in the cache (cheapest-first) for the cross-world + depth views. */
const LISTINGS_KEPT = LISTINGS_CAP;
```

Update the `worldListings` mapping in `parseMarketResponse` (lines 102-106):

```ts
      worldListings: listings.slice(0, LISTINGS_KEPT).map((l) => ({
        world: l.worldName ?? '',
        price: l.pricePerUnit,
        hq: l.hq,
        quantity: l.quantity ?? 1,
        seller: l.retainerName ?? '',
      })),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/universalis.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify no other test broke from the type change**

Run: `npx vitest run`
Expected: PASS (optional fields mean existing literals still type-check and existing `toEqual` assertions that omit the new fields still match, since the parser is the only producer that adds them).

- [ ] **Step 6: Commit**

```bash
git add src/lib/universalis.ts src/lib/universalis.test.ts
git commit -m "feat(market): cache per-listing quantity + seller, keep full book"
```

---

### Task 2: `depthBuckets` pure compute

**Files:**
- Create: `src/features/items/depth.ts`
- Test: `src/features/items/depth.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/items/depth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { depthBuckets } from './depth';
import type { WorldListing } from '../../lib/universalis';

const l = (price: number, quantity: number, seller: string, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller });

describe('depthBuckets', () => {
  it('returns [] for empty input', () => {
    expect(depthBuckets([], false)).toEqual([]);
  });

  it('returns [] when no listing matches the requested quality', () => {
    expect(depthBuckets([l(100, 1, 'A')], true)).toEqual([]);
  });

  it('buckets by price and aggregates units + distinct sellers', () => {
    const listings = [
      l(100, 1, 'A'), l(100, 2, 'A'), l(110, 1, 'B'), l(120, 1, 'C'), l(200, 5, 'D'),
    ];
    // min=100 max=200 width=12.5 → idx: 100→0,100→0,110→0,120→1,200→7
    expect(depthBuckets(listings, false)).toEqual([
      { priceLow: 100, priceHigh: 113, units: 4, sellers: 2, listings: 3 },
      { priceLow: 113, priceHigh: 125, units: 1, sellers: 1, listings: 1 },
      { priceLow: 188, priceHigh: 200, units: 5, sellers: 1, listings: 1 },
    ]);
  });

  it('collapses a single price point into one bucket', () => {
    expect(depthBuckets([l(50, 1, 'A'), l(50, 1, 'B')], false)).toEqual([
      { priceLow: 50, priceHigh: 50, units: 2, sellers: 2, listings: 2 },
    ]);
  });

  it('defaults missing quantity to 1', () => {
    const noQty = { world: 'Phantom', price: 80, hq: false } as WorldListing;
    expect(depthBuckets([noQty], false)).toEqual([
      { priceLow: 80, priceHigh: 80, units: 1, sellers: 0, listings: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/items/depth.test.ts`
Expected: FAIL with "depthBuckets is not defined".

- [ ] **Step 3: Implement**

`src/features/items/depth.ts`:

```ts
import type { WorldListing } from '../../lib/universalis';

export interface DepthBucket {
  priceLow: number;
  priceHigh: number;
  units: number;
  sellers: number;
  listings: number;
}

const BUCKET_COUNT = 8;

/** Group listings of one quality tier into price buckets for a depth histogram. */
export function depthBuckets(listings: WorldListing[], hq: boolean): DepthBucket[] {
  const rows = listings.filter((l) => l.hq === hq && l.price > 0);
  if (rows.length === 0) return [];

  const prices = rows.map((l) => l.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const width = (max - min) / BUCKET_COUNT;

  interface Acc { units: number; sellers: Set<string>; listings: number }
  const buckets = new Map<number, Acc>();
  for (const l of rows) {
    const idx = width === 0 ? 0 : Math.min(BUCKET_COUNT - 1, Math.floor((l.price - min) / width));
    let acc = buckets.get(idx);
    if (!acc) { acc = { units: 0, sellers: new Set(), listings: 0 }; buckets.set(idx, acc); }
    acc.units += l.quantity ?? 1;
    acc.listings += 1;
    if (l.seller) acc.sellers.add(l.seller);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, acc]) => ({
      priceLow: Math.round(width === 0 ? min : min + idx * width),
      priceHigh: Math.round(width === 0 ? max : min + (idx + 1) * width),
      units: acc.units,
      sellers: acc.sellers.size,
      listings: acc.listings,
    }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/items/depth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/items/depth.ts src/features/items/depth.test.ts
git commit -m "feat(item): depthBuckets price-depth aggregation"
```

---

### Task 3: `concentrationHHI` pure compute

**Files:**
- Create: `src/features/items/concentration.ts`
- Test: `src/features/items/concentration.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/items/concentration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { concentrationHHI } from './concentration';
import type { WorldListing } from '../../lib/universalis';

const l = (price: number, quantity: number, seller: string, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller });

describe('concentrationHHI', () => {
  it('returns null when no listing has a seller in the tier', () => {
    expect(concentrationHHI([l(100, 1, '')], false)).toBeNull();
  });

  it('returns null when no listing matches the requested quality', () => {
    expect(concentrationHHI([l(100, 1, 'A')], true)).toBeNull();
  });

  it('single seller → hhi 1, risk thin', () => {
    const c = concentrationHHI([l(100, 3, 'A'), l(110, 2, 'A')], false)!;
    expect(c.hhi).toBeCloseTo(1, 5);
    expect(c.topSellerShare).toBeCloseTo(1, 5);
    expect(c.sellerCount).toBe(1);
    expect(c.risk).toBe('thin');
  });

  it('two sellers → risk thin (duopoly)', () => {
    const c = concentrationHHI([l(100, 1, 'A'), l(110, 1, 'B')], false)!;
    expect(c.hhi).toBeCloseTo(0.5, 5);
    expect(c.sellerCount).toBe(2);
    expect(c.risk).toBe('thin');
  });

  it('three uneven sellers → risk moderate', () => {
    const c = concentrationHHI([l(100, 6, 'A'), l(110, 2, 'B'), l(120, 2, 'C')], false)!;
    expect(c.hhi).toBeCloseTo(0.44, 5);
    expect(c.topSellerShare).toBeCloseTo(0.6, 5);
    expect(c.sellerCount).toBe(3);
    expect(c.risk).toBe('moderate');
  });

  it('four even sellers → risk deep', () => {
    const c = concentrationHHI(
      [l(100, 1, 'A'), l(110, 1, 'B'), l(120, 1, 'C'), l(130, 1, 'D')], false,
    )!;
    expect(c.hhi).toBeCloseTo(0.25, 5);
    expect(c.sellerCount).toBe(4);
    expect(c.risk).toBe('deep');
  });

  it('defaults missing quantity to 1', () => {
    const noQty = { world: 'Phantom', price: 80, hq: false, seller: 'A' } as WorldListing;
    const c = concentrationHHI([noQty, l(90, 1, 'B')], false)!;
    expect(c.sellerCount).toBe(2);
    expect(c.hhi).toBeCloseTo(0.5, 5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/items/concentration.test.ts`
Expected: FAIL with "concentrationHHI is not defined".

- [ ] **Step 3: Implement**

`src/features/items/concentration.ts`:

```ts
import type { WorldListing } from '../../lib/universalis';

export type RiskLevel = 'thin' | 'moderate' | 'deep';

export interface Concentration {
  hhi: number;           // 1/N … 1, sum of squared per-seller unit shares
  topSellerShare: number; // 0 … 1
  sellerCount: number;
  risk: RiskLevel;
}

const HHI_THIN = 0.5;     // at/above → one player can move the market
const HHI_MODERATE = 0.28; // at/above → some concentration

/** Herfindahl-Hirschman index over per-seller unit share for one quality tier. */
export function concentrationHHI(listings: WorldListing[], hq: boolean): Concentration | null {
  const rows = listings.filter((l) => l.hq === hq && l.price > 0 && l.seller);
  if (rows.length === 0) return null;

  const unitsBySeller = new Map<string, number>();
  let totalUnits = 0;
  for (const l of rows) {
    const q = l.quantity ?? 1;
    const seller = l.seller as string;
    unitsBySeller.set(seller, (unitsBySeller.get(seller) ?? 0) + q);
    totalUnits += q;
  }
  if (totalUnits === 0) return null;

  let hhi = 0;
  let topSellerShare = 0;
  for (const units of unitsBySeller.values()) {
    const share = units / totalUnits;
    hhi += share * share;
    if (share > topSellerShare) topSellerShare = share;
  }

  const sellerCount = unitsBySeller.size;
  const risk: RiskLevel =
    sellerCount <= 2 || hhi >= HHI_THIN ? 'thin'
    : hhi >= HHI_MODERATE ? 'moderate'
    : 'deep';

  return { hhi, topSellerShare, sellerCount, risk };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/items/concentration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/items/concentration.ts src/features/items/concentration.test.ts
git commit -m "feat(item): concentrationHHI seller-concentration metric"
```

---

### Task 4: Shared `QualityTab` toggle

**Files:**
- Create: `src/features/items/QualityTab.tsx`

No standalone test — exercised via the block tests in Tasks 5 & 6.

- [ ] **Step 1: Implement**

`src/features/items/QualityTab.tsx`:

```tsx
import type { ReactNode } from 'react';

interface Props { active: boolean; onClick: () => void; children: ReactNode }

/** Small NQ/HQ toggle button shared by the supply-depth and concentration blocks. */
export function QualityTab({ active, onClick, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 border transition-colors ${
        active ? 'border-gold text-gold' : 'border-border-base text-text-low hover:text-text-cream'
      }`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/items/QualityTab.tsx
git commit -m "feat(item): shared QualityTab NQ/HQ toggle"
```

---

### Task 5: `SupplyDepthBlock` component

**Files:**
- Create: `src/features/items/SupplyDepthBlock.tsx`
- Test: `src/features/items/SupplyDepthBlock.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/features/items/SupplyDepthBlock.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupplyDepthBlock } from './SupplyDepthBlock';
import type { WorldListing } from '../../lib/universalis';

const l = (price: number, quantity: number, seller: string, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller });

describe('SupplyDepthBlock', () => {
  it('renders price-tier rows with unit counts for the NQ book', () => {
    render(
      <SupplyDepthBlock
        listings={[l(100, 2, 'A'), l(100, 1, 'B'), l(200, 4, 'C')]}
        canHq={false}
      />,
    );
    expect(screen.getByText(/Supply depth/i)).toBeInTheDocument();
    // Two buckets (min 100, max 200): first has 3 units / 2 sellers.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows an empty note when the selected tier has no listings', async () => {
    render(<SupplyDepthBlock listings={[l(100, 1, 'A')]} canHq />);
    await userEvent.click(screen.getByRole('button', { name: 'HQ' }));
    expect(screen.getByText(/No HQ listings to chart/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/items/SupplyDepthBlock.test.tsx`
Expected: FAIL with "SupplyDepthBlock is not defined".

- [ ] **Step 3: Implement**

`src/features/items/SupplyDepthBlock.tsx`:

```tsx
import { useState } from 'react';
import type { WorldListing } from '../../lib/universalis';
import { fmtGil } from '../../lib/format';
import { SectionHeader } from '../../components/SectionHeader';
import { QualityTab } from './QualityTab';
import { depthBuckets } from './depth';

interface Props { listings: WorldListing[]; canHq: boolean }

/** Home-world order-book depth as a CSS-bar histogram over price tiers. */
export function SupplyDepthBlock({ listings, canHq }: Props) {
  const [hq, setHq] = useState(false);
  const buckets = depthBuckets(listings, hq);
  const maxUnits = buckets.reduce((m, b) => Math.max(m, b.units), 0);

  return (
    <section>
      <SectionHeader label="Supply depth" compact />
      {canHq && (
        <div className="flex gap-1 mb-2">
          <QualityTab active={!hq} onClick={() => setHq(false)}>NQ</QualityTab>
          <QualityTab active={hq} onClick={() => setHq(true)}>HQ</QualityTab>
        </div>
      )}
      <div className="border border-border-base bg-bg-card p-4">
        {buckets.length === 0 ? (
          <div className="text-text-low text-sm italic">No {hq ? 'HQ' : 'NQ'} listings to chart.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
                <th className="text-left px-2 py-1">Price tier</th>
                <th className="text-left px-2 py-1 w-1/2">Depth</th>
                <th className="text-right px-2 py-1">Units</th>
                <th className="text-right px-2 py-1">Sellers</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => (
                <tr key={i} className="border-t border-border-base">
                  <td className="px-2 py-2 font-mono text-text-cream whitespace-nowrap">
                    {fmtGil(b.priceLow)}{b.priceHigh > b.priceLow ? `–${fmtGil(b.priceHigh)}` : ''}
                  </td>
                  <td className="px-2 py-2">
                    <div
                      className="bg-aether/40 h-3"
                      style={{ width: `${maxUnits ? (b.units / maxUnits) * 100 : 0}%` }}
                      aria-hidden
                    />
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{b.units}</td>
                  <td className="px-2 py-2 text-right font-mono text-text-low">{b.sellers || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/items/SupplyDepthBlock.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/items/SupplyDepthBlock.tsx src/features/items/SupplyDepthBlock.test.tsx
git commit -m "feat(item): SupplyDepthBlock order-book depth histogram"
```

---

### Task 6: `ConcentrationBlock` component

**Files:**
- Create: `src/features/items/ConcentrationBlock.tsx`
- Test: `src/features/items/ConcentrationBlock.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/features/items/ConcentrationBlock.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConcentrationBlock } from './ConcentrationBlock';
import type { WorldListing } from '../../lib/universalis';

const l = (price: number, quantity: number, seller: string, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller });

describe('ConcentrationBlock', () => {
  it('summarizes top-seller share and seller count', () => {
    render(
      <ConcentrationBlock
        listings={[l(100, 6, 'A'), l(110, 2, 'B'), l(120, 2, 'C')]}
        canHq={false}
      />,
    );
    expect(screen.getByText(/Seller concentration/i)).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/Moderately spread/i)).toBeInTheDocument();
  });

  it('flags a single dominant seller as risky', () => {
    render(<ConcentrationBlock listings={[l(100, 5, 'A')]} canHq={false} />);
    expect(screen.getByText(/Concentrated · risky/i)).toBeInTheDocument();
  });

  it('shows a limited-data note when seller info is absent', () => {
    render(<ConcentrationBlock listings={[l(100, 1, ''), l(110, 1, '')]} canHq={false} />);
    expect(screen.getByText(/Limited data/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/items/ConcentrationBlock.test.tsx`
Expected: FAIL with "ConcentrationBlock is not defined".

- [ ] **Step 3: Implement**

`src/features/items/ConcentrationBlock.tsx`:

```tsx
import { useState } from 'react';
import type { WorldListing } from '../../lib/universalis';
import { SectionHeader } from '../../components/SectionHeader';
import { QualityTab } from './QualityTab';
import { concentrationHHI, type RiskLevel } from './concentration';

interface Props { listings: WorldListing[]; canHq: boolean }

const RISK_META: Record<RiskLevel, { label: string; cls: string }> = {
  thin:     { label: 'Concentrated · risky', cls: 'text-crimson border-crimson/40' },
  moderate: { label: 'Moderately spread',    cls: 'text-gold border-gold/40' },
  deep:     { label: 'Well-distributed',     cls: 'text-jade border-jade/40' },
};

/** Home-world seller-concentration (HHI) as a supply-structure risk indicator. */
export function ConcentrationBlock({ listings, canHq }: Props) {
  const [hq, setHq] = useState(false);
  const c = concentrationHHI(listings, hq);

  return (
    <section>
      <SectionHeader label="Seller concentration" compact />
      {canHq && (
        <div className="flex gap-1 mb-2">
          <QualityTab active={!hq} onClick={() => setHq(false)}>NQ</QualityTab>
          <QualityTab active={hq} onClick={() => setHq(true)}>HQ</QualityTab>
        </div>
      )}
      <div className="border border-border-base bg-bg-card p-4">
        {c == null ? (
          <div className="text-text-low text-sm italic">Limited data — seller info refreshing.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">Supply risk</span>
              <span className={`font-mono text-[10px] tracking-widest uppercase border px-2 py-0.5 ${RISK_META[c.risk].cls}`}>
                {RISK_META[c.risk].label}
              </span>
            </div>
            <div className="bg-bg-deep h-3 border border-border-base">
              <div className="bg-aether h-full" style={{ width: `${Math.round(c.hhi * 100)}%` }} aria-hidden />
            </div>
            <p className="text-[12.5px] text-text-dim">
              Top seller holds <span className="text-text-cream font-mono">{Math.round(c.topSellerShare * 100)}%</span>{' '}
              across <span className="text-text-cream font-mono">{c.sellerCount}</span> seller{c.sellerCount === 1 ? '' : 's'}.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/items/ConcentrationBlock.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/items/ConcentrationBlock.tsx src/features/items/ConcentrationBlock.test.tsx
git commit -m "feat(item): ConcentrationBlock seller-concentration risk"
```

---

### Task 7: Mount both blocks on the item page

**Files:**
- Modify: `src/routes/Item.tsx`
- Test: `src/routes/Item.test.tsx` (run, fix only if it breaks)

Both blocks read the home-world book (`phantomMarket.worldListings`), so seller names are unique-per-world and the depth reflects the user's own market.

- [ ] **Step 1: Add the imports**

In `src/routes/Item.tsx`, after the `CurrencySourceCard` import (line 21), add:

```ts
import { SupplyDepthBlock } from '../features/items/SupplyDepthBlock';
import { ConcentrationBlock } from '../features/items/ConcentrationBlock';
```

- [ ] **Step 2: Mount the blocks**

In the JSX, immediately after the `CurrencySourceCard` block closes (after line 269, before the `{recipes.isLoading && !recipe && (` block), insert:

```tsx
      {phantomMarket && phantomMarket.worldListings.length > 0 && (
        <SupplyDepthBlock listings={phantomMarket.worldListings} canHq={canHq} />
      )}

      {phantomMarket && phantomMarket.worldListings.length > 0 && (
        <ConcentrationBlock listings={phantomMarket.worldListings} canHq={canHq} />
      )}
```

- [ ] **Step 3: Run the item-page test**

Run: `npx vitest run src/routes/Item.test.tsx`
Expected: PASS. If it fails because an assertion counts sections or matches text now duplicated (e.g. a "Supply" / number match), scope the failing query (`getByRole`/`within`) rather than loosening intent. Re-run until green.

- [ ] **Step 4: Run the full suite + lint**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Item.tsx
git commit -m "feat(item): mount supply-depth + concentration blocks"
```

---

### Task 8: Regenerate API bundles so the deployed cache emits enriched rows

**Files:**
- Modify (generated): `api/discord.mjs`, `api/refresh-cache.mjs`, and any other `api/*.mjs` that inlines `parseMarketResponse`.

The hourly cache refresh runs from the bundled `api/*.mjs`. Until they're rebuilt, the deployed `market-cache.json` keeps emitting 3-field listings and the concentration block shows the "limited data" note in production.

- [ ] **Step 1: Rebuild the API bundles**

Run: `npm run build:api`
Expected: esbuild writes the `api/*.mjs` files with no errors.

- [ ] **Step 2: Confirm the enriched parser made it into the bundle**

Run: `git diff --stat api/`
Expected: `api/discord.mjs` and `api/refresh-cache.mjs` show changes (the new `quantity`/`seller` mapping + `LISTINGS_KEPT = 50`).

- [ ] **Step 3: Commit the regenerated artifacts**

```bash
git add api/
git commit -m "build(api): regenerate bundles with enriched market parser"
```

---

## Verification Checklist

- [ ] `npx vitest run` — full suite green.
- [ ] `npm run lint` — clean.
- [ ] `/item/:id` for a liquid item shows **Supply depth** (price-tier bars with units/sellers) and **Seller concentration** (HHI bar + risk badge + "top seller holds X%…").
- [ ] An item with no cached listings renders neither block (no empty shells).
- [ ] Before the next cache refresh, items still on the old cache show the concentration "Limited data — refreshing" note rather than a wrong HHI.

## Notes / Deferred

- Cache blob grows (up to 50 rows + a seller string per row, ×3 scopes). Accepted — public hourly blob, not a hot path. Watch `market-cache.json` size after the first enriched refresh; if it's a problem, drop `LISTINGS_KEPT` back toward ~25.
- `buildMarketUrl` (`listings=10`, live bot-chat path only) intentionally untouched.
- Folding the concentration `RiskLevel` into the verdict pipeline's `Play.risk` string is a deferred follow-up (would thread concentration through `computeVerdict`).
- Region/DC depth (vs. home-only) is out of scope; both blocks read `phantomMarket`.
