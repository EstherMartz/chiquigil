# Crafting Plan / Gil Ledger — Design Spec

## Problem

The user has a battle plan for hitting a gil target (currently 10M → 100M) across four parallel income streams: high-value crafts, gathered mats, content drops, and passive earners. Today they track this with a Claude-built standalone HTML prototype (`reference/gilipichi_planner.html`) — gorgeous, functional, but disconnected from the rest of Gilipichi. Progress, ledger, and daily-rhythm checklist all live in browser localStorage outside the app.

The job is to bring it into Gilipichi proper: same behavior, our design system, our persistence pattern, our routing.

## Solution

A new `/planner` route under the **Planning** sidebar group. Single-page view with three blocks: **Treasury hero** (current/target/stats/log), **The Plan** (four lane cards with item rows), **Daily Rhythm** (six-item checklist). State lives in a zustand store with the `persist` middleware, matching Watchlist/Shopping/Settings.

The behaviour spec is the prototype. We preserve: state shape, log-with-attribution, today/7d/rate/ETA/% math, supply-badge thresholds (`<2 good`, `2–7 ok`, `>7 saturated`), daily-checklist reset on date boundary, seed defaults.

We replace: inline CSS (use Tailwind tokens + Fraunces/JetBrains Mono already in `styles/index.css`), `window.storage` (use zustand persist), `window.prompt` for editing goal and adding items (use small in-page modals matching `RecipeModal`/`OnboardingWizard`).

## Open Decision Resolution

The brief flagged one ambiguity: the prototype's item `–` button decrements `units` and `earned` but does NOT decrement `goal.current` or remove the log entry — so a misclicked `+` permanently bloats the treasury.

**Decision (confirmed with user, 2026-05-24): make `–` fully reversible.** It removes the most recent matching sale: decrements `units`, `earned`, AND `goal.current`, and removes the matching log entry. To do this cleanly, log entries carry an optional `itemId` tag so `reverseSale(itemId)` can find the right one.

## State Shape

```ts
type LaneKey = 'craft' | 'gather' | 'content' | 'passive';

interface PlanItem {
  id: string;          // 'i' + 6 chars random
  name: string;
  src: string;         // 'Weaver', 'Cosmic Auxesia', etc.
  price: number;       // gil
  perDay: number;      // velocity
  supply: number | null;  // supply-days; null = not tracked
  active: boolean;
  earned: number;      // running total of gil from sales of this item
  units: number;       // sale count
}

interface LogEntry {
  ts: number;          // Date.now()
  amount: number;      // signed gil amount
  note: string;        // item name OR 'Manual entry'
  itemId?: string;     // set when entry came from item +/– or tagged manual log
}

interface PlannerState {
  _v: 1;
  goal: { current: number; target: number; startTs: number };
  log: LogEntry[];
  lanes: Record<LaneKey, PlanItem[]>;
  daily: { date: string; done: Record<string, boolean> };

  // mutations
  logGil: (amount: number, itemId?: string) => void;
  recordSale: (lane: LaneKey, itemId: string) => void;
  reverseSale: (lane: LaneKey, itemId: string) => void;
  addItem: (lane: LaneKey, partial: Omit<PlanItem, 'id' | 'earned' | 'units' | 'active'>) => void;
  removeItem: (lane: LaneKey, itemId: string) => void;
  toggleActive: (lane: LaneKey, itemId: string) => void;
  setGoal: (patch: Partial<{ current: number; target: number }>) => void;
  toggleDaily: (taskId: string) => void;
  dailyResetIfStale: () => void;     // no-op if daily.date === todayStr()
  deleteLogEntry: (ts: number) => void;
  resetAll: () => void;              // restore seed()
}
```

Persist key: `gilipichi-planner-v1` (matches the prototype's key so any prior-prototype user picks up their state on first load, if storage is shared).

## Files & Layout

```
src/features/planner/
  plannerStore.ts       zustand + persist; mutations + dailyResetIfStale
  seedPlanner.ts        seed() returning the pre-filled battle plan, DAILY_TASKS, LANE_META
  plannerStats.ts       pure: todayStr, todaySum, weekSum, elapsedDays, rate, eta, pct, abbr, abbrParts, fmt, supClass
  PlannerView.tsx       top-level; runs dailyResetIfStale on mount; composes the three blocks
  HeroBlock.tsx         treasury + stat tiles + progress bar + log-gil bar + ledger drawer + edit-goal action
  LaneCard.tsx          one lane (color dot, name, desc, item rows, add footer)
  PlanItemRow.tsx       active checkbox, name/src, price/perDay/supply pills, +/– stepper, earned
  DailyRhythm.tsx       checklist grid + footer counter
  LedgerDrawer.tsx      collapsible log list with × per entry
  EditGoalModal.tsx     replaces window.prompt for goal editing
  AddItemModal.tsx      replaces window.prompt for add-item flow
  plannerStats.test.ts  pure-math tests
  plannerStore.test.ts  +/– round-trip, daily reset, log reverse
  PlannerView.test.tsx  smoke render + log-gil flow + daily reset across vi.setSystemTime boundary

src/routes/Planner.tsx                     thin route wrapper
src/components/layout/Sidebar.tsx          add { label: 'Plan', path: '/planner' } under PLANNING
src/App.tsx                                add <Route path="/planner" element={<Planner />} />
tailwind.config.js                         add a tiny 'sheen' keyframe for the progress bar
```

## Stats / Date Logic (`plannerStats.ts`)

Pure functions, ported from the prototype:

```ts
todayStr()                              // new Date().toISOString().slice(0,10)
todaySum(log)                           // sum of entries with iso date === today
weekSum(log, now = Date.now())          // sum of entries where now - ts < 7*864e5
elapsedDays(startTs, now = Date.now())  // max(1, ceil((now - startTs) / 864e5))
rate(weekSum, elapsedDays)              // weekSum > 0 ? weekSum / min(7, elapsedDays) : 0
eta(remaining, rate)                    // rate > 0 ? ceil(remaining / rate) : null
pct(current, target)                    // min(100, current / target * 100)
abbr(n)                                 // 10.0M / 100K / 1.25B
abbrParts(n)                            // ['10.0', 'M gil']
fmt(n)                                  // Math.round(n).toLocaleString('en-US')
supClass(supply)                        // null | 'sup-low' | 'sup-mid' | 'sup-high'
```

Daily reset: `PlannerView` runs `useEffect(() => dailyResetIfStale(), [])` on mount. The store mutation no-ops if `daily.date === todayStr()`. We also re-run it on `visibilitychange` if the tab regains focus (handles laptop-suspend across midnight).

Supply badge color mapping in Tailwind:
- `supply < 2` → `text-jade border-jade/30`
- `supply <= 7` → `text-gold border-gold/30`
- `supply > 7` → `text-crimson border-crimson/30`
- `supply == null` → not rendered

## Styling

Stay in the Gilipichi visual language (confirmed default 1). No new fonts — `Fraunces` and `JetBrains Mono` are already loaded in `src/styles/index.css`. Color tokens used: `gold`, `aether`, `jade`, `crimson`, `bg-deep`, `bg-card`, `bg-card-hi`, `border-base`, `border-hi`, `text-cream`, `text-dim`, `text-low`.

### Hero
- Wrapper: `border border-border-base bg-bg-card p-6 relative overflow-hidden`
- Gold-glow accent: inline `style={{ background: 'radial-gradient(circle at 100% 0%, rgba(212,169,88,0.12), transparent 60%)' }}` overlay div
- Treasury number: `font-display text-5xl text-gold` (Fraunces 600); unit suffix in `font-mono text-lg text-text-low`
- Stat tiles: 4-col flex, each `border border-border-base bg-bg-card-hi/40 px-3 py-2 min-w-[104px]`, label `font-mono text-[10px] tracking-widest uppercase text-text-low`, value `font-mono text-lg`
- Progress bar: outer `h-3 rounded-full bg-bg-card-hi border border-border-base`, inner `bg-gradient-to-r from-[#a07b27] via-gold to-[#f6d27e] rounded-full transition-[width] duration-700 ease-out` with a `::after` sheen via a tiny added keyframe in tailwind.config.js
- Log-gil bar: horizontal flex, amount input `w-36 bg-bg-card border border-border-base px-3 py-2 font-mono`, item select, primary button `bg-gold text-bg-deep px-4 py-2 hover:opacity-90` ("+ Add to treasury"), ghost "Ledger" toggle, right-aligned "edit goal" text link

### Lanes
- Grid: `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3`
- Lane card: `border border-border-base bg-bg-card p-4`; header has a 9px colored dot — `gold` (craft), `jade` (gather), `crimson` (content), `aether` (passive) — plus name in `font-display text-base` and desc in `font-mono text-[10px] uppercase tracking-widest text-text-low`
- Item row: `border border-border-base bg-bg-card-hi/30 p-3 mb-2`; parked rows get `opacity-50`. Top row = checkbox + name/src + delete (`×`) button (ghost, `text-text-low hover:text-crimson`). Pills row = price/perDay/supply (`font-mono text-[10px] px-2 py-0.5 border border-border-base rounded`). Track row = `–` button, units count, `+` button, `+{earned}` aligned right in `text-jade font-mono`. Border-top dashed via `border-t border-dashed border-border-base/50 pt-2`
- "Add item to <lane>" footer: full-width dashed-border ghost button → opens `AddItemModal`

### Daily Rhythm
- Card: `border border-border-base bg-bg-card p-5`
- Grid: `grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2`
- Task: checkbox + label; done items get `text-text-low line-through`
- Footer: counter "X / 6 done today" left, date right, both `font-mono text-[10px] uppercase tracking-widest text-text-low`

### Save flash toast
Tiny bottom-right toast triggered by a store subscription. ~250ms after a mutation, fade in "saved ✓" for 700ms then fade out. `fixed bottom-4 right-4 bg-gold text-bg-deep px-3 py-1.5 font-mono text-[11px] rounded shadow`.

### Modals
Match `RecipeModal` pattern (existing). Backdrop `fixed inset-0 bg-black/60`, panel `border border-border-base bg-bg-card p-5 max-w-md`. `EditGoalModal` has two labeled numeric inputs (target, current). `AddItemModal` has name (required), source (optional), price (numeric), perDay (numeric), supply (numeric, blank = null), and a primary "Add" button.

## Persistence

```ts
export const usePlannerStore = create<PlannerState>()(
  persist(
    (set, get) => ({ ...defaultPlanner(), ...mutations }),
    {
      name: 'gilipichi-planner-v1',
      version: 1,
      // migrate not needed at v1
    },
  ),
);
```

zustand's `persist` middleware batches synchronously, so we don't need the prototype's 300ms debounce. The save-flash toast just listens for the rehydrate/state-change signal.

## Tests

`plannerStats.test.ts` — pure math:
- `todaySum` ignores entries from yesterday/tomorrow (use `vi.setSystemTime`)
- `weekSum` excludes entries 7d+1ms old
- `elapsedDays` returns 1 for `startTs === now` (not 0)
- `rate` returns 0 for `weekSum === 0` (not NaN)
- `eta` returns null for `rate === 0`
- `pct` caps at 100 when current > target
- `abbr` returns `'1.25B'`, `'10.0M'` → `'10M'`, `'100K'`, `'42'`
- `supClass` boundaries (1.99 → low, 2 → mid, 7 → mid, 7.01 → high, null → '')

`plannerStore.test.ts`:
- `recordSale(lane, id)` then `reverseSale(lane, id)` leaves goal/units/earned/log identical to before
- `dailyResetIfStale()` no-ops if same day; resets `done` if `daily.date < today`
- `deleteLogEntry(ts)` decrements `goal.current` by that entry's amount
- `addItem` / `removeItem` / `toggleActive` round-trips

`PlannerView.test.tsx`:
- Smoke render shows the four lane names + DAILY_TASKS count
- Typing `4025000` + clicking "Add to treasury" increments treasury and appends a ledger row
- `vi.setSystemTime` from day A with one checked daily task → re-render on day B clears done; previous day's log entry stays

## Acceptance Criteria

- [ ] Renders the four lanes from state; all CRUD + toggles work and re-render
- [ ] Gil logging updates treasury, ledger, and per-item attribution
- [ ] Stats (today / 7d / rate / ETA / %) compute correctly; progress bar reflects pct
- [ ] Daily checklist resets across a date boundary
- [ ] State persists across reloads via zustand+persist (not raw `window.storage`)
- [ ] Styling matches Gilipichi (gold/aether/jade/crimson; Fraunces titles; mono labels) — NOT the prototype's amber Gil Ledger palette
- [ ] No `localStorage`/`sessionStorage` raw access from feature code (zustand `persist` handles it)
- [ ] Item `–` button fully reverses the matching sale (units, earned, treasury, log entry)
- [ ] Vitest + tsc clean
- [ ] Browser smoke check: navigate to /planner, log gil, click an item +, click –, toggle a daily task, reload, state persists

## Out of Scope (deferred to follow-up)

- Live Universalis binding for `price`/`perDay`/`supply` (brief lists as nice-to-have)
- Auto re-sort lanes by current opportunity
- Lane re-ordering, drag-to-move-between-lanes
- Editing existing items (the prototype only supports add/delete; we match that)
- Goal history / multi-goal support

## Housekeeping

- `reference/gilipichi_planner.html` — the prototype, committed for reference
- `docs/PLANNER_INTEGRATION.md` — the original brief, committed
- `docs/superpowers/specs/2026-05-24-planner-design.md` — this spec
