# Home Hub + Pack Browsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull most setup options out of the Settings page and onto Home as collapsible panels (Settings keeps only cache + backup). Add per-pack drill-down so each starter pack expands to show individual items with their own checkboxes. Ship three new starter packs: Materia XI, crafted minions, classic glamour.

**Architecture:** Watchlist store gets one new field `excludedItems: number[]` plus setter. `allItemsFromEnabledPacks` filters them. Pack list UI grows a `<details>` per pack with item-level checkboxes. Home page wraps existing inputs + four new panel sections in a `<details>` shell. Settings deletes all but two sections.

**Approval:** Design approved in conversation. No separate spec doc.

---

## Conventions

- TDD for store changes + pure helpers.
- Each task ends in a clean commit.
- `npm test -- --run` and `npm run build` stay green.
- Run from `c:/Users/esthe/Documents/Dev/ffxiv-helper`.

---

## Task 1: Watchlist store — `excludedItems`

**Files:**
- Modify: `src/features/items/watchlistStore.ts`
- Modify: `src/features/items/watchlistStore.test.ts`

- [ ] **Step 1: Extend `WatchlistState`**

```ts
export interface WatchlistState {
  // ... existing
  excludedItems: number[];
  toggleExcluded: (itemId: number) => void;
}
```

Update `defaultWatchlist()` to include `excludedItems: []`.

Add the setter:
```ts
toggleExcluded: (itemId) => set((s) => ({
  excludedItems: s.excludedItems.includes(itemId)
    ? s.excludedItems.filter((id) => id !== itemId)
    : [...s.excludedItems, itemId],
})),
```

- [ ] **Step 2: Tests**

Append to `watchlistStore.test.ts`:
```ts
it('excludedItems starts empty', () => {
  expect(useWatchlistStore.getState().excludedItems).toEqual([]);
});

it('toggleExcluded adds and removes ids idempotently', () => {
  useWatchlistStore.getState().toggleExcluded(99);
  expect(useWatchlistStore.getState().excludedItems).toEqual([99]);
  useWatchlistStore.getState().toggleExcluded(99);
  expect(useWatchlistStore.getState().excludedItems).toEqual([]);
});

it('toggleExcluded preserves other excluded ids', () => {
  useWatchlistStore.getState().toggleExcluded(1);
  useWatchlistStore.getState().toggleExcluded(2);
  useWatchlistStore.getState().toggleExcluded(1);
  expect(useWatchlistStore.getState().excludedItems).toEqual([2]);
});
```

- [ ] **Step 3: Pass + commit**

```
git add -A
git commit -m "feat(items): excludedItems list in watchlist store"
```

---

## Task 2: starterPacks — filter excludedItems

**Files:**
- Modify: `src/features/items/starterPacks.ts`
- Modify: `src/features/items/starterPacks.test.ts`

`allItemsFromEnabledPacks` takes an additional optional `excluded: Set<number>` and skips matching ids.

- [ ] **Step 1: Update signature**

```ts
export function allItemsFromEnabledPacks(
  toggles: StarterPackToggles,
  excluded: Set<number> = new Set(),
): TrackedItem[] {
  const seen = new Set<number>();
  const out: TrackedItem[] = [];
  for (const pack of STARTER_PACKS) {
    if (!toggles[pack.id]) continue;
    for (const item of pack.items) {
      if (seen.has(item.id) || excluded.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
```

- [ ] **Step 2: Add a test**

Append to `starterPacks.test.ts`:
```ts
it('respects the excluded set when given', () => {
  const enabled: StarterPackToggles = {
    'raid-current': true, 'tinctures-g4': false, 'food-7x': false, 'dyes': false,
    'materia-xii': false, 'materia-xi': false, 'minions-crafted': false,
    'glamour-faves': false, 'glamour-classic': false, 'housing-faves': false,
  };
  const excluded = new Set([49281]); // a raid item
  const items = allItemsFromEnabledPacks(enabled, excluded);
  expect(items.some((i) => i.id === 49281)).toBe(false);
  expect(items.length).toBeGreaterThan(0);
});
```

NOTE: the keys above include the new packs we're about to add in Task 3. The current `StarterPackToggles` only has the original 7 IDs. Update its type via the existing `StarterPackId` union — Task 3 will add the new IDs. Until Task 3, use only the existing 7 keys in this test:
```ts
const enabled: StarterPackToggles = {
  'raid-current': true, 'tinctures-g4': false, 'food-7x': false, 'dyes': false,
  'materia-xii': false, 'glamour-faves': false, 'housing-faves': false,
};
```

(Update again after Task 3 if needed.)

- [ ] **Step 3: Wire `excludedItems` through callers**

Two consumers compute the active item list:
- `src/routes/Watchlist.tsx`
- `src/features/session/SessionPlanner.tsx`

In each, change the `useMemo` that calls `allItemsFromEnabledPacks(starterPacks)`:
```ts
const { starterPacks, customItems, perItemFlags, excludedItems } = useWatchlistStore();

const items = useMemo(() => {
  const fromPacks = allItemsFromEnabledPacks(starterPacks, new Set(excludedItems));
  const seen = new Set(fromPacks.map((i) => i.id));
  return [...fromPacks, ...customItems.filter((i) => !seen.has(i.id) && !excludedItems.includes(i.id))];
}, [starterPacks, customItems, excludedItems]);
```

Custom items are also filtered by `excludedItems` so the same exclusion list works across packs and custom adds.

- [ ] **Step 4: Pass + commit**

```
git add -A
git commit -m "feat(items): allItemsFromEnabledPacks respects excludedItems"
```

---

## Task 3: New starter packs — Materia XI, minions, classic glamour

**Files:**
- Modify: `src/features/items/types.ts` (extend `StarterPackId`)
- Modify: `src/features/items/starterPacks.ts`

We need item IDs. Use XIVAPI to verify each ID before hardcoding. The agent should run a one-off XIVAPI search via curl for each item name and confirm the row_id, then encode here. If a specific item can't be verified, leave it out of the pack rather than guessing.

Use this helper command to search:
```
curl -s 'https://v2.xivapi.com/api/search?sheets=Item&query=Name~"<NAME>"&fields=Name,LevelItem&limit=5' | head -200
```

- [ ] **Step 1: Extend `StarterPackId` in `src/features/items/types.ts`**

```ts
export type StarterPackId =
  | 'raid-current'
  | 'tinctures-g4'
  | 'food-7x'
  | 'dyes'
  | 'materia-xii'
  | 'materia-xi'
  | 'minions-crafted'
  | 'glamour-faves'
  | 'glamour-classic'
  | 'housing-faves';
```

- [ ] **Step 2: Add the new pack data in `src/features/items/starterPacks.ts`**

Verify each ID with `curl` to XIVAPI before adding. Materia XI should be sequential (one less than Materia XII's 41771-41782). After verification, add:

```ts
const materiaXi: TrackedItem[] = [
  // Verify each id via: curl 'https://v2.xivapi.com/api/search?sheets=Item&query=Name~"Heavens%27+Eye+Materia+XI"&fields=Name&limit=1'
  { id: 33917, name: "Heavens' Eye Materia XI", crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 33918, name: 'Savage Aim Materia XI',   crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 33919, name: 'Savage Might Materia XI', crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 33920, name: 'Battledance Materia XI',  crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 33927, name: 'Quickarm Materia XI',     crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 33928, name: 'Quicktongue Materia XI',  crafter: 'ANY', lvl: 100, cat: 'Materia' },
];
```

(IDs are best-effort guesses based on the 41771-41782 pattern for Materia XII. **Verify each one with curl before committing.** If an ID is wrong, look it up and correct.)

For minions, common crafted ones with widely-known IDs:
```ts
const minionsCrafted: TrackedItem[] = [
  // Verify each via XIVAPI search before adding.
  { id: 6071, name: 'Wind-up Moogle',     crafter: 'WVR', lvl: 50, cat: 'Glamour' }, // (cat=Glamour because we don't have a 'Minion' category yet — see note below)
  // Add 4-6 more verified minions (Wind-up Tonberry, Wind-up Sun, Wind-up Onion Prince, etc.)
];
```

NOTE: there's no `'Minion'` value in the `ItemCategory` type. Either add it to the union (in `types.ts`) or use the closest existing one. Cleanest: add `'Minion'` to `ItemCategory` and update the filter chip list in `FilterBar.tsx` to include 'Minion'. Do this here in Task 3.

For classic glamour:
```ts
const glamourClassic: TrackedItem[] = [
  // Verify each via XIVAPI before adding.
  // Doman pieces, Eorzean Songbird, Lord of Crowns, etc.
];
```

If verification turns up unclear IDs for the classics, ship the pack as `glamourClassic: []` with a TODO comment — the user can populate via the existing search-add custom-items UI.

Add the three packs to `STARTER_PACKS` (default OFF — they're optional):
```ts
{ id: 'materia-xi',     label: 'Materia XI',                defaultOn: false, items: materiaXi },
{ id: 'minions-crafted', label: 'Crafted minions',          defaultOn: false, items: minionsCrafted },
{ id: 'glamour-classic', label: 'Classic glamour',          defaultOn: false, items: glamourClassic },
```

- [ ] **Step 3: Update `ItemCategory` in `types.ts` if you added 'Minion'**

```ts
export type ItemCategory = 'Raid' | 'Tincture' | 'Food' | 'Dye' | 'Glamour' | 'Housing' | 'Materia' | 'Minion';
```

Update `CATS` arrays in `FilterBar.tsx` and `AddItemSearch.tsx` to include `'Minion'`.

- [ ] **Step 4: Pass + commit**

The starterPacks test for "has all seven packs" needs updating — change to "has ten packs" with the right id list. Update the test array assertion.

```
git add -A
git commit -m "feat(items): add Materia XI, crafted minions, classic glamour packs"
```

---

## Task 4: Pack drilldown UI

**Files:**
- Modify: `src/features/settings/PackToggles.tsx`

Each pack card becomes a `<details>` with the pack toggle in `<summary>` and the per-item checkbox list inside. Per-item state reads/writes via `excludedItems`.

- [ ] **Step 1: Refactor `PackToggles.tsx`**

```tsx
import { STARTER_PACKS } from '../items/starterPacks';
import { useWatchlistStore } from '../items/watchlistStore';

export function PackToggles() {
  const { starterPacks, togglePack, excludedItems, toggleExcluded } = useWatchlistStore();
  const excludedSet = new Set(excludedItems);

  return (
    <ul className="space-y-2">
      {STARTER_PACKS.map((p) => {
        const on = starterPacks[p.id];
        const includedCount = on ? p.items.filter((i) => !excludedSet.has(i.id)).length : 0;
        return (
          <li key={p.id}>
            <details className="border border-border-base bg-bg-card group open:border-border-hi">
              <summary className="flex justify-between items-center px-3 py-2 cursor-pointer list-none font-mono text-xs">
                <span className="flex items-center gap-2">
                  <span
                    role="button"
                    onClick={(e) => { e.preventDefault(); togglePack(p.id); }}
                    className={`px-2 py-0.5 border text-[10px] tracking-widest uppercase ${
                      on ? 'border-gold text-gold bg-bg-card-hi' : 'border-border-base text-text-dim'
                    }`}
                  >
                    {on ? 'On' : 'Off'}
                  </span>
                  <span className="text-text-cream">{p.label}</span>
                </span>
                <span className="text-text-low text-[10px] tracking-widest uppercase">
                  {on ? `${includedCount} / ${p.items.length}` : `${p.items.length} items`}
                </span>
              </summary>
              {on && (
                <ul className="border-t border-border-base">
                  {p.items.map((item) => {
                    const isExcluded = excludedSet.has(item.id);
                    return (
                      <li key={item.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-border-base last:border-b-0">
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => toggleExcluded(item.id)}
                          aria-label={`Include ${item.name}`}
                        />
                        <span className={`text-sm ${isExcluded ? 'text-text-low line-through' : 'text-text-cream'}`}>{item.name}</span>
                        <span className="font-mono text-[10px] text-text-low ml-auto">
                          {item.crafter} · lvl {item.lvl}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          </li>
        );
      })}
    </ul>
  );
}
```

Rationale:
- `<details>` provides accessible expand/collapse without JS state.
- The "On"/"Off" badge is a `role="button"` inside `<summary>` so clicking it toggles the pack without expanding (preventDefault on the click stops the summary from also toggling). The summary itself toggles open/close.
- Item checkboxes are inverted (checked = INcluded; unchecked = excluded) so the natural read is "this is in your watchlist".

- [ ] **Step 2: Manual verify**

`npm run dev`, go to Settings → Starter packs, click a pack to expand, uncheck one item, watch the watchlist drop it.

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "feat(settings): per-item checkboxes inside expandable starter packs"
```

---

## Task 5: Reusable HomePanel wrapper

**Files:**
- Create: `src/features/home/HomePanel.tsx`

A small wrapper for the four collapsible setup panels we'll add to Home. Just a styled `<details>` with consistent typography.

- [ ] **Step 1: Implement**

```tsx
import type { ReactNode } from 'react';

interface Props {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function HomePanel({ title, hint, children, defaultOpen = false }: Props) {
  return (
    <details
      className="border border-border-base bg-bg-card group open:border-border-hi"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none px-4 py-3 flex justify-between items-baseline">
        <h3 className="font-display text-base text-gold tracking-wide">{title}</h3>
        <span className="font-mono text-[10px] text-text-low tracking-widest uppercase">
          {hint ?? 'click to expand'}
        </span>
      </summary>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}
```

- [ ] **Step 2: Commit**

```
git add -A
git commit -m "feat(home): HomePanel collapsible wrapper component"
```

---

## Task 6: Move Session defaults to Home

**Files:**
- Modify: `src/features/session/SessionPlanner.tsx`
- Delete: existing `SessionDefaults` inner component in `src/routes/Settings.tsx` (replace with import path or remove entirely)

The existing `SessionDefaults` component currently lives inside `Settings.tsx`. Move it to its own file, then render inside a `HomePanel` on Home and remove from Settings.

- [ ] **Step 1: Extract `SessionDefaults`**

Create `src/features/settings/SessionDefaults.tsx` with the existing component body (overhead/default craft/batch cap inputs). Export named.

- [ ] **Step 2: Use it in SessionPlanner**

Below the strategy chips block, before `SessionResults`, add:
```tsx
<HomePanel title="Session defaults">
  <SessionDefaults />
</HomePanel>
```

Import `HomePanel` from `'../home/HomePanel'` and `SessionDefaults` from `'../settings/SessionDefaults'`.

- [ ] **Step 3: Remove from Settings**

Delete the `SessionDefaults` inner function from `Settings.tsx` and the matching `<section>`. Imports get cleaned up too.

- [ ] **Step 4: Build clean, tests green, commit**

```
git add -A
git commit -m "refactor(home): Session defaults panel moves to Home"
```

---

## Task 7: Move Retainer levels to Home

**Files:**
- Modify: `src/features/session/SessionPlanner.tsx`
- Modify: `src/routes/Settings.tsx`

The `LevelsEditor` component already lives at `src/features/settings/LevelsEditor.tsx` — just relocate where it renders.

- [ ] **Step 1: Add panel to SessionPlanner**

```tsx
<HomePanel title="Retainer levels">
  <LevelsEditor />
</HomePanel>
```

Import `LevelsEditor` from `'../settings/LevelsEditor'`.

- [ ] **Step 2: Remove the matching `<section>` from `Settings.tsx`**

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "refactor(home): Retainer levels panel moves to Home"
```

---

## Task 8: Move World/DC to Home

**Files:**
- Modify: `src/features/session/SessionPlanner.tsx`
- Modify: `src/routes/Settings.tsx`

`WorldDcPicker` already exists at `src/features/settings/WorldDcPicker.tsx`.

- [ ] **Step 1: Panel**

```tsx
<HomePanel title="World &amp; Data Center">
  <WorldDcPicker />
</HomePanel>
```

- [ ] **Step 2: Remove the `<section>` from Settings.**

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "refactor(home): World/DC panel moves to Home"
```

---

## Task 9: Move Watchlist (packs + custom items) to Home

**Files:**
- Modify: `src/features/session/SessionPlanner.tsx`
- Modify: `src/routes/Settings.tsx`

`PackToggles` (now with drilldown from Task 4) and `AddItemSearch` already exist.

- [ ] **Step 1: Panel containing both**

```tsx
<HomePanel title="Watchlist" hint="packs + custom items">
  <div className="space-y-6">
    <div>
      <h4 className="font-mono text-[10px] tracking-widest text-text-low uppercase mb-2">Starter packs</h4>
      <PackToggles />
    </div>
    <div>
      <h4 className="font-mono text-[10px] tracking-widest text-text-low uppercase mb-2">Custom items</h4>
      <AddItemSearch />
    </div>
  </div>
</HomePanel>
```

- [ ] **Step 2: Remove BOTH sections (Starter packs + Add custom items) from Settings.**

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "refactor(home): Watchlist panel (packs + custom items) moves to Home"
```

---

## Task 10: Slim Settings page

**Files:**
- Modify: `src/routes/Settings.tsx`

After Tasks 6-9 the only sections left should be Recipe cache + Backup & restore. Confirm and clean up.

- [ ] **Step 1: Verify Settings.tsx now contains only**

```tsx
import { ExportImportPanel } from '../features/settings/ExportImportPanel';
import { clearRecipeCache } from '../lib/recipeCache';
import { useQueryClient } from '@tanstack/react-query';

export default function Settings() {
  const queryClient = useQueryClient();
  async function bustCache() {
    await clearRecipeCache();
    queryClient.invalidateQueries({ queryKey: ['recipes'] });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-10">
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Recipe cache</h2>
        <p className="text-text-low text-sm mb-3">
          Recipes are cached locally in your browser indefinitely. Bust the cache after a game patch
          or if recipe data looks wrong.
        </p>
        <button
          onClick={bustCache}
          className="font-mono text-[10px] tracking-widest uppercase border border-crimson text-crimson px-4 py-2 hover:bg-crimson hover:text-bg-deep"
        >
          Clear recipe cache
        </button>
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Backup &amp; restore</h2>
        <p className="text-text-low text-sm mb-3">
          Export saves your retainer levels, world/DC, watchlist, starter pack toggles, custom items,
          and per-item overrides as a JSON file. Import overwrites your current state.
        </p>
        <ExportImportPanel />
      </section>
    </div>
  );
}
```

Drop any leftover imports for `WorldDcPicker`, `LevelsEditor`, `PackToggles`, `AddItemSearch`, `useSettingsStore`. Build will fail loudly if any are still referenced.

- [ ] **Step 2: Commit**

```
git add -A
git commit -m "refactor(settings): page slims to recipe cache + backup only"
```

---

## Task 11: README + smoke test update

**Files:**
- Modify: `README.md`
- Modify: `src/features/session/SessionPlanner.test.tsx` (existing smoke test still passes; verify and tweak if needed)

- [ ] **Step 1: README append**

```markdown

## Home Hub update

Most setup options now live on Home as collapsible panels (closed by default):
- Session defaults (overhead, default craft, batch cap)
- Retainer levels
- World &amp; Data Center
- Watchlist (starter packs + custom items)

Click a starter pack to expand it and uncheck individual items you don't want — exclusions are remembered. Three new packs added: Materia XI, crafted minions, classic glamour. The Settings page is now just the recipe cache and backup/restore.
```

- [ ] **Step 2: Run full test suite. If `SessionPlanner.test.tsx` fails because the assertion is now nested inside a `<details>` (which doesn't render contents until opened), update the test to either expand the panel before asserting OR keep the assertion targeted at content outside the panels (e.g. SessionResults). The existing test asserts on a watchlist item name — that comes from the SessionResults table, which is OUTSIDE any HomePanel. Should still pass.**

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "docs: README home-hub section + verify session smoke test"
```

---

## Done when

- `npm test -- --run` green.
- `npm run build` clean.
- `/` shows the session form, four collapsible panels (Session defaults, Retainer levels, World & DC, Watchlist), and session results.
- `/settings` only shows recipe cache + backup.
- Clicking a starter pack on Home expands its items; per-item checkbox toggles immediately reflect on the watchlist + planner.
- 10 starter packs available (7 original + 3 new).
