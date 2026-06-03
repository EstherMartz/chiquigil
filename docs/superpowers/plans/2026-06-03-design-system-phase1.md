# Design-System Refinement — Phase 1 (Global Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the highest-leverage, lowest-risk items from the designer critique — faint-label AA contrast, a global focus ring, a content max-width cap, green/red perceptual parity, and clearer card separation — almost entirely via Tailwind tokens + global CSS.

**Architecture:** Styling is centralized: semantic color + font tokens live in `tailwind.config.ts`, global base styles in `src/styles/index.css`, the app shell in `src/App.tsx`. Phase 1 changes those shared sources so the fixes ripple app-wide; only the card-separation audit touches individual views.

**Tech Stack:** Tailwind CSS, React 18, Vite, Vitest. Note: this is presentation work — most tasks are verified by build + typecheck + the existing suite + a visual review, not unit tests. The one genuinely testable item (contrast) gets a real WCAG regression test.

**Spec:** `docs/superpowers/specs/2026-06-03-design-system-refinement-design.md`

---

## File structure

**Create:**
- `src/styles/contrast.test.ts` — WCAG contrast-ratio regression test reading the Tailwind tokens.

**Modify:**
- `tailwind.config.ts` — `text-low` (contrast), `jade` + `crimson` (parity), `border-base` (separation).
- `src/styles/index.css` — global `:focus-visible` ring.
- `src/App.tsx` — content max-width wrapper inside `<main>`.
- Dashboard/view components (audit) — ensure card sections carry `border border-border-base`.

**Verification commands:** `npx vitest run <file>` (per task), `npm run build` + `npx tsc --noEmit` + full `npx vitest run` (final). Final visual review is done by the controller/user against the running app.

---

## Task 1: Faint-label contrast (WCAG AA) — with regression test

The `text-low` token (`#6a6354`) is ~3.0:1 on `bg-card` and is used by most 10–11px mono
labels — fails AA (4.5:1). Raise it to `#8a8274` (~4.7:1), which stays dimmer than `text-dim`
(`#9a9080`) so the `cream > dim > low` hierarchy is preserved.

**Files:**
- Create: `src/styles/contrast.test.ts`
- Modify: `tailwind.config.ts` (the `'text-low'` color value)

- [ ] **Step 1: Write the failing test**

Create `src/styles/contrast.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import config from '../../tailwind.config';

const colors = (config as any).theme.extend.colors as Record<string, string>;

/** sRGB channel → linear. */
function lin(c8: number): number {
  const s = c8 / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('faint label contrast (WCAG AA)', () => {
  it('text-low meets 4.5:1 on bg-card', () => {
    expect(contrast(colors['text-low'], colors['bg-card'])).toBeGreaterThanOrEqual(4.5);
  });

  it('text-dim also meets 4.5:1 on bg-card (sanity)', () => {
    expect(contrast(colors['text-dim'], colors['bg-card'])).toBeGreaterThanOrEqual(4.5);
  });

  it('preserves the cream > dim > low brightness hierarchy', () => {
    expect(luminance(colors['text-cream'])).toBeGreaterThan(luminance(colors['text-dim']));
    expect(luminance(colors['text-dim'])).toBeGreaterThan(luminance(colors['text-low']));
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/styles/contrast.test.ts`
Expected: the first test FAILS — `text-low` (`#6a6354`) is ~3.0:1, below 4.5. (The hierarchy + text-dim tests pass.)

- [ ] **Step 3: Update the token**

In `tailwind.config.ts`, change the `text-low` value:

```ts
        'text-low': '#8a8274',
```
(was `'#6a6354'`)

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/styles/contrast.test.ts`
Expected: PASS (3 tests) — `text-low` now ~4.7:1, still dimmer than `text-dim`.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts src/styles/contrast.test.ts
git commit -m "fix(a11y): raise text-low to meet WCAG AA on cards + contrast regression test"
```

---

## Task 2: Green/red perceptual parity

`jade` reads softer than `crimson`, biasing scanning toward losses. Swap both to the
designer's HSL-balanced values. Pure token change; verified by build (no unit test — the
balance is perceptual, not a luminance equation).

**Files:**
- Modify: `tailwind.config.ts` (`jade`, `crimson`)

- [ ] **Step 1: Update the tokens**

In `tailwind.config.ts`:

```ts
        crimson: '#c06a59',
        jade: '#64b46b',
```
(was `crimson: '#c2604a'`, `jade: '#6ab06f'`)

- [ ] **Step 2: Verify the build + existing tests are unaffected**

Run: `npx vitest run src/styles/contrast.test.ts`
Expected: PASS (Task 1 tests still green — these tokens aren't referenced there).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "style: balance positive/negative colors to equal perceived weight"
```

---

## Task 3: Global focus ring (a11y)

No visible focus indicator exists (the browser default is suppressed). Add an on-brand
`:focus-visible` ring in the base layer so every link/button/input shows focus.

**Files:**
- Modify: `src/styles/index.css`

- [ ] **Step 1: Add the base-layer rule**

In `src/styles/index.css`, after the `@tailwind utilities;` line, add:

```css
@layer base {
  :focus-visible {
    outline: 2px solid #d4a958; /* gold */
    outline-offset: 2px;
  }
}
```

- [ ] **Step 2: Verify the build compiles the CSS**

Run: `npm run build`
Expected: BUILD succeeds (Vite + Tailwind process the new `@layer base` rule without error).

- [ ] **Step 3: Commit**

```bash
git add src/styles/index.css
git commit -m "fix(a11y): add a visible gold focus-visible ring app-wide"
```

---

## Task 4: Content max-width cap

Main content stretches wall-to-wall on wide screens. Cap the content column at 1280px and
center it, without disturbing the flex shell or the sidebar.

**Files:**
- Modify: `src/App.tsx` (inside `<main>`)

- [ ] **Step 1: Wrap the main content**

In `src/App.tsx`, the `<main>` currently looks like:

```tsx
                <main className="flex-1 min-w-0 pt-16 md:pt-8 px-4 pb-[max(5rem,env(safe-area-inset-bottom))]">
                  <div className="flex justify-end"><UserMenu /></div>
                  <ContentBar />
                  <ErrorBoundary>
                    <Routes>
                      {/* …routes… */}
                    </Routes>
                  </ErrorBoundary>
                </main>
```

Wrap the three children (`UserMenu` div, `ContentBar`, `ErrorBoundary`) in a centered,
capped container — keep `<main>` itself as the flex child:

```tsx
                <main className="flex-1 min-w-0 pt-16 md:pt-8 px-4 pb-[max(5rem,env(safe-area-inset-bottom))]">
                  <div className="mx-auto w-full max-w-[1280px]">
                    <div className="flex justify-end"><UserMenu /></div>
                    <ContentBar />
                    <ErrorBoundary>
                      <Routes>
                        {/* …routes (unchanged)… */}
                      </Routes>
                    </ErrorBoundary>
                  </div>
                </main>
```

Do NOT change the `<Routes>` contents — only introduce the wrapping `<div>`.

- [ ] **Step 2: Verify types + build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "style: cap main content at 1280px and center on wide screens"
```

---

## Task 5: Card surface separation

Some sections (notably on the dashboard) blend into the background. Two parts: (a) nudge the
`border-base` token one step brighter so card edges and dividers read more clearly globally;
(b) audit the dashboard view and add `border border-border-base bg-bg-card` to any grouped
section that renders without a surface.

**Files:**
- Modify: `tailwind.config.ts` (`border-base`)
- Modify: dashboard view component(s) under `src/features/**` / `src/routes/Dashboard.tsx` as found in the audit

- [ ] **Step 1: Nudge the border token**

In `tailwind.config.ts`:

```ts
        'border-base': '#2f3858',
```
(was `'#28304a'`)

- [ ] **Step 2: Audit the dashboard for unbordered card sections**

Find the dashboard's section containers with the Grep tool: search `bg-bg-card` within
`src/routes/Dashboard.tsx` and the dashboard feature components it renders (e.g. under
`src/features/insights`, `src/features/movers`, `src/features/watchlist`).

Open `src/routes/Dashboard.tsx` and the components it renders. For each visually-distinct
section/card that uses `bg-bg-card` (or groups KPIs/tables) WITHOUT a `border`, add
`border border-border-base`. Do NOT restructure layout or change content — only add the
border class where a surface is missing one. If a section already has `border border-border-base`,
leave it.

- [ ] **Step 3: Verify types + build + existing suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all tests pass (the `border-base` change is a token; no test asserts its value).

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts src/routes/Dashboard.tsx src/features
git commit -m "style: crisper card separation (brighter border token + dashboard card audit)"
```

---

## Task 6: Final verification + visual review

**Files:** none (verification only)

- [ ] **Step 1: Full automated gate**

Run: `npx tsc --noEmit` → no errors.
Run: `npx vitest run` → all green (expect the existing suite plus the 3 new contrast tests).
Run: `npm run build` → succeeds (tsc + vite + build:api).

- [ ] **Step 2: Visual review (controller/user)**

Run the app locally (`npm run dev`, open an item page + the dashboard) or build+preview, and
confirm against the critique:
- 10–11px mono labels are clearly legible (no near-invisible captions).
- Tabbing shows a gold focus ring on links/buttons/inputs.
- On a wide (>1400px) viewport, content is centered and capped (~1280px), not wall-to-wall.
- Positive (green) and negative (red) values feel equally weighted.
- Dashboard sections read as distinct bordered cards, not a flat wash.

Note any item that still looks off; fix in a follow-up commit on this branch (re-run Step 1
after). The `border-base` nudge in Task 5 is the most subjective — if dividers now read too
heavy, dial it back toward `#2b3350` and re-review.

- [ ] **Step 3: (Done)**

Phase 1 complete. Phases 2 (typography & nav) and 3 (data-viz & forms) are separate plans
per the spec.
