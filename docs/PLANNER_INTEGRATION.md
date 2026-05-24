# Planner Integration Brief — for Claude Code

**Task:** Adapt the standalone prototype `gilipichi_planner.html` into a production component inside this codebase (Gilipichi).
**Reference file:** `gilipichi_planner.html` (vanilla HTML/CSS/JS prototype — the source of truth for behaviour and layout).
**Goal:** A "Crafting Plan" / progress tracker feature: track gil toward a target, manage plan items across four lanes, log sales, and run a daily checklist — all persisted.

---

## Before writing code
1. Inspect the existing codebase first. Match **our** conventions, don't impose the prototype's:
   - Framework & router (Next.js app/pages? Vite?), component file structure, naming.
   - Styling approach (Tailwind? CSS modules? styled-components?) and existing design tokens — **reuse our palette/typography** rather than the prototype's inline CSS unless we decide to adopt the "gil ledger" theme.
   - State management (local `useState`/`useReducer`, Zustand, Redux, React Query?).
   - Persistence layer (localStorage? Supabase/Postgres? an existing API route?). **Wire persistence to whatever we already use.**
2. Propose a short plan before implementing. Keep the change PR-sized.

---

## What to port (behaviour spec)

### State shape
```ts
type Item = {
  id: string;
  name: string;
  src: string;        // source/class label, e.g. "Weaver", "Cosmic Auxesia"
  price: number;      // market price in gil
  perDay: number;     // units sold per day (velocity)
  supply: number|null;// supply-days; null = not tracked
  active: boolean;
  earned: number;     // running gil attributed to this item
  units: number;      // units logged sold
};

type PlannerState = {
  goal:  { current: number; target: number; startTs: number };
  log:   { ts: number; amount: number; note: string }[];
  lanes: { craft: Item[]; gather: Item[]; content: Item[]; passive: Item[] };
  daily: { date: string /*YYYY-MM-DD*/; done: Record<string, boolean> };
};
```
- `DAILY_TASKS` is a fixed list of `{id,label}` (see prototype). `LANE_META` holds lane display names/descriptions.
- Seed defaults from the `seed()` function in the prototype (the pre-loaded battle-plan items).

### Core behaviours
- **Log gil:** adds `amount` to `goal.current`, pushes a `log` entry; if tagged to an item, also `item.earned += amount` and `item.units += 1`.
- **Item +/–:** `+` logs a sale at `item.price` (`units++`, `earned += price`, `goal.current += price`, append log entry). `–` reverses `units`/`earned`. NOTE: in the prototype `–` does **not** decrement `goal.current` — decide whether to make this symmetric (recommended: make `–` fully reversible incl. goal + remove the matching log entry).
- **Active toggle / add / remove item:** standard CRUD on the lane arrays.
- **Daily reset:** on render, if `daily.date !== today` → reset `daily` to today with empty `done`.
- **Derived stats:** `today` and `last-7d` sums from `log`; `rate = week / min(7, elapsedDays)`; `eta = ceil(remaining / rate)`; `pct = current / target`.
- **Supply badge thresholds:** `<2` = good (green), `2–7` = ok (amber), `>7` = saturated (red).
- **Formatting:** `abbr()` → 10.0M / 100K / 1.25B style; full numbers use `toLocaleString('en-US')`.

### Persistence
- Prototype uses a `store` wrapper (Claude artifact `window.storage`, single key `gilipichi-planner-v1`, debounced save). **Replace with our persistence layer.** One serialized blob is fine, or normalise into tables if that fits our schema better. Save on every mutation (debounced ~300ms).

---

## Acceptance criteria
- [ ] Renders the four lanes from state; all CRUD + toggles work and re-render.
- [ ] Gil logging updates treasury, ledger, and per-item attribution.
- [ ] Stats (today / 7d / rate / ETA / %) compute correctly; progress bar reflects `pct`.
- [ ] Daily checklist resets across a date boundary.
- [ ] State persists across reloads via our data layer (not `window.storage`).
- [ ] Styling matches our design system (or intentionally adopts the gil-ledger theme — confirm with me).
- [ ] No `localStorage`/`sessionStorage` if we have a backend; use the real layer.

## Nice-to-haves (only if quick)
- Bind item `price`/`supply`/`perDay` to our live Universalis pull so the board self-refreshes instead of using the seeded snapshot.
- Re-sort lanes by current opportunity (price × perDay, or net margin if mat cost is available).

---

## Suggested prompt to start the agent
> Read `gilipichi_planner.html` and `docs/PLANNER_INTEGRATION.md`. Then explore the repo to learn our framework, styling, state, and persistence conventions. Propose a short integration plan for the Crafting Plan feature before writing code. Implement it as a component that matches our existing patterns, wiring persistence to our data layer (not window.storage). Keep it to a focused, reviewable change.
