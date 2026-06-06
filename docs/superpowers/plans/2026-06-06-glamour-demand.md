# Glamour Demand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Glamour Demand" insight page that ranks tradeable FFXIV gear by how often it appears across Eorzea Collection's most-loved glamours (from a committed Python-scraper JSON), joined with marketboard price + velocity.

**Architecture:** A standalone Python scraper writes `public/data/snapshots/glamours.json` (committed). The app fetches it via a static loader → react-query hook, resolves scraped item *names* → item IDs at runtime against the already-loaded item snapshot (pure, tested resolver that drops untradeable + unmatched), auto-runs a cache-backed market scan, and renders a sortable/filterable table matching the GC Seals / What's New idioms.

**Tech Stack:** React + TypeScript, @tanstack/react-query, Vite, Vitest, Tailwind. Reuses `useItemSnapshot`, `useInitialScan`, `fetchInBatches`/`fetchMarketData`, `CategorySelect`, `categoryLabel`, `ItemNameLinks`, `fmtGil`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `public/data/snapshots/glamours.json` | Committed scraper output (sample now; user refreshes monthly) |
| `src/lib/staticSnapshots.ts` (modify) | `loadStaticGlamourRanking()` static fetch |
| `src/lib/staticSnapshots.test.ts` (modify) | Loader test |
| `src/features/queries/useGlamourSnapshot.ts` | react-query hook |
| `src/features/glamour/resolveGlamourRanking.ts` | Pure name→item resolver (the core logic) |
| `src/features/glamour/resolveGlamourRanking.test.ts` | Resolver unit tests |
| `src/features/glamour/GlamourDemandView.tsx` | The page: resolver + market scan + table/filter/sort |
| `src/routes/GlamourDemand.tsx` | Lazy route wrapper |
| `src/App.tsx` (modify) | Register `/glamour` route + page title |
| `src/components/layout/Sidebar.tsx` (modify) | Nav entry under Gil-Making |
| `docs/scraping-glamours.md` | How to run the scraper monthly |

---

## Task 1: Data contract — sample JSON + static loader

**Files:**
- Create: `public/data/snapshots/glamours.json`
- Modify: `src/lib/staticSnapshots.ts` (append loader + types)
- Test: `src/lib/staticSnapshots.test.ts`

- [ ] **Step 1: Create the committed sample data file**

The names below are real tradeable gear (verified present in `items.json`), plus one untradeable item and one bogus name so the page's footnote (untradeable/unmatched counts) has something to show until the user runs the real scraper.

Create `public/data/snapshots/glamours.json`:

```json
{
  "generated_at": "2026-06-01T00:00:00Z",
  "pages_scraped": 10,
  "glamours_checked": 360,
  "unique_items": 6,
  "ranking": [
    { "item": "Dream Hat", "uses": 87 },
    { "item": "Company Hat", "uses": 71 },
    { "item": "Leather Calot", "uses": 54 },
    { "item": "Usagi Kabuto", "uses": 33 },
    { "item": "Hempen Coif", "uses": 21 },
    { "item": "Dated Sheepskin Pot Helm", "uses": 12 },
    { "item": "Totally Not A Real Item Name", "uses": 4 }
  ]
}
```

- [ ] **Step 2: Write the failing loader test**

Append to `src/lib/staticSnapshots.test.ts` (the file already defines `mockFetch`; add `loadStaticGlamourRanking` to the imports at the top):

```ts
describe('loadStaticGlamourRanking', () => {
  it('returns generatedAt + ranking on 200', async () => {
    mockFetch({
      '/data/snapshots/glamours.json': {
        status: 200,
        body: { generated_at: '2026-06-01T00:00:00Z', ranking: [{ item: 'Dream Hat', uses: 87 }] },
      },
    });
    const got = await loadStaticGlamourRanking();
    expect(got).toEqual({
      generatedAt: '2026-06-01T00:00:00Z',
      ranking: [{ item: 'Dream Hat', uses: 87 }],
    });
  });

  it('returns null when the bundle is missing', async () => {
    mockFetch({});
    expect(await loadStaticGlamourRanking()).toBeNull();
  });

  it('defaults a missing ranking to an empty array', async () => {
    mockFetch({
      '/data/snapshots/glamours.json': { status: 200, body: { generated_at: 'x' } },
    });
    const got = await loadStaticGlamourRanking();
    expect(got).toEqual({ generatedAt: 'x', ranking: [] });
  });
});
```

Update the import block at the top of the test file to include `loadStaticGlamourRanking`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/staticSnapshots.test.ts`
Expected: FAIL — `loadStaticGlamourRanking is not a function` / import error.

- [ ] **Step 4: Implement the loader**

Append to `src/lib/staticSnapshots.ts`:

```ts
export interface RawGlamourEntry {
  item: string;
  uses: number;
}

export interface GlamourRankingData {
  generatedAt: string | null;
  ranking: RawGlamourEntry[];
}

/**
 * Loads the Eorzea Collection glamour-item ranking produced by the standalone
 * Python scraper (see docs/scraping-glamours.md). Plain fetch, null on failure —
 * the page treats null as "no data yet" and shows an empty state.
 */
export async function loadStaticGlamourRanking(): Promise<GlamourRankingData | null> {
  const raw = await load<{ generated_at?: string; ranking?: RawGlamourEntry[] }>(
    `${BASE}/glamours.json`,
  );
  if (!raw) return null;
  return {
    generatedAt: typeof raw.generated_at === 'string' ? raw.generated_at : null,
    ranking: Array.isArray(raw.ranking) ? raw.ranking : [],
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/staticSnapshots.test.ts`
Expected: PASS (all describes green).

- [ ] **Step 6: Commit**

```bash
git add public/data/snapshots/glamours.json src/lib/staticSnapshots.ts src/lib/staticSnapshots.test.ts
git commit -m "feat(glamour): sample ranking data + static loader"
```

---

## Task 2: react-query hook `useGlamourSnapshot`

**Files:**
- Create: `src/features/queries/useGlamourSnapshot.ts`

No new test — this is a thin react-query wrapper over the tested loader, mirroring `useWhatsNewSnapshot`.

- [ ] **Step 1: Create the hook**

Create `src/features/queries/useGlamourSnapshot.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { loadStaticGlamourRanking, type GlamourRankingData } from '../../lib/staticSnapshots';

const EMPTY: GlamourRankingData = { generatedAt: null, ranking: [] };

export function useGlamourSnapshot() {
  return useQuery<GlamourRankingData>({
    queryKey: ['glamourSnapshot'],
    staleTime: Infinity,
    queryFn: async () => (await loadStaticGlamourRanking()) ?? EMPTY,
  });
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/useGlamourSnapshot.ts
git commit -m "feat(glamour): useGlamourSnapshot hook"
```

---

## Task 3: Pure resolver `resolveGlamourRanking` (core logic)

**Files:**
- Create: `src/features/glamour/resolveGlamourRanking.ts`
- Test: `src/features/glamour/resolveGlamourRanking.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/glamour/resolveGlamourRanking.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveGlamourRanking } from './resolveGlamourRanking';
import type { SnapshotItem } from '../../lib/itemSnapshot';

function item(id: number, name: string, sc: number, ilvl = 1): SnapshotItem {
  return { id, name, sc, ui: 0, ilvl, canHq: false };
}

describe('resolveGlamourRanking', () => {
  it('matches names to ids and keeps tradeable rows sorted by uses desc', () => {
    const items = [item(10, 'Dream Hat', 31, 5), item(20, 'Company Hat', 31, 3)];
    const out = resolveGlamourRanking(
      [{ item: 'Company Hat', uses: 5 }, { item: 'Dream Hat', uses: 9 }],
      items,
    );
    expect(out.rows.map((r) => r.id)).toEqual([10, 20]); // 9 uses before 5
    expect(out.rows[0]).toMatchObject({ id: 10, name: 'Dream Hat', sc: 31, ilvl: 5, uses: 9 });
    expect(out.matched).toBe(2);
  });

  it('normalizes case, whitespace, and HQ markers when matching', () => {
    const items = [item(10, 'Dream Hat', 31)];
    const out = resolveGlamourRanking(
      [{ item: '  dream   hat ', uses: 4 }], // collapsed ws + HQ glyph
      items,
    );
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].id).toBe(10);
  });

  it('drops untradeable (sc === 0) matches and counts them', () => {
    const items = [item(10, 'Artifact Helm', 0)];
    const out = resolveGlamourRanking([{ item: 'Artifact Helm', uses: 50 }], items);
    expect(out.rows).toEqual([]);
    expect(out.untradeable).toBe(1);
    expect(out.matched).toBe(0);
  });

  it('counts unmatched names', () => {
    const items = [item(10, 'Dream Hat', 31)];
    const out = resolveGlamourRanking([{ item: 'Nonexistent Item', uses: 3 }], items);
    expect(out.rows).toEqual([]);
    expect(out.unmatched).toBe(1);
  });

  it('on duplicate normalized names, the lowest id wins', () => {
    const items = [item(30, 'Mirage Coat', 33), item(10, 'Mirage Coat', 33)];
    const out = resolveGlamourRanking([{ item: 'Mirage Coat', uses: 1 }], items);
    expect(out.rows[0].id).toBe(10);
  });

  it('tie-breaks equal uses by name ascending', () => {
    const items = [item(10, 'Beta Hat', 31), item(20, 'Alpha Hat', 31)];
    const out = resolveGlamourRanking(
      [{ item: 'Beta Hat', uses: 7 }, { item: 'Alpha Hat', uses: 7 }],
      items,
    );
    expect(out.rows.map((r) => r.name)).toEqual(['Alpha Hat', 'Beta Hat']);
  });

  it('skips malformed entries without counting them as unmatched', () => {
    const items = [item(10, 'Dream Hat', 31)];
    const out = resolveGlamourRanking(
      [{ item: '', uses: 5 }, { item: 'Dream Hat', uses: 0 } as never, { uses: 1 } as never],
      items,
    );
    expect(out.rows.map((r) => r.id)).toEqual([10]);
    expect(out.unmatched).toBe(0);
  });

  it('accepts a Map<number,SnapshotItem> as the item source', () => {
    const map = new Map([[10, item(10, 'Dream Hat', 31)]]);
    const out = resolveGlamourRanking([{ item: 'Dream Hat', uses: 2 }], map);
    expect(out.rows[0].id).toBe(10);
  });

  it('returns empty result for empty ranking', () => {
    const out = resolveGlamourRanking([], [item(10, 'Dream Hat', 31)]);
    expect(out).toEqual({ rows: [], matched: 0, unmatched: 0, untradeable: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/glamour/resolveGlamourRanking.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the resolver**

Create `src/features/glamour/resolveGlamourRanking.ts`:

```ts
import type { SnapshotItem } from '../../lib/itemSnapshot';

export interface RawGlamourEntry {
  item: string;
  uses: number;
}

export interface ResolvedGlamourItem {
  id: number;
  name: string;
  sc: number;
  ilvl: number;
  rarity?: number;
  uses: number;
}

export interface GlamourResolution {
  rows: ResolvedGlamourItem[];
  matched: number;
  unmatched: number;
  untradeable: number;
}

/**
 * Normalize an item name for matching: NFKC, drop the HQ glyph () and a
 * trailing "(HQ)", lowercase, trim, collapse internal whitespace.
 */
function normalize(name: string): string {
  return name
    .normalize('NFKC')
    .replace(//g, '')
    .replace(/\s*\(hq\)\s*$/i, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function toItemArray(src: SnapshotItem[] | Map<number, SnapshotItem>): SnapshotItem[] {
  return Array.isArray(src) ? src : [...src.values()];
}

/**
 * Join scraped glamour item names to the item snapshot. Drops untradeable
 * (sc === 0) and unmatched names, counting each for a transparency footnote.
 * Output rows are sorted by uses desc, then name asc (deterministic).
 */
export function resolveGlamourRanking(
  ranking: RawGlamourEntry[],
  items: SnapshotItem[] | Map<number, SnapshotItem>,
): GlamourResolution {
  // Build normalized-name → item index; lowest id wins on collisions.
  const byName = new Map<string, SnapshotItem>();
  for (const it of toItemArray(items)) {
    if (!it.name) continue;
    const key = normalize(it.name);
    const existing = byName.get(key);
    if (!existing || it.id < existing.id) byName.set(key, it);
  }

  const rows: ResolvedGlamourItem[] = [];
  let matched = 0;
  let unmatched = 0;
  let untradeable = 0;

  for (const entry of ranking) {
    if (!entry || typeof entry.item !== 'string' || typeof entry.uses !== 'number') continue;
    const key = normalize(entry.item);
    if (key === '') continue;
    const hit = byName.get(key);
    if (!hit) {
      unmatched++;
      continue;
    }
    if (hit.sc === 0) {
      untradeable++;
      continue;
    }
    matched++;
    rows.push({
      id: hit.id,
      name: hit.name,
      sc: hit.sc,
      ilvl: hit.ilvl,
      rarity: hit.rarity,
      uses: entry.uses,
    });
  }

  rows.sort((a, b) => (b.uses - a.uses) || a.name.localeCompare(b.name));
  return { rows, matched, unmatched, untradeable };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/glamour/resolveGlamourRanking.test.ts`
Expected: PASS (9 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/features/glamour/resolveGlamourRanking.ts src/features/glamour/resolveGlamourRanking.test.ts
git commit -m "feat(glamour): name->item resolver with untradeable/unmatched accounting"
```

---

## Task 4: The page `GlamourDemandView`

**Files:**
- Create: `src/features/glamour/GlamourDemandView.tsx`

This composes tested pieces (resolver + market scan). No new unit test; verified by tsc/lint + manual run in Task 6.

- [ ] **Step 1: Create the view**

Create `src/features/glamour/GlamourDemandView.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useGlamourSnapshot } from '../queries/useGlamourSnapshot';
import { resolveGlamourRanking } from './resolveGlamourRanking';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData, type MarketItem } from '../../lib/universalis';
import { useInitialScan } from '../queries/useInitialScan';
import { CategorySelect } from '../../components/CategorySelect';
import { categoryLabel } from '../../lib/itemSearchCategories';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { EmptyState } from '../../components/EmptyState';
import { SectionHeader } from '../../components/SectionHeader';
import { Spinner, SpinGlyph } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { fmtGil } from '../../lib/format';

type SortKey = 'uses' | 'ilvl' | 'price' | 'velocity' | 'name';
interface SortState { key: SortKey; dir: 'asc' | 'desc' }

function salePrice(m: MarketItem): number {
  return m.medianNQ ?? m.medianHQ ?? m.minNQ ?? m.minHQ ?? 0;
}

function relativeAge(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

export function GlamourDemandView() {
  const { world } = useSettingsStore();
  const itemSnap = useItemSnapshot();
  const glamour = useGlamourSnapshot();
  const [selectedCats, setSelectedCats] = useState<number[]>([]);
  const [sort, setSort] = useState<SortState>({ key: 'uses', dir: 'desc' });

  // Resolve scraped names → tradeable items (+ unmatched/untradeable counts).
  const resolution = useMemo(() => {
    if (!itemSnap.data || !glamour.data) {
      return { rows: [], matched: 0, unmatched: 0, untradeable: 0 };
    }
    return resolveGlamourRanking(glamour.data.ranking, itemSnap.data.items);
  }, [itemSnap.data, glamour.data]);

  const resolvedIds = useMemo(() => resolution.rows.map((r) => r.id), [resolution.rows]);

  const scan = useMutation<{ saleMap: MarketData; skipped: number }>({
    mutationFn: async () => {
      if (resolvedIds.length === 0) return { saleMap: {}, skipped: 0 };
      const res = await fetchInBatches<MarketItem>(
        resolvedIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return { saleMap: res.data, skipped: res.errors.length };
    },
  });

  const ready = itemSnap.data != null && glamour.data != null && resolvedIds.length > 0;
  useInitialScan(ready, () => scan.mutate());

  // Category filter options, derived from the resolved rows present.
  const categories = useMemo(() => {
    const ids = [...new Set(resolution.rows.map((r) => r.sc))];
    return ids.map((id) => ({ id, name: categoryLabel(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [resolution.rows]);

  const maxUses = useMemo(
    () => resolution.rows.reduce((m, r) => Math.max(m, r.uses), 0),
    [resolution.rows],
  );

  const rows = useMemo(() => {
    const saleMap = scan.data?.saleMap ?? {};
    let list = resolution.rows.map((r) => {
      const m = saleMap[String(r.id)];
      return { ...r, price: m ? salePrice(m) : null, velocity: m ? m.velocity : null };
    });
    if (selectedCats.length > 0) list = list.filter((r) => selectedCats.includes(r.sc));
    const dir = sort.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let cmp: number;
      if (sort.key === 'name') cmp = a.name.localeCompare(b.name);
      else if (sort.key === 'price') cmp = (a.price ?? -1) - (b.price ?? -1);
      else if (sort.key === 'velocity') cmp = (a.velocity ?? -1) - (b.velocity ?? -1);
      else cmp = (a[sort.key] as number) - (b[sort.key] as number);
      return cmp * dir || a.name.localeCompare(b.name);
    });
    return list;
  }, [resolution.rows, scan.data, selectedCats, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '');
  const age = relativeAge(glamour.data?.generatedAt ?? null);

  if (glamour.data && glamour.data.ranking.length === 0) {
    return (
      <div className="max-w-[100rem] mx-auto px-4 space-y-4">
        <Header age={null} resolution={resolution} />
        <EmptyState
          icon="✦"
          message="No glamour ranking data yet. Run the Eorzea Collection scraper (see docs/scraping-glamours.md) and commit public/data/snapshots/glamours.json."
        />
      </div>
    );
  }

  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <Header age={age} resolution={resolution} />

      {categories.length > 0 && (
        <div className="max-w-md">
          <CategorySelect
            categories={categories}
            selected={selectedCats}
            onChange={setSelectedCats}
            placeholder="Filter by category…"
          />
        </div>
      )}

      {scan.isPending && <Spinner label={`Fetching ${world} prices for ${resolvedIds.length} items…`} />}
      {scan.data && scan.data.skipped > 0 && (
        <StatusBanner kind="error">{scan.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          <SectionHeader label={`Glamour items (${rows.length})`} />

          {/* Mobile card list */}
          <div className="md:hidden border border-border-base bg-bg-card divide-y divide-border-base">
            {rows.map((row, idx) => (
              <div key={row.id} className="p-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-text-low w-6 shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <ItemNameLinks id={row.id} name={row.name} sub={categoryLabel(row.sc)} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 pl-8 font-mono text-xs">
                  <Stat label="Uses" value={String(row.uses)} tone="text-aether" />
                  <Stat label="Price" value={row.price != null ? fmtGil(row.price) : '—'} tone="text-gold" />
                  <Stat label="Vel" value={row.velocity != null ? `${row.velocity.toFixed(1)}/d` : '—'} tone="text-text-cream" />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <table className="w-full text-xs font-mono hidden md:table">
            <thead>
              <tr className="border-b border-border-base">
                <th className="text-left px-2 py-1 text-text-low font-normal">#</th>
                <Th onClick={() => toggleSort('name')} className="text-left">Item{arrow('name')}</Th>
                <th className="text-left px-2 py-1 text-text-low font-normal">Category</th>
                <Th onClick={() => toggleSort('ilvl')} className="text-right">Lvl{arrow('ilvl')}</Th>
                <Th onClick={() => toggleSort('uses')} className="text-right">Uses{arrow('uses')}</Th>
                <Th onClick={() => toggleSort('price')} className="text-right">Price{arrow('price')}</Th>
                <Th onClick={() => toggleSort('velocity')} className="text-right">Vel/day{arrow('velocity')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border-base hover:bg-bg-card-hi/50 transition-colors">
                  <td className="px-2 py-1.5 text-text-low">{idx + 1}</td>
                  <td className="px-2 py-1.5"><ItemNameLinks id={row.id} name={row.name} /></td>
                  <td className="px-2 py-1.5 text-text-low">{categoryLabel(row.sc)}</td>
                  <td className="text-right px-2 py-1.5 tabular-nums">i{row.ilvl}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-2">
                      <span className="h-1.5 bg-aether/60" style={{ width: `${maxUses ? (row.uses / maxUses) * 48 : 0}px` }} />
                      <span className="tabular-nums text-aether w-8 text-right">{row.uses}</span>
                    </div>
                  </td>
                  <td className="text-right px-2 py-1.5 tabular-nums text-gold">{row.price != null ? fmtGil(row.price) : '—'}</td>
                  <td className="text-right px-2 py-1.5 tabular-nums">{row.velocity != null ? row.velocity.toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ready && scan.data && rows.length === 0 && (
        <StatusBanner kind="info">No items match the current filter.</StatusBanner>
      )}
    </div>
  );
}

function Header({ age, resolution }: { age: string | null; resolution: { matched: number; unmatched: number; untradeable: number } }) {
  return (
    <div>
      <h2 className="font-display text-lg text-gold tracking-wide">Glamour Demand</h2>
      <p className="font-mono text-[11px] text-text-low max-w-prose">
        Tradeable gear ranked by how often it appears in Eorzea Collection's most-loved glamours.
        {age ? ` Scraped ${age}.` : ''}
      </p>
      <p className="font-mono text-[10px] text-text-low mt-1">
        {resolution.matched} ranked · {resolution.unmatched} unmatched · {resolution.untradeable} untradeable hidden
      </p>
    </div>
  );
}

function Th({ children, onClick, className = '' }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <th
      onClick={onClick}
      className={`px-2 py-1 text-text-low font-normal cursor-pointer select-none hover:text-aether ${className}`}
    >
      {children}
    </th>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">{label}</div>
      <div className={`mt-0.5 tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exit 0. If `SpinGlyph` is unused, remove it from the import. If `MarketData`/`MarketItem` exports differ, align imports with `src/lib/universalis.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/features/glamour/GlamourDemandView.tsx
git commit -m "feat(glamour): GlamourDemandView page (resolver + market scan + table)"
```

---

## Task 5: Route + navigation wiring

**Files:**
- Create: `src/routes/GlamourDemand.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create the route wrapper**

Create `src/routes/GlamourDemand.tsx`:

```tsx
import { GlamourDemandView } from '../features/glamour/GlamourDemandView';

export default function GlamourDemand() {
  return <GlamourDemandView />;
}
```

- [ ] **Step 2: Register the route + page title in `src/App.tsx`**

Add the import alongside the other route imports (after the `Heatmap` import on line ~34):

```tsx
import GlamourDemand from './routes/GlamourDemand';
```

Add to the `PAGE_TITLES` map (near line 67, after `'/heatmap': 'Heatmap',`):

```tsx
  '/glamour': 'Glamour Demand',
```

Add the `<Route>` inside the inner `<Routes>` (after the `/heatmap` route on line ~140):

```tsx
                        <Route path="/glamour" element={<GlamourDemand />} />
```

- [ ] **Step 3: Add the sidebar nav entry**

In `src/components/layout/Sidebar.tsx`, inside the `Gil-Making` group's `items` array (after `{ label: 'Housing', path: '/housing' },`), add:

```tsx
      { label: 'Glamour Demand', path: '/glamour' },
```

- [ ] **Step 4: Verify it typechecks and lints**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx eslint src/routes/GlamourDemand.tsx src/features/glamour --ext ts,tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/GlamourDemand.tsx src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(glamour): wire /glamour route + Gil-Making nav entry"
```

---

## Task 6: Docs, full verification, and manual run

**Files:**
- Create: `docs/scraping-glamours.md`

- [ ] **Step 1: Write the scraper run note**

Create `docs/scraping-glamours.md`:

```markdown
# Refreshing the Glamour Demand data

The Glamour Demand page reads `public/data/snapshots/glamours.json`, produced by
a standalone Python scraper of Eorzea Collection's most-loved glamours.

## Monthly refresh

1. Run the scraper (Python 3.11+, `pip install httpx beautifulsoup4`):
   - Set its `OUTPUT_FILE` to `public/data/snapshots/glamours.json` (or copy the
     output there afterward).
   - Default config scrapes 10 pages (~360 glamours) with a 1s polite delay.
2. Commit the refreshed `glamours.json`.
3. Deploy. The page resolves item names → IDs at runtime against the current item
   snapshot and drops untradeable/unmatched names automatically.

## Output format

```json
{ "generated_at": "ISO-8601-UTC", "ranking": [ { "item": "Name", "uses": 87 } ] }
```

`generated_at` drives the "Scraped X ago" freshness line; `ranking` is the
appearance-count ranking. Other fields are informational.
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (existing 1499 + new loader/resolver tests).

- [ ] **Step 3: Typecheck, lint, and build**

Run: `npx tsc --noEmit` → exit 0
Run: `npm run lint` → exit 0
Run: `npm run build` → succeeds

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, open the app, click **Gil-Making → Glamour Demand**.
Expected:
- Table auto-loads with the sample items (Dream Hat, Company Hat, Leather Calot, Usagi Kabuto, Hempen Coif) ranked by Uses desc, with price/velocity populated from the current world.
- Header footnote reads "5 ranked · 1 unmatched · 1 untradeable hidden".
- Clicking column headers re-sorts; the category filter narrows the list.

- [ ] **Step 5: Commit**

```bash
git add docs/scraping-glamours.md
git commit -m "docs(glamour): how to refresh the scraper data"
```

---

## Self-Review notes

- **Spec coverage:** data contract (T1), runtime resolver with untradeable/unmatched accounting (T3), market-opportunity columns + filter + freshness + transparency footnote (T4), routing/nav under Gil-Making (T5), docs (T6). All spec sections mapped.
- **Type consistency:** `RawGlamourEntry` is defined in both `staticSnapshots.ts` (loader) and `resolveGlamourRanking.ts` (resolver) with the identical shape `{ item: string; uses: number }` — the resolver takes its own copy to stay I/O-free; the view passes `glamour.data.ranking` (loader's type) into the resolver (structurally identical). `GlamourResolution`/`ResolvedGlamourItem` names are consistent across T3/T4. Sort keys (`uses|ilvl|price|velocity|name`) match the columns rendered.
- **Marketability proxy:** `sc === 0` = untradeable, matching the heatmap's existing convention.
```
