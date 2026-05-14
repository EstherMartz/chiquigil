# Planner item-info hover + click — design

Date: 2026-05-14

## Problem

The gathering session planner at `/gathering/plan` renders each row's item name as plain text. You can't hover for info, can't click through to verify the item, and have no quick path to Universalis or Garland Tools from the planner table. The same data on `/gathering`'s browse table already does all of this via `<ItemNameLinks>`.

## Goal

Wire the planner's item-name cells to use `<ItemNameLinks>` so every name becomes interactive — hover for the recipe popover, click for the Universalis market page, plus a copy-name button and a Garland Tools link in the sub-line.

## Non-goals

- Building a gatherable-specific popover. The existing `<RecipePopover>` shows "Not craftable" for raw gatherables; that's accepted per the brainstorming decision.
- Adding gathering-level / timed badges next to the name. (Could be added later via the `suffix` prop, but YAGNI for this change.)
- Customizing the sub-line. The planner doesn't currently render `categoryLabel(r.sc)` and we won't start.
- Changing any planner math, store fields, or query plumbing.

## What changes

Single file: `src/features/gathering/GatheringPlanner.tsx`.

Two cells replaced (both in the `<tbody>`):

**In the `result.rows.map((r, i) => ...)` loop:**

```tsx
<td className="px-2 py-1.5">{r.name}</td>
```

becomes

```tsx
<td className="px-2 py-1.5">
  <ItemNameLinks id={r.id} name={r.name} />
</td>
```

**In the `result.skippedZeroPriceRows.map((r) => ...)` loop:**

```tsx
<td className="px-2 py-1.5 italic">{r.name}</td>
```

becomes

```tsx
<td className="px-2 py-1.5 italic">
  <ItemNameLinks id={r.id} name={r.name} />
</td>
```

The `italic` class survives on the `<td>`. `<ItemNameLinks>` doesn't override it for the link element, so the skipped row's name still reads as italic and the user can still identify it as a "no-price" entry. The other `—` cells in that row stay unchanged.

Add the import at the top of the file:

```tsx
import { ItemNameLinks } from '../../components/ItemNameLinks';
```

That's the entire production change.

## What you get for free

From the existing `<ItemNameLinks>` + `<RecipeHover>` + `<RecipePopover>`:

- **Hover** on the item name → popover floats below with the recipe's ilvl, status (`Not craftable` for gatherables), and a Garland Tools link.
- **Click** the name → opens the Universalis market page for the user's home world in a new tab.
- **Copy** button next to the name.
- **`i<ilvl>`** prefix when the item snapshot has an ilvl > 1.
- **`↗`** Garland Tools link in the sub-line (only renders when `sub` or `crafter` prop is set — neither is, so the sub-line is omitted entirely for the planner. That's fine.).

Note: because we don't pass `sub` or `crafter`, the second-line block of `<ItemNameLinks>` doesn't render. The Garland link is reachable through the hover popover instead.

## Testing

`src/features/gathering/GatheringPlanner.test.tsx` needs two adjustments and one new test:

**0. Add a `QueryClientProvider` wrapper.** `<ItemNameLinks>` calls `useSnapshotById`, which is backed by `useQuery`. Without a `QueryClientProvider`, react-query throws on render. The existing planner test file has no providers — it renders `<GatheringPlanner>` directly. Wrap each `render()` in a fresh `QueryClient` + provider, matching the pattern used by `src/routes/GatheringPlan.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

// then everywhere we render:
render(withProviders(<GatheringPlanner rows={rows} catalog={catalog} />));
```

No `MemoryRouter` needed — `<ItemNameLinks>` uses raw `<a href>` to Universalis (external link), not react-router.

**1. Most existing assertions still work.** `getByText('Cobalt Ore')`, `getByText('Rosewood Log')`, etc. match the rendered text content regardless of which element wraps it. No change needed beyond the provider wrap.

**2. One existing test asserts the wrong element type and must be relaxed.** The "renders zero-price rows as a — row" test currently has:

```tsx
const skippedName = screen.getByText('Free Sample');
expect(skippedName.tagName.toLowerCase()).toBe('td');
```

After the swap the name lives inside an `<a>`, not directly in the `<td>`, so the second assertion will break. Replace those two lines with:

```tsx
const skippedName = screen.getByText('Free Sample');
// (no tagName assertion — name is now wrapped by <ItemNameLinks>)
```

The remaining assertion (`row.textContent.toContain('—')`) preserves the test's real intent: confirming the skipped row renders with `—` cells beside the name.

**3. Add ONE focused test** to lock in the new interactive behavior:

```tsx
it('wraps item names in interactive links', async () => {
  // ...existing render with fixture rows...
  const link = await screen.findByRole('link', { name: /cobalt ore/i });
  expect(link).toHaveAttribute('href');
  expect(link.getAttribute('href')).toContain('universalis.app');
});
```

That asserts the name is now a link (regression-proof against a future revert to plain text). We don't test the popover open/close behavior — it's timer-driven inside `<RecipeHover>` and visible across every result table in the app; if it breaks here it breaks everywhere, and manual smoke testing catches it.

The test runs in `jsdom`. `<ItemNameLinks>` reads from `useSettingsStore` (already seeded by the existing `beforeEach`) and `useSnapshotById` (returns an empty map if the snapshot cache is empty — no crash, ilvl prefix simply omitted).

## Risks

- **`useSnapshotById` not initialized in the planner's test environment.** If the snapshot store is empty, the ilvl prefix simply doesn't render — no crash, no failed test.
- **Universalis URL world scoping.** `<ItemNameLinks>` reads `world` from `useSettingsStore`. In tests, `useSettingsStore.setState(defaultSettings())` runs in `beforeEach`, so `world` defaults to `'Phantom'` and the link URL contains `/Phantom/`. The new test's `toContain('universalis.app')` assertion stays env-agnostic.
- **No popover assertion.** Hover behavior is hard to test reliably in jsdom (timer-driven open/close). We rely on the existing `<RecipeHover>` shipping, which it does via the browse view (`<QueryResults>`) on every page that uses `<ItemNameLinks>`. If `<RecipeHover>` is broken, every result table in the app breaks at the same time — manual smoke test catches it.

## Out of scope (future, if useful)

- Custom gatherable popover with level + timed badge + current-price summary.
- Sub-line on planner rows (`categoryLabel(r.sc)` like the browse table shows).
- Touch / keyboard-only popover behavior tweaks (already handled by `<RecipeHover>`).
