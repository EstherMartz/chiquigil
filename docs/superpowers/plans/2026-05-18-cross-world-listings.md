# Cross-World Listings Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Universalis-style cross-world listings table to `/item/:id`, fed by the region payload already loaded by `useMarketData(..., 'Europe')`.

**Architecture:** New pure-render component `CrossWorldListingsBlock` that takes a `WorldListing[]` plus home-tier prices, sorts by price ASC, and renders a flat table with DC label, server name, HQ glyph, price, and %diff vs the home tier. Wired into `Item.tsx` between the `PricesBlock` and `VendorSourceCard` sections, gated on `regionMarket.worldListings.length > 0`.

**Tech Stack:** React + TypeScript + Vitest + RTL. No new dependencies. Reuses existing `dcOf`, `HqStar`, `SectionHeader`, `fmtGil`.

**IMPORTANT GIT SAFETY RULE for implementers:** Do NOT run `git checkout`, `git reset`, `git stash`, `git clean`, `git rebase`, `git restore`, `git switch`. Only `git add`, `git commit`, `git log`, `git diff`, `git show`, `git status`, `git cat-file`, `git fsck` are allowed.

**Commit trailer:**
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 1: CrossWorldListingsBlock component + tests

**Files:**
- Create: `src/features/items/CrossWorldListingsBlock.tsx`
- Create: `src/features/items/CrossWorldListingsBlock.test.tsx`

- [ ] **Step 1: Write the failing tests** at `src/features/items/CrossWorldListingsBlock.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CrossWorldListingsBlock } from './CrossWorldListingsBlock';
import type { WorldListing } from '../../lib/universalis';

const ls = (world: string, price: number, hq = false): WorldListing => ({ world, price, hq });

describe('CrossWorldListingsBlock', () => {
  it('renders nothing when listings is empty', () => {
    const { container } = render(
      <CrossWorldListingsBlock
        listings={[]}
        homeWorld="Phantom"
        homeMinNQ={500}
        homeMinHQ={null}
      />,
    );
    expect(container.textContent).toBe('');
  });

  it('renders rows sorted by price ASC with DC labels and HQ glyph', () => {
    render(
      <CrossWorldListingsBlock
        listings={[ls('Phantom', 989), ls('Lich', 510, true), ls('Bismarck', 489)]}
        homeWorld="Phantom"
        homeMinNQ={989}
        homeMinHQ={null}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1); // skip header
    expect(within(rows[0]).getByText(/Bismarck/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/489/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/Lich/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/510/)).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText(/HQ/i)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/Phantom/)).toBeInTheDocument();
    expect(within(rows[2]).queryByLabelText(/HQ/i)).toBeNull();
  });

  it('vs home shows correct sign and color, em-dash on home row', () => {
    render(
      <CrossWorldListingsBlock
        listings={[ls('Phantom', 1000), ls('Lich', 500), ls('Bismarck', 1500)]}
        homeWorld="Phantom"
        homeMinNQ={1000}
        homeMinHQ={null}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    // Sorted ASC: Lich 500, Phantom 1000 (home), Bismarck 1500
    expect(within(rows[0]).getByText(/-50%/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/^—$/)).toBeInTheDocument(); // home row
    expect(within(rows[2]).getByText(/\+50%/)).toBeInTheDocument();
  });

  it('vs home shows em-dash when home tier missing', () => {
    render(
      <CrossWorldListingsBlock
        listings={[ls('Lich', 100, true)]}
        homeWorld="Phantom"
        homeMinNQ={1000}
        homeMinHQ={null}
      />,
    );
    expect(screen.getByText(/^—$/)).toBeInTheDocument();
  });

  it('home-world row shows a "home" tag', () => {
    render(
      <CrossWorldListingsBlock
        listings={[ls('Phantom', 100)]}
        homeWorld="Phantom"
        homeMinNQ={100}
        homeMinHQ={null}
      />,
    );
    expect(screen.getByText(/home/i)).toBeInTheDocument();
  });

  it('skips listings with empty world', () => {
    render(
      <CrossWorldListingsBlock
        listings={[ls('', 50), ls('Lich', 500)]}
        homeWorld="Phantom"
        homeMinNQ={1000}
        homeMinHQ={null}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText(/Lich/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npx vitest run src/features/items/CrossWorldListingsBlock.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the component** at `src/features/items/CrossWorldListingsBlock.tsx`:

```tsx
import type { WorldListing } from '../../lib/universalis';
import { dcOf } from '../../lib/europeWorlds';
import { fmtGil } from '../../lib/format';
import { SectionHeader } from '../../components/SectionHeader';
import { HqStar } from '../../components/HqStar';

interface Props {
  listings: WorldListing[];
  homeWorld: string;
  homeMinNQ: number | null;
  homeMinHQ: number | null;
}

interface PreparedRow {
  world: string;
  price: number;
  hq: boolean;
  dc: 'Chaos' | 'Light' | null;
  isHome: boolean;
  diffPct: number | null; // null when no comparable home tier OR row is home
}

function prepare(listings: WorldListing[], homeWorld: string, homeMinNQ: number | null, homeMinHQ: number | null): PreparedRow[] {
  const rows: PreparedRow[] = [];
  for (const l of listings) {
    if (!l.world) continue;
    const isHome = l.world === homeWorld;
    const home = l.hq ? homeMinHQ : homeMinNQ;
    const diffPct = isHome || home == null || home === 0
      ? null
      : Math.round(((l.price - home) / home) * 100);
    rows.push({
      world: l.world,
      price: l.price,
      hq: l.hq,
      dc: dcOf(l.world),
      isHome,
      diffPct,
    });
  }
  rows.sort((a, b) => a.price - b.price || a.world.localeCompare(b.world));
  return rows;
}

function dcClass(dc: 'Chaos' | 'Light' | null): string {
  if (dc === 'Chaos') return 'text-aether';
  if (dc === 'Light') return 'text-jade';
  return 'text-text-low';
}

function diffClass(diff: number | null): string {
  if (diff == null) return 'text-text-low';
  if (diff < 0) return 'text-jade';
  if (diff > 0) return 'text-crimson';
  return 'text-text-cream';
}

function formatDiff(diff: number | null): string {
  if (diff == null) return '—';
  return diff > 0 ? `+${diff}%` : `${diff}%`;
}

export function CrossWorldListingsBlock({ listings, homeWorld, homeMinNQ, homeMinHQ }: Props) {
  const rows = prepare(listings, homeWorld, homeMinNQ, homeMinHQ);
  if (rows.length === 0) return null;

  return (
    <section>
      <SectionHeader label="Cross-world listings" compact />
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
              <th className="text-right px-3 py-2">#</th>
              <th className="text-left px-3 py-2">DC</th>
              <th className="text-left px-3 py-2">Server</th>
              <th className="text-left px-3 py-2">HQ</th>
              <th className="text-right px-3 py-2">Price</th>
              <th className="text-right px-3 py-2">vs home</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.world}:${i}:${r.price}:${r.hq ? 'h' : 'n'}`} className="border-t border-border-base hover:bg-bg-card-hi">
                <td className="px-3 py-2 text-right font-mono text-text-low">{i + 1}</td>
                <td className={`px-3 py-2 font-mono text-[11px] ${dcClass(r.dc)}`}>{r.dc ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className="text-text-cream">{r.world}</span>
                  {r.isHome && (
                    <span className="ml-2 font-mono text-[10px] tracking-widest uppercase text-text-low border border-border-base px-1.5 py-0.5">
                      home
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.hq ? <span aria-label="HQ" className="text-gold inline-flex items-baseline"><HqStar /></span> : null}
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmtGil(r.price)}</td>
                <td className={`px-3 py-2 text-right font-mono ${diffClass(r.diffPct)}`}>{formatDiff(r.diffPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run src/features/items/CrossWorldListingsBlock.test.tsx`
Expected: 6 PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/items/CrossWorldListingsBlock.tsx src/features/items/CrossWorldListingsBlock.test.tsx
git commit -m "$(cat <<'EOF'
feat(item): CrossWorldListingsBlock component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire into Item.tsx

**Files:**
- Modify: `src/routes/Item.tsx`
- Modify: `src/routes/Item.test.tsx`

- [ ] **Step 1: Add the failing test** to `src/routes/Item.test.tsx`. Append inside `describe('Item route', ...)` (after the existing tests):

```tsx
  it('renders Cross-world listings section when region data is populated', async () => {
    await putCachedItems([
      { id: 5057, name: 'Earth Shard', sc: 58, ui: 0, ilvl: 1, canHq: false },
    ]);
    await putCachedRecipeSnapshot([]);
    // Mock Universalis: home (Phantom), DC (Chaos), region (Europe) all return data.
    // Region payload carries the cross-world listings the new section renders.
    const regionItem = {
      listings: [
        { hq: false, pricePerUnit: 8, worldName: 'Lich' },
        { hq: false, pricePerUnit: 10, worldName: 'Phantom' },
      ],
      recentHistory: [],
      regularSaleVelocity: 1,
      lastUploadTime: 1,
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('universalis.app')) {
        return { ok: true, status: 200, json: async () => ({ items: { '5057': regionItem } }) };
      }
      return { ok: false, status: 404 };
    }));

    render(withProviders('/item/5057'));

    await waitFor(() => {
      expect(screen.getByText(/cross-world listings/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Lich/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Verify test fails**

Run: `npx vitest run src/routes/Item.test.tsx -t "Cross-world"`
Expected: FAIL — heading not in document.

- [ ] **Step 3: Wire the block into Item.tsx**.

Add the import. Find this line at the top of `src/routes/Item.tsx`:

```tsx
import { CurrencySourceCard } from '../features/items/CurrencySourceCard';
```

Add immediately after it:

```tsx
import { CrossWorldListingsBlock } from '../features/items/CrossWorldListingsBlock';
```

Add the local for `regionMarket`. Find:

```tsx
  const phantomMarket = market.data?.phantom[itemId];
  const dcMarket = market.data?.dc[itemId];
```

Replace with:

```tsx
  const phantomMarket = market.data?.phantom[itemId];
  const dcMarket = market.data?.dc[itemId];
  const regionMarket = market.data?.region[itemId];
```

Insert the JSX block. Find this existing block:

```tsx
      <PricesBlock
        worldLabel={world}
        dcLabel={dc}
        loading={market.isLoading}
        phantom={phantomMarket}
        dc={dcMarket}
      />

      {vendorPrice ? (
```

Insert between the `PricesBlock` closing `/>` and the `{vendorPrice ?` line:

```tsx
      {regionMarket && regionMarket.worldListings.length > 0 && (
        <CrossWorldListingsBlock
          listings={regionMarket.worldListings}
          homeWorld={world}
          homeMinNQ={phantomMarket?.minNQ ?? null}
          homeMinHQ={phantomMarket?.minHQ ?? null}
        />
      )}

```

(Keep the blank line for visual separation from the next block.)

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run src/routes/Item.test.tsx`
Expected: all pass (existing + new).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/routes/Item.tsx src/routes/Item.test.tsx
git commit -m "$(cat <<'EOF'
feat(item-route): wire CrossWorldListingsBlock between Prices and Vendor cards

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Full suite + final verification

- [ ] **Step 1: Run full suite**

Run: `npx vitest run`
Expected: 648 tests pass (was 641; +6 from Task 1 + 1 from Task 2 = +7). Acceptable range ±2.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Report**

Report the exact `Tests` line and `Test Files` line, and confirm tsc clean. No commit.

---

## Notes for the implementer

- **No new types** — `WorldListing` already exists at `src/lib/universalis.ts`.
- **`dcOf(world)` returns `'Chaos' | 'Light' | null`** for EU worlds. Worlds outside EU (shouldn't happen in region='Europe' data, but defensive) render as `—` in the DC column.
- **`HqStar`** is at `src/components/HqStar.tsx`. The test uses `getByLabelText(/HQ/i)` and the component renders `<span aria-label="HQ">…</span>` — matching the pattern in `CurrencySourceCard`.
- **The home-row em-dash test** asserts on `/^—$/` (single character). Other rows can contain `—` substrings (e.g. DC `'—'` for unknown), so `getAllByText` and indexing aren't needed — the test scopes via `within(rows[i])`.
- **Tie-break by world name** is deterministic so test ordering is stable.
