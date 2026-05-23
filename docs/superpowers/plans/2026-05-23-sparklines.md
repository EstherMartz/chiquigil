# Price History Sparklines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline 7-day price sparklines to Watchlist and Crafts results tables, with batched history fetching, caching, a daily-breakdown tooltip, and a settings toggle.

**Architecture:** New `dailyMedianBuckets` function computes per-day median prices. A React Query hook (`useSparklineHistory`) batch-fetches history and produces a `Map<number, (number|null)[]>`. The existing `Sparkline` component is enhanced with null-gap rendering, colour prop, and endpoint dot. Tables receive the map as a prop and render sparklines per row.

**Tech Stack:** React 18, TanStack Query, SVG, Zustand, Vitest

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `src/features/sparklines/useSparklineHistory.ts` | React Query hook — batch fetch + median bucketing |
| `src/features/sparklines/sparklineColor.ts` | Delta/points → hex colour string |
| `src/features/sparklines/sparklineTooltip.ts` | Daily breakdown tooltip string formatter |
| `src/features/sparklines/sparklineColor.test.ts` | Tests for colour derivation |
| `src/features/sparklines/sparklineTooltip.test.ts` | Tests for tooltip formatting |
| `src/components/SparklineShimmer.tsx` | 80×28 skeleton placeholder |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/universalisHistory.ts` | Add `dailyMedianBuckets` |
| `src/lib/universalisHistory.test.ts` | Tests for `dailyMedianBuckets` |
| `src/components/Sparkline.tsx` | Nullable points, colour prop, endpoint dot, gap segments |
| `src/components/Sparkline.test.tsx` | Tests for new features |
| `src/features/settings/store.ts` | Add `showSparklines` boolean + setter |
| `src/routes/Settings.tsx` | Sparkline checkbox in Display section |
| `src/features/watchlist/WatchlistTable.tsx` | Sparkline column + new props |
| `src/routes/Watchlist.tsx` | Call hook, pass data to table |
| `src/features/queries/QueryResults.tsx` | Sparkline column + new props |
| `src/features/queries/CraftFlipResults.tsx` | Sparkline column + new props |
| `src/features/queries/QueriesView.tsx` | Call hook, pass data to result components |

---

## Task 1: `dailyMedianBuckets` — Pure Function + Tests

**Files:**
- Modify: `src/lib/universalisHistory.ts`
- Test: `src/lib/universalisHistory.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/lib/universalisHistory.test.ts`:

```ts
import { dailyMedianBuckets } from './universalisHistory';

describe('dailyMedianBuckets', () => {
  const DAY_MS = 86_400_000;

  function sec(ms: number) { return Math.floor(ms / 1000); }

  it('returns 7 nulls when entries is empty', () => {
    expect(dailyMedianBuckets([], 7)).toEqual([null, null, null, null, null, null, null]);
  });

  it('computes median for a day with odd number of sales', () => {
    const now = Date.now();
    const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
    const entries = [
      { pricePerUnit: 100, quantity: 1, timestamp: sec(todayStart + 1000), hq: false },
      { pricePerUnit: 300, quantity: 1, timestamp: sec(todayStart + 2000), hq: false },
      { pricePerUnit: 200, quantity: 1, timestamp: sec(todayStart + 3000), hq: false },
    ];
    const result = dailyMedianBuckets(entries, 7);
    expect(result).toHaveLength(7);
    expect(result[6]).toBe(200); // today = last slot, median of [100,200,300]
  });

  it('computes median for even count (average of two middle values)', () => {
    const now = Date.now();
    const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
    const entries = [
      { pricePerUnit: 100, quantity: 1, timestamp: sec(todayStart + 1000), hq: false },
      { pricePerUnit: 200, quantity: 1, timestamp: sec(todayStart + 2000), hq: false },
      { pricePerUnit: 300, quantity: 1, timestamp: sec(todayStart + 3000), hq: false },
      { pricePerUnit: 400, quantity: 1, timestamp: sec(todayStart + 4000), hq: false },
    ];
    const result = dailyMedianBuckets(entries, 7);
    expect(result[6]).toBe(250); // median of [100,200,300,400] = (200+300)/2
  });

  it('fills days without sales as null', () => {
    const now = Date.now();
    const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
    const twoDaysAgo = todayStart - 2 * DAY_MS;
    const entries = [
      { pricePerUnit: 500, quantity: 1, timestamp: sec(twoDaysAgo + 1000), hq: false },
    ];
    const result = dailyMedianBuckets(entries, 7);
    expect(result[4]).toBe(500);  // 2 days ago = index 4 (7-1-2)
    expect(result[5]).toBeNull(); // yesterday
    expect(result[6]).toBeNull(); // today
  });

  it('ignores entries older than lookbackDays', () => {
    const now = Date.now();
    const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
    const entries = [
      { pricePerUnit: 9999, quantity: 1, timestamp: sec(todayStart - 10 * DAY_MS), hq: false },
      { pricePerUnit: 100, quantity: 1, timestamp: sec(todayStart + 1000), hq: false },
    ];
    const result = dailyMedianBuckets(entries, 7);
    expect(result[6]).toBe(100);
    expect(result.slice(0, 6).every((v) => v === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/lib/universalisHistory.test.ts 2>&1 | tail -10`
Expected: FAIL — `dailyMedianBuckets is not a function`

- [ ] **Step 3: Implement `dailyMedianBuckets`**

Add to `src/lib/universalisHistory.ts`:

```ts
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function dailyMedianBuckets(
  entries: HistoryEntry[],
  lookbackDays: number,
  nowMs: number = Date.now(),
): (number | null)[] {
  const todayStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const oldestStart = todayStart - (lookbackDays - 1) * DAY_MS;

  // Build map: dayIndex → prices
  const byDay = new Map<number, number[]>();
  for (const e of entries) {
    const tsMs = e.timestamp * 1000;
    const dayStart = Math.floor(tsMs / DAY_MS) * DAY_MS;
    if (dayStart < oldestStart || dayStart > todayStart) continue;
    const dayIndex = Math.round((dayStart - oldestStart) / DAY_MS);
    const arr = byDay.get(dayIndex) ?? [];
    arr.push(e.pricePerUnit);
    byDay.set(dayIndex, arr);
  }

  const result: (number | null)[] = [];
  for (let i = 0; i < lookbackDays; i++) {
    const prices = byDay.get(i);
    result.push(prices && prices.length > 0 ? median(prices) : null);
  }
  return result;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/lib/universalisHistory.test.ts 2>&1 | tail -10`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/universalisHistory.ts src/lib/universalisHistory.test.ts
git commit -m "feat: add dailyMedianBuckets for sparkline data processing"
```

---

## Task 2: Sparkline Color + Tooltip Utilities

**Files:**
- Create: `src/features/sparklines/sparklineColor.ts`
- Create: `src/features/sparklines/sparklineColor.test.ts`
- Create: `src/features/sparklines/sparklineTooltip.ts`
- Create: `src/features/sparklines/sparklineTooltip.test.ts`

- [ ] **Step 1: Write sparklineColor tests**

```ts
// src/features/sparklines/sparklineColor.test.ts
import { describe, it, expect } from 'vitest';
import { colorFromDelta, colorFromPoints } from './sparklineColor';

describe('colorFromDelta', () => {
  it('returns green for rising (delta > 5)', () => {
    expect(colorFromDelta(10)).toBe('#4ade80');
  });
  it('returns red for falling (delta < -5)', () => {
    expect(colorFromDelta(-10)).toBe('#f87171');
  });
  it('returns amber for stable', () => {
    expect(colorFromDelta(3)).toBe('#c9a84c');
  });
  it('returns grey for null', () => {
    expect(colorFromDelta(null)).toBe('#6b7280');
  });
});

describe('colorFromPoints', () => {
  it('returns green when last > first', () => {
    expect(colorFromPoints([100, null, 200])).toBe('#4ade80');
  });
  it('returns red when last < first', () => {
    expect(colorFromPoints([200, null, 100])).toBe('#f87171');
  });
  it('returns grey when equal', () => {
    expect(colorFromPoints([100, 100])).toBe('#6b7280');
  });
  it('returns grey for insufficient points', () => {
    expect(colorFromPoints([null, null, 100])).toBe('#6b7280');
  });
});
```

- [ ] **Step 2: Implement sparklineColor**

```ts
// src/features/sparklines/sparklineColor.ts
const GREEN = '#4ade80';
const RED = '#f87171';
const AMBER = '#c9a84c';
const GREY = '#6b7280';

/** Derive colour from existing delta value (Watchlist rows). */
export function colorFromDelta(delta: number | null): string {
  if (delta === null) return GREY;
  if (delta > 5) return GREEN;
  if (delta < -5) return RED;
  return AMBER;
}

/** Derive colour from first/last non-null points (Crafts rows). */
export function colorFromPoints(points: (number | null)[]): string {
  const nonNull = points.filter((p): p is number => p !== null);
  if (nonNull.length < 2) return GREY;
  const first = nonNull[0];
  const last = nonNull[nonNull.length - 1];
  if (last > first) return GREEN;
  if (last < first) return RED;
  return GREY;
}
```

- [ ] **Step 3: Write sparklineTooltip tests**

```ts
// src/features/sparklines/sparklineTooltip.test.ts
import { describe, it, expect } from 'vitest';
import { formatSparklineTooltip } from './sparklineTooltip';

describe('formatSparklineTooltip', () => {
  it('formats 7 days with values and nulls', () => {
    // Use a fixed date so day names are predictable
    const result = formatSparklineTooltip(
      [1700, 1650, null, 1720, 1800, 1750, 1780],
      new Date('2026-05-23T12:00:00'),
    );
    expect(result).toContain('1,700');
    expect(result).toContain('—');
    expect(result).toContain('← today');
    expect(result.split('\n')).toHaveLength(7);
  });

  it('handles all nulls', () => {
    const result = formatSparklineTooltip(
      [null, null, null, null, null, null, null],
      new Date('2026-05-23T12:00:00'),
    );
    expect(result.split('\n').every((line) => line.includes('—'))).toBe(true);
  });
});
```

- [ ] **Step 4: Implement sparklineTooltip**

```ts
// src/features/sparklines/sparklineTooltip.ts
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatSparklineTooltip(
  buckets: (number | null)[],
  now: Date = new Date(),
): string {
  const lines: string[] = [];
  const todayIdx = buckets.length - 1;

  for (let i = 0; i < buckets.length; i++) {
    const daysAgo = todayIdx - i;
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    const dayName = DAY_NAMES[d.getDay()];
    const value = buckets[i];
    const formatted = value !== null ? value.toLocaleString() : '—';
    const suffix = i === todayIdx ? '  ← today' : '';
    lines.push(`${dayName}  ${formatted}${suffix}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run src/features/sparklines/ 2>&1 | tail -10`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/sparklines/
git commit -m "feat: add sparkline colour and tooltip utilities"
```

---

## Task 3: Enhance Sparkline Component

**Files:**
- Modify: `src/components/Sparkline.tsx`
- Modify: `src/components/Sparkline.test.tsx`
- Create: `src/components/SparklineShimmer.tsx`

- [ ] **Step 1: Write failing tests for new features**

Add to `src/components/Sparkline.test.tsx`:

```tsx
it('renders multiple polyline segments when points contain nulls (gaps)', () => {
  const { container } = render(<Sparkline points={[1, 2, null, 4, 5]} width={80} height={28} />);
  // Two segments: [1,2] and [4,5], separated by null gap
  const polylines = container.querySelectorAll('polyline');
  expect(polylines.length).toBe(2);
});

it('renders a filled dot at the last non-null point', () => {
  const { container } = render(<Sparkline points={[1, 2, 3]} width={80} height={28} />);
  const circle = container.querySelector('circle');
  expect(circle).not.toBeNull();
  expect(circle!.getAttribute('r')).toBe('2');
});

it('applies color prop to stroke and dot', () => {
  const { container } = render(<Sparkline points={[1, 2, 3]} width={80} height={28} color="#f87171" />);
  const polyline = container.querySelector('polyline');
  expect(polyline!.getAttribute('stroke')).toBe('#f87171');
  const circle = container.querySelector('circle');
  expect(circle!.getAttribute('fill')).toBe('#f87171');
});

it('renders dash when fewer than 2 non-null points', () => {
  const { container } = render(<Sparkline points={[null, null, 5]} width={80} height={28} />);
  expect(container.textContent).toContain('—');
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/components/Sparkline.test.tsx 2>&1 | tail -10`
Expected: FAIL

- [ ] **Step 3: Rewrite Sparkline component**

```tsx
// src/components/Sparkline.tsx
interface Props {
  points: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function Sparkline({ points, width = 80, height = 28, color, className = '' }: Props) {
  const nonNull = points.map((p, i) => p !== null ? { value: p, index: i } : null).filter(Boolean) as { value: number; index: number }[];

  if (nonNull.length < 2) {
    return <span className={`font-mono text-xs text-text-low ${className}`}>—</span>;
  }

  const min = Math.min(...nonNull.map((p) => p.value));
  const max = Math.max(...nonNull.map((p) => p.value));
  const range = max - min;
  const stepX = points.length <= 1 ? 0 : width / (points.length - 1);

  function toCoord(index: number, value: number): [number, number] {
    const x = index * stepX;
    const y = range === 0 ? height / 2 : height - ((value - min) / range) * height;
    return [x, y];
  }

  // Split into segments at null gaps
  const segments: string[][] = [];
  let current: string[] = [];
  for (let i = 0; i < points.length; i++) {
    if (points[i] !== null) {
      const [x, y] = toCoord(i, points[i]!);
      current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    } else {
      if (current.length > 0) { segments.push(current); current = []; }
    }
  }
  if (current.length > 0) segments.push(current);

  const strokeColor = color ?? 'currentColor';
  const last = nonNull[nonNull.length - 1];
  const [dotX, dotY] = toCoord(last.index, last.value);

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      {segments.map((seg, i) => (
        <polyline
          key={i}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.5}
          points={seg.join(' ')}
        />
      ))}
      <circle cx={dotX.toFixed(1)} cy={dotY.toFixed(1)} r="2" fill={strokeColor} />
    </svg>
  );
}
```

- [ ] **Step 4: Create SparklineShimmer**

```tsx
// src/components/SparklineShimmer.tsx
export function SparklineShimmer() {
  return (
    <div className="w-[80px] h-[28px] bg-bg-card-hi/50 rounded animate-pulse" />
  );
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npx vitest run src/components/Sparkline.test.tsx 2>&1 | tail -10`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/Sparkline.tsx src/components/Sparkline.test.tsx src/components/SparklineShimmer.tsx
git commit -m "feat: enhance Sparkline with null gaps, colour prop, and endpoint dot"
```

---

## Task 4: `useSparklineHistory` Hook

**Files:**
- Create: `src/features/sparklines/useSparklineHistory.ts`

- [ ] **Step 1: Create the hook**

```ts
// src/features/sparklines/useSparklineHistory.ts
import { useQuery } from '@tanstack/react-query';
import { fetchHistoryWithin, dailyMedianBuckets } from '../../lib/universalisHistory';

const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;
const CHUNK_SIZE = 100;

async function fetchBatched(
  world: string,
  ids: number[],
): Promise<Map<number, (number | null)[]>> {
  const result = new Map<number, (number | null)[]>();
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    try {
      const entries = await fetchHistoryWithin(world, chunk, SEVEN_DAYS_SEC);
      for (const id of chunk) {
        result.set(id, dailyMedianBuckets(entries.get(id) ?? [], 7));
      }
    } catch {
      // Sparklines are non-critical — swallow errors, fill with empty
      for (const id of chunk) {
        result.set(id, [null, null, null, null, null, null, null]);
      }
    }
    // Rate-limit: 100ms between batches (skip delay for last/only batch)
    if (i + CHUNK_SIZE < ids.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return result;
}

export function useSparklineHistory(
  itemIds: number[],
  world: string,
  enabled: boolean,
) {
  const sortedIds = [...itemIds].sort((a, b) => a - b);
  return useQuery<Map<number, (number | null)[]>>({
    queryKey: ['sparkline-history', world, sortedIds],
    enabled: enabled && itemIds.length > 0,
    staleTime: 60 * 60 * 1000, // 1 hour
    queryFn: () => fetchBatched(world, sortedIds),
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/features/sparklines/useSparklineHistory.ts
git commit -m "feat: add useSparklineHistory hook with batched fetching"
```

---

## Task 5: Settings Toggle

**Files:**
- Modify: `src/features/settings/store.ts`
- Modify: `src/routes/Settings.tsx`

- [ ] **Step 1: Add `showSparklines` to settings store**

In `src/features/settings/store.ts`, add to `SettingsState` interface:

```ts
showSparklines: boolean;
setShowSparklines: (v: boolean) => void;
```

Add to `defaultSettings()` return:

```ts
showSparklines: true,
```

Add to the store creator (alongside other setters):

```ts
setShowSparklines: (showSparklines) => set({ showSparklines }),
```

- [ ] **Step 2: Add checkbox to Settings page**

In `src/routes/Settings.tsx`, in the Display section (after `DensityToggle`), add:

```tsx
<label className="flex items-center gap-2 cursor-pointer mt-3">
  <input
    type="checkbox"
    checked={showSparklines}
    onChange={(e) => setShowSparklines(e.target.checked)}
    className="accent-gold w-4 h-4"
  />
  <span className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
    Show price sparklines
  </span>
</label>
<p className="font-mono text-[10px] text-text-low mt-1 ml-6">
  Loads 7-day sale history for items in Watchlist and Crafts results. Uses additional Universalis API calls.
</p>
```

Import `showSparklines` and `setShowSparklines` from `useSettingsStore` at the top of the component.

- [ ] **Step 3: Verify build**

Run: `npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/store.ts src/routes/Settings.tsx
git commit -m "feat: add showSparklines setting toggle"
```

---

## Task 6: Watchlist Table Integration

**Files:**
- Modify: `src/features/watchlist/WatchlistTable.tsx`
- Modify: `src/routes/Watchlist.tsx`

- [ ] **Step 1: Add sparkline column to WatchlistTable**

In `src/features/watchlist/WatchlistTable.tsx`:

Add imports:

```tsx
import { Sparkline } from '../../components/Sparkline';
import { SparklineShimmer } from '../../components/SparklineShimmer';
import { InfoTooltip } from '../../components/InfoTooltip';
import { colorFromDelta } from '../../features/sparklines/sparklineColor';
import { formatSparklineTooltip } from '../../features/sparklines/sparklineTooltip';
```

Update the component props:

```tsx
export function WatchlistTable({ rows, onSelect, sparklineMap, sparklineLoading }: {
  rows: WatchlistRow[];
  onSelect: (id: number) => void;
  sparklineMap?: Map<number, (number | null)[]>;
  sparklineLoading?: boolean;
}) {
```

Add a sparkline column to `COLS` between `dc` (Sale) and `trend` (Trend). Insert at index 4:

```ts
{ key: null, label: '', hideOnMobile: true },  // sparkline — not sortable
```

The COLS array becomes (existing entries unchanged, new one inserted):
```ts
const COLS: { key: SortKey | null; label: string; align?: 'right'; hideOnMobile?: boolean }[] = [
  { key: 'name', label: 'Item' },
  { key: 'crafter', label: 'Craft' },
  { key: 'lvl', label: 'Lvl', align: 'right', hideOnMobile: true },
  { key: 'dc', label: 'Sale', align: 'right' },
  { key: null, label: '', hideOnMobile: true },  // sparkline
  { key: 'trend', label: 'Trend', hideOnMobile: true },
  { key: 'profit', label: 'Profit', align: 'right' },
  { key: 'gilDay', label: 'Gil/day', align: 'right' },
  { key: 'spd', label: 'Velocity', align: 'right', hideOnMobile: true },
];
```

In the `<tbody>`, after the Sale `<td>` and before the Trend `<td>`, add the sparkline cell:

```tsx
<td className={`px-3 ${rowY} hidden md:table-cell`}>
  {sparklineMap ? (() => {
    const buckets = sparklineMap.get(r.id);
    if (!buckets) return sparklineLoading ? <SparklineShimmer /> : null;
    return (
      <InfoTooltip label={<pre className="font-mono text-[10px] whitespace-pre">{formatSparklineTooltip(buckets)}</pre>}>
        <Sparkline points={buckets} color={colorFromDelta(r.delta)} />
      </InfoTooltip>
    );
  })() : null}
</td>
```

When `sparklineMap` is undefined (setting off), the `<td>` should not render at all. To handle this, conditionally include the sparkline column in COLS and the sparkline `<td>` based on whether `sparklineMap` is provided.

Simpler approach: always render the `<th>` and `<td>`, but show nothing when sparklineMap is undefined. The column stays hidden on mobile via `hideOnMobile: true`. When the setting is off, the parent won't pass `sparklineMap`, so the cell renders empty (thin column collapses naturally).

Actually, to fully hide the column when disabled, wrap the COLS in a useMemo that filters out the sparkline entry when no sparklineMap is passed:

```tsx
const showSparkline = sparklineMap != null;

const cols = useMemo(() => {
  const base = [
    { key: 'name' as SortKey | null, label: 'Item' },
    { key: 'crafter' as SortKey | null, label: 'Craft' },
    { key: 'lvl' as SortKey | null, label: 'Lvl', align: 'right' as const, hideOnMobile: true },
    { key: 'dc' as SortKey | null, label: 'Sale', align: 'right' as const },
    ...(showSparkline ? [{ key: null as SortKey | null, label: '', hideOnMobile: true }] : []),
    { key: 'trend' as SortKey | null, label: 'Trend', hideOnMobile: true },
    { key: 'profit' as SortKey | null, label: 'Profit', align: 'right' as const },
    { key: 'gilDay' as SortKey | null, label: 'Gil/day', align: 'right' as const },
    { key: 'spd' as SortKey | null, label: 'Velocity', align: 'right' as const, hideOnMobile: true },
  ];
  return base;
}, [showSparkline]);
```

Then render the sparkline `<td>` only when `showSparkline` is true (between Sale and Trend `<td>`s):

```tsx
{showSparkline && (
  <td className={`px-3 ${rowY} hidden md:table-cell`}>
    {(() => {
      const buckets = sparklineMap!.get(r.id);
      if (!buckets) return sparklineLoading ? <SparklineShimmer /> : null;
      return (
        <InfoTooltip label={<pre className="font-mono text-[10px] whitespace-pre">{formatSparklineTooltip(buckets)}</pre>}>
          <Sparkline points={buckets} color={colorFromDelta(r.delta)} />
        </InfoTooltip>
      );
    })()}
  </td>
)}
```

- [ ] **Step 2: Wire up in Watchlist route**

In `src/routes/Watchlist.tsx`:

Add imports:

```tsx
import { useSparklineHistory } from '../features/sparklines/useSparklineHistory';
import { useSettingsStore } from '../features/settings/store';
```

Inside the component, add (after existing hooks):

```tsx
const showSparklines = useSettingsStore((s) => s.showSparklines);
const sparklineHistory = useSparklineHistory(ids, world, showSparklines);
```

Update the `<WatchlistTable>` render call:

```tsx
<WatchlistTable
  rows={filtered}
  onSelect={setSelectedItemId}
  sparklineMap={showSparklines ? sparklineHistory.data : undefined}
  sparklineLoading={sparklineHistory.isLoading}
/>
```

- [ ] **Step 3: Verify build**

Run: `npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/features/watchlist/WatchlistTable.tsx src/routes/Watchlist.tsx
git commit -m "feat: add sparkline column to Watchlist table"
```

---

## Task 7: Crafts Results Integration

**Files:**
- Modify: `src/features/queries/QueryResults.tsx`
- Modify: `src/features/queries/CraftFlipResults.tsx`
- Modify: `src/features/queries/QueriesView.tsx`

- [ ] **Step 1: Add sparkline column to QueryResults**

In `src/features/queries/QueryResults.tsx`:

Add imports:

```tsx
import { Sparkline } from '../../components/Sparkline';
import { SparklineShimmer } from '../../components/SparklineShimmer';
import { InfoTooltip } from '../../components/InfoTooltip';
import { colorFromPoints } from '../../features/sparklines/sparklineColor';
import { formatSparklineTooltip } from '../../features/sparklines/sparklineTooltip';
```

Update Props interface:

```tsx
interface Props {
  rows: QueryResultRow[];
  totalCandidates: number;
  skippedChunks: number;
  gatheringCatalog?: GatheringCatalog;
  sparklineMap?: Map<number, (number | null)[]>;
  sparklineLoading?: boolean;
}
```

Conditionally add a sparkline column to COLS between `unitPrice` (Current) and `averagePrice` (Average). Use same pattern as Watchlist: only include when `sparklineMap` is provided.

In the tbody rows, add a sparkline `<td>` between the Current price cell and Average price cell:

```tsx
{showSparkline && (
  <td className={`px-3 ${rowY} hidden md:table-cell`}>
    {(() => {
      const buckets = sparklineMap!.get(r.id);
      if (!buckets) return sparklineLoading ? <SparklineShimmer /> : null;
      return (
        <InfoTooltip label={<pre className="font-mono text-[10px] whitespace-pre">{formatSparklineTooltip(buckets)}</pre>}>
          <Sparkline points={buckets} color={colorFromPoints(buckets)} />
        </InfoTooltip>
      );
    })()}
  </td>
)}
```

- [ ] **Step 2: Add sparkline column to CraftFlipResults**

Same pattern in `src/features/queries/CraftFlipResults.tsx`:

Add same imports. Update Props to include `sparklineMap?` and `sparklineLoading?`.

Add sparkline column between Sale and Materials columns.

Add sparkline `<td>` between the sale price cell and materials cell, using `colorFromPoints`.

- [ ] **Step 3: Wire up in QueriesView**

In `src/features/queries/QueriesView.tsx`:

Add imports:

```tsx
import { useSparklineHistory } from '../sparklines/useSparklineHistory';
import { useSettingsStore } from '../settings/store';
```

Inside the component, add:

```tsx
const showSparklines = useSettingsStore((s) => s.showSparklines);

// Fetch sparkline history after query results are available
const sparklineIds = useMemo(() => {
  if (!run.data) return [];
  if (derived?.kind === 'query') return derived.rows.map((r) => r.id);
  if (derived?.kind === 'craft') return derived.rows.map((r) => r.id);
  return [];
}, [run.data, derived]);

const sparklineHistory = useSparklineHistory(sparklineIds, world, showSparklines);
```

Pass to result components:

```tsx
{derived?.kind === 'query' && (
  <QueryResults
    rows={derived.rows}
    totalCandidates={candidateIds.length}
    skippedChunks={run.data?.skipped ?? 0}
    gatheringCatalog={isGathering ? gatheringCatalog.data : undefined}
    sparklineMap={showSparklines ? sparklineHistory.data : undefined}
    sparklineLoading={sparklineHistory.isLoading}
  />
)}
{derived?.kind === 'craft' && (
  <CraftFlipResults
    rows={derived.rows}
    totalCandidates={run.data?.narrowedIds.length ?? 0}
    skippedChunks={run.data?.skipped ?? 0}
    sparklineMap={showSparklines ? sparklineHistory.data : undefined}
    sparklineLoading={sparklineHistory.isLoading}
  />
)}
```

- [ ] **Step 4: Verify build**

Run: `npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/QueryResults.tsx src/features/queries/CraftFlipResults.tsx src/features/queries/QueriesView.tsx
git commit -m "feat: add sparkline column to Crafts query and craft-flip results"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Full build**

Run: `npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 2: Run all tests**

Run: `npx vitest run 2>&1 | tail -20`
Expected: All tests pass. If Sparkline tests fail due to API changes, update test expectations to match new component.

- [ ] **Step 3: Fix any test failures**

Existing `Sparkline.test.tsx` tests pass `number[]` to points which now accepts `(number | null)[]`. The type is compatible — `number[]` is a subtype of `(number | null)[]`. Tests should pass unchanged.

If the "renders a placeholder when points is empty" test fails because `[]` has 0 non-null points (< 2), it should still render `—` — which matches existing test expectation.

If the "renders a flat line" test fails because it checks for exactly 1 polyline but the new code renders 1 segment + 1 circle, update the test to account for the circle element.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: update tests for enhanced Sparkline component"
```
