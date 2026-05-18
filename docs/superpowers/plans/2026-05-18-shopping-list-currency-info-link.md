# Shopping-List Currency Info-Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the currency `shortLabel` in the shopping-list Source cell info-line a `<Link>` to `/currency-flip?currency=<id>`.

**Architecture:** Single JSX edit in `ShoppingListPlan.tsx`'s `SourceCell` function (lines 211-215) plus one new test in `ShoppingListPlan.test.tsx`.

**Tech Stack:** React, react-router-dom (already imported), Vitest + RTL.

**IMPORTANT GIT SAFETY RULE for implementers:** Do NOT run `git checkout`, `git reset`, `git stash`, `git clean`, `git rebase`, `git restore`, `git switch`. Only `git add`, `git commit`, `git log`, `git diff`, `git show`, `git status`, `git cat-file`, `git fsck` are allowed.

**Commit trailer:**
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 1: Make currency shortLabel clickable + add test

**Files:**
- Modify: `src/features/shoppingList/ShoppingListPlan.tsx`
- Modify: `src/features/shoppingList/ShoppingListPlan.test.tsx`

- [ ] **Step 1: Add the failing test** at the end of the `describe('ShoppingListPlan', ...)` block in `src/features/shoppingList/ShoppingListPlan.test.tsx` (after the existing "renders currency info-line" test):

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/ShoppingListPlan.test.tsx`
Expected: this new test FAILS — `getByRole('link', { name: /^Poetics$/ })` finds no link because `Poetics` is currently plain text inside a `<div>`.

- [ ] **Step 3: Wrap the shortLabel in a Link** in `src/features/shoppingList/ShoppingListPlan.tsx`.

Find this block (currently lines 211-215, inside `SourceCell`):

```tsx
{survey.currency && (
  <div className="font-mono text-[10px] text-text-low">
    └─ {survey.currency.costPerUnit < 10 ? survey.currency.costPerUnit.toFixed(2) : Math.round(survey.currency.costPerUnit)} {survey.currency.shortLabel} avail.
  </div>
)}
```

Replace with:

```tsx
{survey.currency && (
  <div className="font-mono text-[10px] text-text-low">
    └─ {survey.currency.costPerUnit < 10 ? survey.currency.costPerUnit.toFixed(2) : Math.round(survey.currency.costPerUnit)}{' '}
    <Link
      to={`/currency-flip?currency=${survey.currency.id}`}
      className="text-aether hover:underline decoration-1 underline-offset-4"
    >
      {survey.currency.shortLabel}
    </Link>
    {' '}avail.
  </div>
)}
```

`Link` from `react-router-dom` is already imported by this file (line 2 — `import { Link } from 'react-router-dom';`). No new imports needed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/shoppingList/ShoppingListPlan.test.tsx`
Expected: ALL tests pass (the existing "renders currency info-line" test still passes — its assertion uses `toBeInTheDocument()` on the full text and will match the Link's text content; the new link test passes).

- [ ] **Step 5: Full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 626 tests pass (was 625); tsc clean.

- [ ] **Step 6: Commit ONLY the 2 files this task touched:**

```bash
git add src/features/shoppingList/ShoppingListPlan.tsx src/features/shoppingList/ShoppingListPlan.test.tsx
git commit -m "feat(shopping-list): currency info-line shortLabel is a link to /currency-flip

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Notes for the implementer

- The existing "renders currency info-line when survey row has currency" test asserts `screen.getByText(/10\s*Poetics\s*avail\./i)` against the full info-line. After this change, "Poetics" is wrapped in a `<Link>` element. RTL's `getByText` with a regex should still find the text across element boundaries — confirm via test run. If it fails, the existing test may need a small tweak (use `getByText(/10/)` plus separate `getByRole('link', { name: 'Poetics' })`). But: the regex `/10\s*Poetics\s*avail\./i` may NOT match across element boundaries due to whitespace handling. Prefer to verify first; if the existing test breaks, update its assertion to:

```ts
expect(screen.getByText(/^└─\s*10/)).toBeInTheDocument();
expect(screen.getByRole('link', { name: /^Poetics$/ })).toBeInTheDocument();
expect(screen.getByText(/^avail\.$/)).toBeInTheDocument();
```

Only adjust the existing test if it actually fails. Don't proactively change it.

- The JSX braces `{' '}` between the cost and the Link, and between the Link and `avail.`, are JSX whitespace escapes — they preserve a literal space so the rendered output reads `10 Poetics avail.` rather than `10Poeticsavail.`.

- No other call sites need updating. No new components. No new test file.
