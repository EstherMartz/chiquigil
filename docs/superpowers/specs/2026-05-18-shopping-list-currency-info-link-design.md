# Shopping-List Currency Info-Line: Clickable Currency Name — Design Spec

**Status:** Approved 2026-05-18
**Scope:** Tiny UX polish — make the shopping-list currency info-line's `shortLabel` clickable.
**Depends on:** Shopping List Source column (shipped 2026-05-18), CurrencySourceCard (shipped 2026-05-18).

---

## Goal

The shopping-list detail table's Source cell has a non-interactive currency info-line:

```
└─ 10 Poetics avail.
```

Make the `shortLabel` ("Poetics") a clickable link to `/currency-flip?currency=poetics` so the player can pivot from "this ingredient is available with Poetics" to "what else can I buy with Poetics?". Mirrors the exact pattern already established by `CurrencySourceCard.tsx` on `/item/:id`.

## Non-goals

- No new info on the line (no NPC name, no zone, no ratio).
- No change when no currency is available (line still hidden).
- No change to the rest of the SourceCell layout, toggle, or behavior.

## Architecture

Single JSX edit in `src/features/shoppingList/ShoppingListPlan.tsx`, function `SourceCell`, lines 211-215 (the `{survey.currency && (...)}` block).

Wrap just `survey.currency.shortLabel` in:

```tsx
<Link
  to={`/currency-flip?currency=${survey.currency.id}`}
  className="text-aether hover:underline decoration-1 underline-offset-4"
>
  {survey.currency.shortLabel}
</Link>
```

Keep the cost number and `avail.` text in their existing `text-text-low` color.

`Link` from `react-router-dom` is already imported by this file (line 2). No new imports needed.

## Testing

Add one new test to `src/features/shoppingList/ShoppingListPlan.test.tsx`:

```tsx
it('renders the currency name as a link to /currency-flip?currency=<id>', () => {
  const survey: IngredientSurvey[] = [
    { id: 5, qty: 1,
      mb: { world: 'Phantom', price: 100, count: 1, isLightDc: false },
      npc: null,
      currency: { id: 'poetics', label: 'Allagan Tomestone of Poetics', shortLabel: 'Poetics', costPerUnit: 10 },
      autoSource: 'mb' },
  ];
  renderWithRouter(survey, [], [], {});
  const link = screen.getByRole('link', { name: /^Poetics$/ });
  expect(link.getAttribute('href')).toBe('/currency-flip?currency=poetics');
});
```

The existing "renders currency info-line when survey row has currency" test continues to pass (asserts the text content of `10 Poetics avail.`); the new test asserts the link attribute.

## File list

**Modify:**
- `src/features/shoppingList/ShoppingListPlan.tsx` (one JSX block)
- `src/features/shoppingList/ShoppingListPlan.test.tsx` (add 1 test)

**Total new tests:** 1. Suite: 625 → 626. Single commit.
