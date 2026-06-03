# Design-System Refinement (Designer Critique)

**Date:** 2026-06-03
**Status:** Approved (design) — Phase 1 first
**Source:** Designer review covering typography, color, spacing/layout, navigation, data-viz, forms, accessibility (pasted in full into the originating conversation).

## Goal

Bring the app's rendered UI in line with the designer's critique. The structure already
matches the proposed design (the item page already has the verdict card, the three-up
Price History / Cross-World Arb / Activity row, recipe + craft-sell math, etc.); the gap
is visual polish, token calibration, and accessibility. Work is app-wide, so it is split
into three independently shippable phases by leverage and risk.

## Foundation (where things live)

- **Color + font tokens:** `tailwind.config.ts` (`theme.extend.colors`, `fontFamily`).
- **Global base styles / font import / body:** `src/styles/index.css`.
- **Shared section header:** `src/components/SectionHeader.tsx` (mono-caps + sigil).
- **Shell / main content wrapper / sidebar:** `src/App.tsx`, `src/components/layout/Sidebar.tsx`, `ContentBar`.

Current tokens (relevant):
`bg-deep #0a0d18`, `bg-card #131725`, `bg-card-hi #1a1f30`, `border-base #28304a`,
`border-hi #3d476a`, `text-cream #e8d8b0`, `text-dim #9a9080`, `text-low #6a6354`,
`aether #6ec5ce`, `gold #d4a958`, `crimson #c2604a`, `jade #6ab06f`.
Fonts: `display: Cinzel`, `body: Fraunces`, `mono: JetBrains Mono`.

---

## Phase 1 — Global foundation (THIS phase)

All high-leverage, low-risk, mostly single-source edits. Acceptance for the whole phase:
`npm run build` succeeds, full test suite stays green, and a local screenshot review
confirms each item against the critique (CSS work is verified visually, not by unit test).

### 1.1 Faint-label contrast (High / a11y)
`text-low` (`#6a6354`) measures ~3.0:1 on `bg-card` — fails WCAG AA (4.5:1) for <18px text,
and most 10–11px mono labels use it. **Raise it to `#8a8274`** (~4.7:1 on `bg-card`), which
still sits *below* `text-dim` (`#9a9080`, ~5.66:1) so the three-tier hierarchy
(`cream > dim > low`) is preserved. `text-dim` and `text-cream` already pass; leave them.
Edit: `tailwind.config.ts` `colors['text-low']`.
(Label font-size bumps from the critique are deferred — the color fix alone reaches AA, and
size changes are per-component and can reflow layouts; revisit in Phase 2 if needed.)

### 1.2 Global focus ring (High / a11y)
No visible focus indicator today (browser default suppressed). Add to `src/styles/index.css`:
```css
@layer base {
  :focus-visible {
    outline: 2px solid #d4a958; /* gold */
    outline-offset: 2px;
  }
}
```
On-brand, passes contrast, applies to every link/button/input.

### 1.3 Content max-width cap (Medium)
Main content stretches wall-to-wall on wide screens. Cap the content column at
`max-w-[1280px] mx-auto`. Apply on the inner wrapper of `<main>` in `src/App.tsx` (the
`<main className="flex-1 …">` content), NOT the flex shell, so the sidebar layout is
unaffected. Interaction with the existing `>=1920px` `zoom` rule in index.css is fine —
`max-width` in px scales with `zoom`.

### 1.4 Green/red perceptual parity (Medium)
Current `jade #6ab06f` reads softer than `crimson #c2604a`, biasing scanning toward losses.
Recalibrate to equal perceived weight (designer's HSL):
- `jade`: `hsl(125 35% 55%)` → **`#64b46b`**
- `crimson`: `hsl(10 45% 55%)` → **`#c06a59`**
Edit: `tailwind.config.ts`. Both are used app-wide as the positive/negative semantic colors;
this is a pure token swap.

### 1.5 Card surface separation (High)
Some sections (notably on the dashboard) blend into the background because their surface and
the page share tones. Ensure every card-like section sits on `bg-card` with a
`border border-border-base`. During implementation, audit the dashboard + main views; if the
existing `border-base` reads too faint against `bg-deep`, nudge it one step brighter
(`#28304a` → `#2f3858`) — a global, low-risk change that also crisps table dividers. Decide
via the local screenshot review.

### Phase 1 verification
- `npm run build` green; `npx tsc --noEmit` clean; full `npx vitest run` green.
- Local run + screenshot of the dashboard and an item page; eyeball: labels legible,
  focus rings visible on tab, content centered/capped on a wide viewport, green/red balanced,
  cards visibly bordered.

---

## Phase 2 — Typography & navigation (later)

- **Two-font system:** retire Fraunces from data/KPIs; Cinzel for headings (h1–h3),
  JetBrains Mono for body/labels/data. Add `tabular-nums` to numeric/mono. Reconcile the
  page-`h1` (Cinzel) vs section-label (mono) treatment so same-hierarchy headers look alike.
- **Gold vs interactive split:** reserve `gold` for brand/decorative; use `aether` (teal)
  for interactive/active states (active nav item, active buttons/tabs). Audit usages.
- **Sidebar pass:** 1px right-edge divider (`rgba(212,169,88,0.15)`), active-item background
  tint (`rgba(212,169,88,0.08)`) in addition to the left border, clearer category labels
  (caps + letter-spacing, or a left-border group accent), and scale the logo art down (~60px).

## Phase 3 — Data-viz & forms (later)

- Margin-distribution histogram: sparse-data fallback (single "All N items · 75–100%" pill).
- Watchlist heatmap: encode category on border + margin tier on fill so lopsided data still
  reads (today it's monochrome-blue when everything is cross-world).
- Cross-world spread bars: color-code fill amber→teal by spread %.
- Sparklines: increase height to ~30–32px, brighter stroke.
- Forms: minimal custom `<select>`/`<input>` styling to match the mono labels.
- Tab toggles (COMFORTABLE/COMPACT, list-type filters) and the "stop suggesting" dismiss:
  give real button/chip affordance instead of text-color-only state.

---

## Out of scope (for now)
- Restructuring page layouts or information architecture (the structure already matches).
- New features. This is presentation only.
