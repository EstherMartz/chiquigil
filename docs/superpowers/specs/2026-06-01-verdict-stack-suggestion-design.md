# Verdict Stack + Price Suggestion — Design

**Date:** 2026-06-01
**Status:** Approved (brainstorm)
**Route touched:** `/item/:id` (the Verdict card)

## Goal

The top Verdict summary tells you the play (e.g. "List on MB · ~774/unit") but not **how to package it**. Add a stack-size selling suggestion derived from the stack analyzer's 90-day history, shown two ways that always agree:

1. **Text insight** — a one-line sentence in the verdict's main block explaining the suggestion.
2. **Column** — a scannable "SELL AS" column beside Margin / Risk.

Both follow the verdict's own chosen quality (`best.quality`) and hide for non-stackable items.

## Selection logic — `suggestStack` (pure, in `stackAnalysis.ts`)

```
suggestStack(sold: SoldStackRow[], listed: ListedStackRow[]): StackSuggestion | null
```

`StackSuggestion = { stack: number; unitPrice: number; kind: 'gap' | 'liquid' }`

Algorithm:
1. **Not stackable** → if no sold/listed size exceeds 1 (i.e. `isStackable(sold, listed)` is false), return `null`.
2. **Gap first** — among `sold` rows, consider those that are a supply gap: `sales >= max(2, 0.15 * totalSales)` **and** the matching `listed` count is absent or `<= 1` (the same rule the analyzer uses for its "↙ gap" marker). If any qualify, pick the one with the most `sales` (tie-break: most recent `lastSoldMs`, then larger `stack`). Return `{ stack, unitPrice: medianUnitPrice, kind: 'gap' }`.
3. **Liquid fallback** — otherwise pick the `sold` row with the most `sales` (tie-break: most recent `lastSoldMs`, then larger `stack`). Return `{ stack, unitPrice: medianUnitPrice, kind: 'liquid' }`.
4. Empty `sold` → `null`.

This reproduces the read we validated by hand: the gap rule surfaces "list 2-stacks (under-supplied)" on the NQ item, and the recency tie-break surfaces "99-stack, sold recently" on the bulk HQ item.

## Rendering — `VerdictCard.tsx`

`VerdictCard` gains an optional prop `history?: HistoryEntry[]` (the 90-day home-world sale history). Internally:

```
const hq = best.quality === 'HQ';
const sold = soldByStack(history ?? [], hq);
const listed = listedByStack(props.phantom?.worldListings ?? [], hq);
const suggestion = suggestStack(sold, listed);
```

- **Text insight** (in the first column, a mono line after the rationale, styled like the existing `runnerUp` line, jade-accented):
  - `kind: 'gap'` → `▸ Best as {stack}-stacks · ~{fmtGil(unitPrice)}/unit · under-supplied`
  - `kind: 'liquid'` → `▸ Most sales are {stack}-stacks · ~{fmtGil(unitPrice)}/unit`
  - `suggestion == null` → render nothing (no line).
- **Column** (a 5th cell appended to the grid, mirroring the Risk cell):
  - Header `SELL AS`.
  - Value `{stack}-stack` (display) + sub-line `~ {fmtGil(unitPrice)}/unit`, plus a muted `under-supplied` tag when `kind === 'gap'`.
  - `suggestion == null` → render nothing (the grid simply has 4 cells, as today).
- The verdict card grid changes from `lg:grid-cols-[1.5fr_1fr_1fr_1fr]` to `lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]` when a suggestion exists; with no suggestion it stays 4-wide. (Use a computed class so the non-stackable case is visually unchanged.)

## Data flow — `Item.tsx`

The Verdict card currently has no sale history. Add a single 90-day home-world history query in `Item.tsx` and pass its entries to the Verdict card:

```tsx
const history = useQuery({
  queryKey: ['item-history', world, itemId, 90],
  enabled: valid,
  staleTime: 30 * 60 * 1000,
  queryFn: async () => (await fetchHistoryWithin(world, [itemId], NINETY_DAYS_SEC)).get(itemId) ?? [],
});
// …
<VerdictCard … history={history.data ?? []} />
```

This shares the React Query **key** `['item-history', world, itemId, 90]` with `StackAnalyzerBlock`, so React Query dedupes to a **single network fetch** — no duplicate request, and `StackAnalyzerBlock` is left untouched (additive change only). While history is still loading, `history.data` is `undefined` → `suggestStack` gets `[]` → returns `null` → the verdict renders exactly as today, then the suggestion appears when history resolves.

## Edge cases

- Non-stackable item (gear): `suggestStack` → `null` → no insight line, no column, grid stays 4-wide.
- Untraded item: `best.quality` is `'NQ'` and history is empty → `null` → nothing added.
- HQ-only seller: follows `best.quality`, so the suggestion reads the HQ history (the tab that matters).

## Testing

- `suggestStack` unit tests: gap wins over a higher-sales non-gap size; liquid fallback picks most-sales; recency tie-break; larger-stack final tie-break; `null` when not stackable; `null` on empty `sold`.
- `VerdictCard` render tests: with a stackable `history` + a `phantom` whose `worldListings` create a gap, the "SELL AS" column and the "under-supplied" insight render; with non-stackable history, neither renders and the card shows its original 4 cells. (Existing `VerdictCard.test.tsx` patterns; `history` defaults to `[]` so current tests pass unchanged.)

## Non-goals

- No change to which play/quality the verdict chooses (`computeVerdict` untouched).
- No "bulk vs specific size" prose nuance beyond the gap/liquid distinction (YAGNI).
- No DC/region history (home-world only, consistent with the analyzer).

## Files

**Modify:**
- `src/features/items/stackAnalysis.ts` (+ `stackAnalysis.test.ts`) — add `suggestStack` + `StackSuggestion`.
- `src/features/items/VerdictCard.tsx` (+ `VerdictCard.test.tsx`) — new `history` prop, insight line, SELL AS column.
- `src/routes/Item.tsx` — add the 90-day history query, pass `history` to `VerdictCard`.
