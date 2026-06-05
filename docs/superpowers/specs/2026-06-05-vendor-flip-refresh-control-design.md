# Vendor Flip — Refresh Control (feedback + cooldown lock)

**Date:** 2026-06-05
**Status:** Approved, ready for plan

## Goal

Clicking "Refresh prices" currently gives weak feedback: the code calls
`run.reset()` (blanking the table) and, if prices are similar, nothing visibly
changes. Bring the item page's proven `LiveRefreshBar` idiom to the Vendor Flip
bulk refresh: clear busy/freshness feedback, a 60-second cooldown lock with a
countdown, and an opt-in auto-refresh.

## Background

- `VendorFlipView` ([src/features/insights/VendorFlipView.tsx](../../../src/features/insights/VendorFlipView.tsx))
  owns the `run` mutation that fetches live Universalis prices for `scanIds` and a
  filter that now recomputes `rows` live.
- The reference idiom is `LiveRefreshBar`
  ([src/features/items/LiveRefreshBar.tsx](../../../src/features/items/LiveRefreshBar.tsx)):
  `COOLDOWN_MS = 60_000`, `AUTO_INTERVAL_MS = 5 * 60_000`, a `now` ticker that runs
  every 500ms only while busy or on cooldown, an `agoLabel`, and button states
  `Refreshing… / Wait Ns / ↻ …`.
- `FreshnessChip` ([src/components/FreshnessChip.tsx](../../../src/components/FreshnessChip.tsx))
  renders a colored dot + relative age (`Fresh · just now`, `OK · 12m ago`,
  `Stale · 1h ago`) from `{ ts, now }`.

## New component: `VendorRefreshControl`

`src/features/insights/VendorRefreshControl.tsx`

```ts
interface Props {
  onRefresh: () => void;        // triggers the bulk price re-fetch (run.mutate)
  busy: boolean;                // a refresh is in flight (run.isPending)
  notReady: boolean;            // catalog not loaded yet
  lastRefreshTs: number | null; // when the last successful refresh completed
}
```

Constants (module-local): `COOLDOWN_MS = 60_000`, `AUTO_INTERVAL_MS = 5 * 60_000`.

Internal state: `auto` (boolean), `now` (number).

Behavior:
- **Cooldown** — `cooldownLeft = lastRefreshTs ? max(0, COOLDOWN_MS - (now - lastRefreshTs)) : 0`;
  `onCooldown = cooldownLeft > 0`. Because `lastRefreshTs` is set on every successful
  fetch including the initial auto-load, the control opens on cooldown right after the
  page's first scan.
- **`now` ticker** — a `setInterval(… , 500)` that runs only while `busy || onCooldown`
  (cleared otherwise), exactly as `LiveRefreshBar` does.
- **Button** — disabled when `busy || onCooldown || notReady`. Label:
  `busy` → `Refreshing…`; else `onCooldown` → `Wait ${ceil(cooldownLeft/1000)}s`; else
  `↻ Refresh prices`. `onClick` calls `onRefresh`.
- **Freshness stamp** — when `lastRefreshTs != null`, render
  `<FreshnessChip ts={lastRefreshTs} now={now} />`.
- **Auto toggle** — a checkbox bound to `auto`. While `auto` is on, a
  `setInterval(onRefresh, AUTO_INTERVAL_MS)` re-pulls; enabling it triggers one
  immediate `onRefresh` **only if not on cooldown** (avoids firing while a countdown
  is visibly running). Keep the latest `onRefresh` in a ref so the interval identity
  is stable (mirrors `LiveRefreshBar`'s `onRefreshedRef`).

Layout mirrors `LiveRefreshBar`: a right-aligned `flex` row of
`FreshnessChip · Auto checkbox · button`, using the same font-mono/uppercase styling.

## Changes in `VendorFlipView`

1. **Track `lastRefreshTs`** — add `const [lastRefreshTs, setLastRefreshTs] = useState<number | null>(null);`
   and set it from the `run` mutation's `onSuccess` (`setLastRefreshTs(Date.now())`).
   This covers both the initial auto-run and manual refreshes.
2. **Stop blanking the table** — the manual refresh path calls `run.mutate()` **without**
   `run.reset()`, so `run.data` (hence `rows`) stays visible while the next fetch is in
   flight. (The initial auto-run via `useInitialScan` may keep its existing call; there is
   no prior data to preserve on first load.)
3. **Full Spinner only on first load** — gate the big `<Spinner>` on "no data yet":
   render it when `run.isPending && !run.data`; on later refreshes the in-place table plus
   the control's `Refreshing…` state convey progress.
4. **Relocate the action** — remove the primary button (and `onRun`/`busy`/`notReady`)
   from `FilterBar`; `FilterBar` becomes purely filter inputs (`{ value, onChange }`).
   Render `<VendorRefreshControl onRefresh={() => run.mutate()} busy={run.isPending}
   notReady={!snapshot.data || !vendors.data} lastRefreshTs={lastRefreshTs} />` on the
   results/status row (right-aligned).
5. **Errors** — keep the existing `run.isError` StatusBanner. The control's button
   re-enables after a failed refresh (it gates only on `busy`/`onCooldown`/`notReady`,
   and a failed mutation clears `busy`).

## Testing

### `VendorRefreshControl.test.tsx` (new) — `vi.useFakeTimers()`
- Clicking the button calls `onRefresh`.
- `busy` renders the `Refreshing…` label and a disabled button.
- With a recent `lastRefreshTs`, the button is disabled and shows `Wait Ns`; after
  advancing timers past `COOLDOWN_MS`, it re-enables and reads `↻ Refresh prices`.
- The `FreshnessChip` renders when `lastRefreshTs` is set.
- `notReady` disables the button.

### `VendorFlipView.test.tsx` (update)
- The refresh button now lives in the control; keep asserting that clicking it triggers a
  price fetch (`fetchMarketDataMock` called). Adjust the button matcher to the control's
  label (`/refresh prices/i`). Account for the post-load cooldown — if a test needs to
  click refresh, it must use fake timers to clear the cooldown first, or assert the
  initial auto-load fetch instead of a manual click.
- Add/keep a check that the table is **not** blanked during a refresh (rows remain in the
  document while a new fetch is pending).

## Out of scope (YAGNI)

- Extracting a shared hook/component unifying this with `LiveRefreshBar`.
- Persisting the auto-toggle preference across sessions.
