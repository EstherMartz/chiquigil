# Planner item-info hover — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `<ItemNameLinks>` into the planner table so item names get hover-popover + click-to-Universalis + copy-name behavior, matching the rest of the app.

**Architecture:** Single-file production change: wrap the item-name cells (both the planned rows and the skipped zero-price rows) in `<ItemNameLinks>`. The component pulls in `useSnapshotById` (react-query-backed), so the existing planner tests need a `QueryClientProvider` wrapper. One new test locks in the link behavior; one existing assertion drops the now-wrong `tagName === 'td'` check.

**Tech Stack:** React 18, TypeScript, vitest 4 (jsdom), Testing Library, React Query 5.

Spec: [2026-05-14-planner-item-info-hover-design.md](../specs/2026-05-14-planner-item-info-hover-design.md)

---

### Task 1: Wire `<ItemNameLinks>` into the planner table

**Files:**
- Modify: `src/features/gathering/GatheringPlanner.tsx`
- Modify: `src/features/gathering/GatheringPlanner.test.tsx`

- [ ] **Step 1: Wrap existing tests in a `QueryClientProvider` and add the failing new test**

Open `src/features/gathering/GatheringPlanner.test.tsx`. Replace its full contents with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { GatheringPlanner } from './GatheringPlanner';
import { useGatheringPlanStore, defaultGatheringPlan } from './gatheringPlanStore';
import type { QueryResultRow } from '../queries/types';
import type { GatheringCatalog } from '../../lib/gatheringCatalog';

const rows: QueryResultRow[] = [
  { id: 5544, name: 'Cobalt Ore', sc: 1, unitPrice: 100, averagePrice: 100, dealPct: 0, velocity: 5, gilFlow: 600, hq: false },
  { id: 5543, name: 'Rosewood Log', sc: 1, unitPrice: 50, averagePrice: 50, dealPct: 0, velocity: 5, gilFlow: 400, hq: false },
];

const catalog: GatheringCatalog = new Map([
  [5544, { level: 50, timed: false, hidden: false }],
  [5543, { level: 90, timed: true, hidden: false }],
]);

beforeEach(() => {
  localStorage.clear();
  useGatheringPlanStore.setState(defaultGatheringPlan());
});

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe('GatheringPlanner', () => {
  it('renders one row per pick with computed qty (time mode default)', () => {
    render(withProviders(<GatheringPlanner rows={rows} />));
    // With defaults (45 min * 100 ipm = 4500 items; gilFlow shares 60/40)
    // qty1 = 2700 ; qty2 = 1800
    expect(screen.getByText('Cobalt Ore')).toBeInTheDocument();
    expect(screen.getByText('Rosewood Log')).toBeInTheDocument();
    expect(screen.getByText(/2700|2,700/)).toBeInTheDocument();
    expect(screen.getByText(/1800|1,800/)).toBeInTheDocument();
  });

  it('switches to gil mode and recomputes', () => {
    render(withProviders(<GatheringPlanner rows={rows} />));
    fireEvent.click(screen.getByLabelText(/gil budget/i));
    // gil mode: budgetGil 500_000 default; shares 60/40
    // qty1 = round(500000*0.6/100) = 3000 ; qty2 = round(500000*0.4/50) = 4000
    expect(screen.getByText(/3000|3,000/)).toBeInTheDocument();
    expect(screen.getByText(/4000|4,000/)).toBeInTheDocument();
  });

  it('disables the export button when no rows are available', () => {
    render(withProviders(<GatheringPlanner rows={[]} />));
    expect(screen.getByRole('button', { name: /copy gbr clipboard string/i })).toBeDisabled();
  });

  it('copies an encoded blob to the clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(withProviders(<GatheringPlanner rows={rows} />));
    fireEvent.click(screen.getByRole('button', { name: /copy gbr clipboard string/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const arg = writeText.mock.calls[0][0] as string;
    expect(arg).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(arg.length).toBeGreaterThan(0);
  });

  it('falls back to a readonly textarea when clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(withProviders(<GatheringPlanner rows={rows} />));
    fireEvent.click(screen.getByRole('button', { name: /copy gbr clipboard string/i }));

    await waitFor(() => {
      expect(screen.getByText(/clipboard write failed/i)).toBeInTheDocument();
    });
    const textboxes = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
    const textarea = textboxes.find((el) => el.hasAttribute('readonly'));
    expect(textarea).toBeDefined();
    expect(textarea!.value).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(textarea!.value.length).toBeGreaterThan(0);
  });

  it('filters out rows above maxLevel', () => {
    useGatheringPlanStore.getState().setMaxLevel(60);
    render(withProviders(<GatheringPlanner rows={rows} catalog={catalog} />));
    // Only Cobalt Ore (lvl 50) survives the filter; Rosewood Log (lvl 90) is dropped.
    expect(screen.getByText('Cobalt Ore')).toBeInTheDocument();
    expect(screen.queryByText('Rosewood Log')).not.toBeInTheDocument();
  });

  it('hides timed-node rows by default and shows them when includeTimed is on', () => {
    // Default: includeTimed = false, maxLevel = 90 → Cobalt (untimed) survives, Rosewood (timed) doesn't.
    const { rerender } = render(withProviders(<GatheringPlanner rows={rows} catalog={catalog} />));
    expect(screen.getByText('Cobalt Ore')).toBeInTheDocument();
    expect(screen.queryByText('Rosewood Log')).not.toBeInTheDocument();

    // Toggle includeTimed on; Rosewood reappears.
    useGatheringPlanStore.getState().setIncludeTimed(true);
    rerender(withProviders(<GatheringPlanner rows={rows} catalog={catalog} />));
    expect(screen.getByText('Rosewood Log')).toBeInTheDocument();
  });

  it('renders zero-price rows as a — row instead of dropping them silently', () => {
    const rowsWithZero: QueryResultRow[] = [
      { id: 5544, name: 'Cobalt Ore', sc: 1, unitPrice: 100, averagePrice: 100, dealPct: 0, velocity: 5, gilFlow: 600, hq: false },
      { id: 5543, name: 'Free Sample', sc: 1, unitPrice: 0, averagePrice: 0, dealPct: 0, velocity: 0, gilFlow: 0, hq: false },
    ];
    render(withProviders(<GatheringPlanner rows={rowsWithZero} />));
    expect(screen.getByText('Cobalt Ore')).toBeInTheDocument();
    // The skipped row's name is visible, and its row contains — markers.
    const skippedName = screen.getByText('Free Sample');
    const row = skippedName.closest('tr')!;
    expect(row.textContent).toContain('—');
  });

  it('wraps item names in interactive links', () => {
    render(withProviders(<GatheringPlanner rows={rows} />));
    const link = screen.getByRole('link', { name: /cobalt ore/i });
    expect(link).toHaveAttribute('href');
    expect(link.getAttribute('href')).toContain('universalis.app');
  });
});
```

Key edits versus the previous version of this file:
1. Added the `QueryClient`/`QueryClientProvider` imports and `React` type import.
2. Added the `withProviders` helper.
3. Wrapped every `render(...)` and `rerender(...)` call with `withProviders(...)`.
4. Removed the `expect(skippedName.tagName.toLowerCase()).toBe('td');` line from the "renders zero-price rows" test (and tightened the comment to match).
5. Appended one new test: `'wraps item names in interactive links'`.

- [ ] **Step 2: Run the test file to confirm the new test fails**

Run: `npx vitest run src/features/gathering/GatheringPlanner.test.tsx`

Expected:
- All existing tests still pass (the provider wrapper is harmless on the unchanged component).
- The new `'wraps item names in interactive links'` test FAILS with something like `Unable to find an accessible element with the role "link"` because the planner is still rendering plain text.

- [ ] **Step 3: Modify the planner to use `<ItemNameLinks>`**

Open `src/features/gathering/GatheringPlanner.tsx`. Add this import alongside the existing imports near the top of the file:

```tsx
import { ItemNameLinks } from '../../components/ItemNameLinks';
```

Find the planned-rows loop in the `<tbody>` (the `result.rows.map(...)` block) and locate the item-name cell:

```tsx
              <td className="px-2 py-1.5">{r.name}</td>
```

Replace it with:

```tsx
              <td className="px-2 py-1.5">
                <ItemNameLinks id={r.id} name={r.name} />
              </td>
```

Find the skipped-rows loop (the `result.skippedZeroPriceRows.map(...)` block) and locate the italic item-name cell:

```tsx
              <td className="px-2 py-1.5 italic">{r.name}</td>
```

Replace it with:

```tsx
              <td className="px-2 py-1.5 italic">
                <ItemNameLinks id={r.id} name={r.name} />
              </td>
```

Don't change anything else in the file. No other props on `<ItemNameLinks>` — no `sub`, no `suffix`, no `crafter`. The italic on the parent `<td>` continues to apply to the wrapped name via CSS inheritance (`font-style` inherits).

- [ ] **Step 4: Run the full vitest suite and typecheck**

Run: `npx vitest run`

Expected: all suites pass — including the new `'wraps item names in interactive links'` test and the slightly-loosened `'renders zero-price rows'` test.

Run: `npx tsc --noEmit -p tsconfig.json`

Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/features/gathering/GatheringPlanner.tsx src/features/gathering/GatheringPlanner.test.tsx
git commit -m "$(printf 'feat(gathering): hover + click info on planner item names\n\nWraps each item name (planned rows and skipped zero-price rows) in\nItemNameLinks, picking up the existing hover-popover, click-to-\nUniversalis, copy-name button, and ilvl prefix for free. Tests get a\nQueryClientProvider wrapper since ItemNameLinks calls useSnapshotById\n(react-query-backed); the previous tagName assertion on the skipped\nrow drops since the name now lives inside an <a>.\n')"
```

---

## Self-review

**Spec coverage** (each section of the spec → covered task):
- Problem: planner names are plain text → Task 1 wraps them in `<ItemNameLinks>`.
- Goal: hover + click + copy + ilvl prefix → all inherited from `<ItemNameLinks>` after the wrap.
- Non-goals: no custom popover, no sub-line, no gathering badges, no math/store/query plumbing changes → respected; only the two `{r.name}` cells change.
- What changes: two cells + one import → Task 1 Step 3 covers exactly that.
- Testing — `QueryClientProvider` wrapper → Task 1 Step 1, point (1)–(3) of "Key edits."
- Testing — relax `tagName === 'td'` → Task 1 Step 1, point (4).
- Testing — new `'wraps item names in interactive links'` test → Task 1 Step 1, point (5).
- Risks (snapshot empty, world default, no popover assertion) → all acknowledged in the spec; no extra code needed.
- Out of scope → none of it appears in the plan.

**Placeholder scan:** No "TBD", "TODO", or vague "add appropriate handling" strings. All code blocks contain final code; all commands are runnable.

**Type consistency:**
- `<ItemNameLinks>` is imported from `'../../components/ItemNameLinks'` and called with `{ id: number; name: string }` — matches the component's declared `Props` interface (verified by reading `src/components/ItemNameLinks.tsx`).
- The test's `rows` fixture continues to satisfy `QueryResultRow` (no field changes).
- `withProviders` returns `React.ReactNode`; `render()` accepts that.
- `QueryClient` constructor args match react-query 5 (`{ defaultOptions: { queries: { retry: false } } }` — same pattern used in `src/routes/GatheringPlan.test.tsx` and `src/routes/Trading.test.tsx`).
