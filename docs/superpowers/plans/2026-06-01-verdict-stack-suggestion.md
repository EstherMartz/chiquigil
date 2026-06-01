# Verdict Stack + Price Suggestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stack-size selling suggestion (a text insight line + a "SELL AS" column) to the top Verdict card on `/item/:id`, derived from 90-day sale history and current listings.

**Architecture:** A pure `suggestStack` function (in the existing `stackAnalysis.ts`) chooses the best stack size — supply-gap first, else most-liquid — and its median per-unit price. `VerdictCard` gains an optional `history` prop, computes the suggestion for the verdict's chosen quality, and renders both the insight line and the column. `Item.tsx` lifts a single 90-day history query and passes it to the card (sharing the React Query key with the existing analyzer, so no extra fetch).

**Tech Stack:** TypeScript, React 18, @tanstack/react-query, Vitest + Testing Library, Tailwind.

Spec: `docs/superpowers/specs/2026-06-01-verdict-stack-suggestion-design.md`

---

### Task 1: `suggestStack` pure compute

**Files:**
- Modify: `src/features/items/stackAnalysis.ts`
- Test: `src/features/items/stackAnalysis.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/features/items/stackAnalysis.test.ts` (the `import` line must also gain `suggestStack` and the row helpers below):

At the top, update the import to include `suggestStack`:
```ts
import { soldByStack, listedByStack, isStackable, suggestStack } from './stackAnalysis';
```
Then append these tests (after the existing `describe` blocks), including the local helpers:
```ts
import type { SoldStackRow, ListedStackRow } from './stackAnalysis';

const sr = (stack: number, sales: number, lastSoldMs: number, medianUnitPrice = 1000): SoldStackRow =>
  ({ stack, sales, units: stack * sales, medianUnitPrice, lastSoldMs });
const lr = (stack: number, count: number): ListedStackRow => ({ stack, count });

describe('suggestStack', () => {
  it('returns null when not stackable', () => {
    expect(suggestStack([sr(1, 5, 100)], [lr(1, 2)])).toBeNull();
  });

  it('returns null on empty sales', () => {
    expect(suggestStack([], [])).toBeNull();
  });

  it('prefers a supply gap even when another size has more sales', () => {
    // stack 2 = clear gap (10 sales, 0 listed); stack 10 = more sales but well-listed.
    const sold = [sr(2, 10, 100, 1500), sr(10, 30, 200, 999)];
    const listed = [lr(10, 5)];
    expect(suggestStack(sold, listed)).toEqual({ stack: 2, unitPrice: 1500, kind: 'gap' });
  });

  it('falls back to the most-liquid size when there is no gap', () => {
    const sold = [sr(2, 5, 100), sr(10, 8, 200, 1300)];
    const listed = [lr(2, 3), lr(10, 3)]; // both well-listed → no gap
    expect(suggestStack(sold, listed)).toEqual({ stack: 10, unitPrice: 1300, kind: 'liquid' });
  });

  it('breaks sales ties by most recent, then larger stack', () => {
    // both are gaps (nothing listed), equal sales → recency wins (stack 9, later ts).
    expect(suggestStack([sr(5, 4, 100), sr(9, 4, 200, 1700)], [])).toEqual(
      { stack: 9, unitPrice: 1700, kind: 'gap' },
    );
    // equal sales and equal recency → larger stack wins.
    expect(suggestStack([sr(5, 4, 100), sr(9, 4, 100, 1700)], [])).toEqual(
      { stack: 9, unitPrice: 1700, kind: 'gap' },
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/items/stackAnalysis.test.ts`
Expected: FAIL — `suggestStack` not exported.

- [ ] **Step 3: Implement**

Append to `src/features/items/stackAnalysis.ts`:
```ts
export interface StackSuggestion {
  stack: number;
  unitPrice: number;
  kind: 'gap' | 'liquid';
}

/**
 * Recommend a stack size to list at: a supply gap (real demand, thin supply)
 * if one exists, else the most-liquid size. Tie-break: most recent, then larger.
 * Returns null for non-stackable items or when there are no sales.
 */
export function suggestStack(sold: SoldStackRow[], listed: ListedStackRow[]): StackSuggestion | null {
  if (!isStackable(sold, listed) || sold.length === 0) return null;

  const totalSales = sold.reduce((s, r) => s + r.sales, 0);
  const listedCountByStack = new Map(listed.map((r) => [r.stack, r.count]));
  const gapThreshold = Math.max(2, totalSales * 0.15);

  const better = (a: SoldStackRow, b: SoldStackRow): SoldStackRow => {
    if (a.sales !== b.sales) return a.sales > b.sales ? a : b;
    if (a.lastSoldMs !== b.lastSoldMs) return a.lastSoldMs > b.lastSoldMs ? a : b;
    return a.stack >= b.stack ? a : b;
  };

  const gapRows = sold.filter(
    (r) => r.sales >= gapThreshold && (listedCountByStack.get(r.stack) ?? 0) <= 1,
  );
  const pool = gapRows.length > 0 ? gapRows : sold;
  const kind: 'gap' | 'liquid' = gapRows.length > 0 ? 'gap' : 'liquid';
  const pick = pool.reduce(better);

  return { stack: pick.stack, unitPrice: pick.medianUnitPrice, kind };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/items/stackAnalysis.test.ts`
Expected: PASS (all, including the earlier `soldByStack`/`listedByStack`/`isStackable` tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/items/stackAnalysis.ts src/features/items/stackAnalysis.test.ts
git commit -m "feat(item): suggestStack stack-size selling recommendation"
```

---

### Task 2: Verdict card — insight line + SELL AS column

**Files:**
- Modify: `src/features/items/VerdictCard.tsx`
- Test: `src/features/items/VerdictCard.test.tsx`

- [ ] **Step 1: Add the failing tests**

Append to `src/features/items/VerdictCard.test.tsx` (the existing `mkt` helper, `NOW`, and `DAY` are reused; add a `HistoryEntry` import):

At the top, after the existing imports, add:
```ts
import type { HistoryEntry } from '../../lib/universalisHistory';

const sale = (quantity: number, pricePerUnit: number, timestamp: number, hq = false): HistoryEntry =>
  ({ quantity, pricePerUnit, timestamp, hq });
```
Then append:
```ts
describe('VerdictCard stack suggestion', () => {
  it('shows the SELL AS column and under-supplied insight for a gap', () => {
    // 5 NQ sales of 2-stacks; no current listings → a clear supply gap on stack 2.
    const history = [
      sale(2, 1500, 10), sale(2, 1500, 20), sale(2, 1500, 30), sale(2, 1500, 40), sale(2, 1500, 50),
    ];
    render(
      <VerdictCard
        phantom={mkt({ minNQ: 1500, avgNQ: 1500, recentSalesNQ: 10, velocity: 5, listingCount: 1, worldListings: [] })}
        region={undefined} recipe={undefined} vendorPrice={undefined}
        materialCost={0} homeWorld="Home" canHq={false} now={NOW}
        history={history}
      />,
    );
    expect(screen.getByText('Sell as')).toBeInTheDocument();
    expect(screen.getByText('2-stack')).toBeInTheDocument(); // exact: the column value, not the "2-stacks" insight
    expect(screen.getByText(/Best as 2-stacks/i)).toBeInTheDocument();
    expect(screen.getAllByText(/under-supplied/i).length).toBeGreaterThan(0);
  });

  it('renders nothing extra for a non-stackable item', () => {
    const history = [sale(1, 1000, 10)]; // singles only
    render(
      <VerdictCard
        phantom={mkt({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5, listingCount: 1, worldListings: [] })}
        region={undefined} recipe={undefined} vendorPrice={undefined}
        materialCost={0} homeWorld="Home" canHq={false} now={NOW}
        history={history}
      />,
    );
    expect(screen.queryByText('Sell as')).toBeNull();
    expect(screen.getByText('List on MB')).toBeInTheDocument(); // card still renders normally
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/items/VerdictCard.test.tsx`
Expected: FAIL — `history` prop unknown / "Sell as" not found.

- [ ] **Step 3: Implement**

In `src/features/items/VerdictCard.tsx`:

(a) Add imports near the top (after the existing `import type { Tone } …` / `computeVerdict` imports):
```ts
import type { HistoryEntry } from '../../lib/universalisHistory';
import { soldByStack, listedByStack, suggestStack } from './stackAnalysis';
```

(b) Add `history` to the `Props` interface (it currently ends with `now?: number;`):
```ts
  now?: number;
  history?: HistoryEntry[];
```

(c) Inside `VerdictCard`, after `const v = best;`, compute the suggestion:
```ts
  const hq = best.quality === 'HQ';
  const sold = soldByStack(props.history ?? [], hq);
  const listed = listedByStack(props.phantom?.worldListings ?? [], hq);
  const suggestion = suggestStack(sold, listed);
```

(d) Change the grid class on the `<section>` so it becomes 5 columns when a suggestion exists. Replace:
```tsx
      className={`bg-bg-card border ${TONE_FRAME[v.tone]} border-l-[3px] ${TONE_BORDER[v.tone]} p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] gap-5 md:gap-7`}
```
with:
```tsx
      className={`bg-bg-card border ${TONE_FRAME[v.tone]} border-l-[3px] ${TONE_BORDER[v.tone]} p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 ${suggestion ? 'lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]' : 'lg:grid-cols-[1.5fr_1fr_1fr_1fr]'} gap-5 md:gap-7`}
```

(e) Add the insight line inside the first `<div>`, immediately after the `runnerUp` block (the `{runnerUp && ( … )}` expression), before that `<div>` closes:
```tsx
        {suggestion && (
          <p className={`font-mono text-[11px] mt-2 ${suggestion.kind === 'gap' ? 'text-jade' : 'text-text-dim'}`}>
            ▸ {suggestion.kind === 'gap'
              ? `Best as ${suggestion.stack}-stacks · ~${fmtGil(suggestion.unitPrice)}/unit · under-supplied`
              : `Most sales are ${suggestion.stack}-stacks · ~${fmtGil(suggestion.unitPrice)}/unit`}
          </p>
        )}
```

(f) Add the SELL AS column as the last child of the `<section>`, immediately after the Risk `<div>` (the one containing `<div className="…">Risk</div>` and `{v.risk}`) and before `</section>`:
```tsx
      {suggestion && (
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-1">Sell as</div>
          <div className="font-display text-base text-text-cream tracking-wide mb-1">{suggestion.stack}-stack</div>
          <p className="font-mono text-[11px] text-text-dim">
            ~ {fmtGil(suggestion.unitPrice)}/unit
            {suggestion.kind === 'gap' && <span className="text-jade"> · under-supplied</span>}
          </p>
        </div>
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/items/VerdictCard.test.tsx`
Expected: PASS (including the two pre-existing tests, which omit `history` → `undefined` → `suggestStack` returns null → no extra output).

- [ ] **Step 5: Commit**

```bash
git add src/features/items/VerdictCard.tsx src/features/items/VerdictCard.test.tsx
git commit -m "feat(item): verdict stack suggestion insight line + SELL AS column"
```

---

### Task 3: Wire 90-day history into the verdict from `Item.tsx`

**Files:**
- Modify: `src/routes/Item.tsx`
- Test: `src/routes/Item.test.tsx` (run; fix only if it breaks)

- [ ] **Step 1: Add imports**

In `src/routes/Item.tsx`, add (near the other imports — `useQuery` from react-query and the history fetch):
```ts
import { useQuery } from '@tanstack/react-query';
import { fetchHistoryWithin } from '../lib/universalisHistory';
```
If `useQuery` is already imported from `@tanstack/react-query`, do not duplicate it — just add the `fetchHistoryWithin` import.

- [ ] **Step 2: Add the history query**

Inside the `Item` component, after the existing `const market = useMarketData(priceIds, world, dc, 'Europe');` line, add:
```ts
  const NINETY_DAYS_SEC = 90 * 24 * 60 * 60;
  const historyQ = useQuery({
    queryKey: ['item-history', world, itemId, 90],
    enabled: valid,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => (await fetchHistoryWithin(world, [itemId], NINETY_DAYS_SEC)).get(itemId) ?? [],
  });
```

- [ ] **Step 3: Pass history to the VerdictCard**

Find the `<VerdictCard … />` element and add the `history` prop:
```tsx
        <VerdictCard
          phantom={phantomMarket}
          region={regionMarket}
          recipe={recipe ?? undefined}
          vendorPrice={vendorPrice || undefined}
          materialCost={recipeMaterialCost}
          homeWorld={world}
          canHq={canHq}
          now={Date.now()}
          history={historyQ.data ?? []}
        />
```

- [ ] **Step 4: Run the item-page test**

Run: `npx vitest run src/routes/Item.test.tsx`
Expected: PASS. (The page already issues a `['item-history', …]` query via `MarketSnapshotRow`/`StackAnalyzerBlock`, so the test env already tolerates it; this adds no new network behavior.) If it fails because of an ambiguous text match, scope the failing query with `getByRole`/`within` — do not weaken intent.

- [ ] **Step 5: Run the full suite + type-check**

Run: `npx vitest run`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/routes/Item.tsx
git commit -m "feat(item): feed 90-day history to verdict for stack suggestion"
```

---

## Verification Checklist

- [ ] `npx vitest run` — full suite green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] On a stackable item, the Verdict card shows a **SELL AS** column (`N-stack · ~price/unit`) and a `▸` insight line; a supply-gap size is tagged "under-supplied".
- [ ] On a non-stackable item (gear), the Verdict card is unchanged (4 columns, no insight line).
- [ ] The suggestion follows the verdict's quality (HQ item → reads HQ history).

## Notes / Deferred

- Single 90-day history fetch shared via the React Query key with `StackAnalyzerBlock` — no duplicate request; `StackAnalyzerBlock` is left untouched.
- No "bulk vs specific size" prose nuance beyond gap/liquid (YAGNI).
- `computeVerdict` and the play scoring are untouched — this is purely additive presentation fed by history.
