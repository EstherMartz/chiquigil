# First-Time User Onboarding Wizard — Design Spec

**Date:** 2026-05-23
**Scope:** 3-step modal wizard for first-time users to configure world, DC, and crafter levels. Includes "Redo setup" link in Settings.

---

## 1. Trigger

Show wizard when `localStorage.getItem('ffxiv-helper:onboarded')` is falsy. After wizard completes, set `localStorage.setItem('ffxiv-helper:onboarded', '1')`.

Check in `App.tsx` — render `<OnboardingWizard>` conditionally based on a state flag initialized from localStorage.

---

## 2. World/DC Data

Fetch world-to-DC mapping from Universalis on wizard open:
- `GET https://universalis.app/api/v2/data-centers` — returns array of `{ name: string, worlds: number[] }`
- `GET https://universalis.app/api/v2/worlds` — returns array of `{ id: number, name: string }`

Join these to build a `Map<string, string>` of world name → DC name. Cache in component state (only needed during wizard).

Fallback: if fetch fails, use the existing hardcoded `europeWorlds.ts` data (EU only) so the wizard isn't blocked.

---

## 3. Wizard Steps

### Step 1: Your World

- Searchable text input filtering world names (case-insensitive)
- Dropdown shows matching worlds grouped by DC
- Selecting a world auto-fills the DC as a read-only pill
- **Continue →** disabled until world selected
- On continue: immediately write `world` and `dc` to `useSettingsStore`

### Step 2: Your Crafters

- Same 8-job grid as `LevelsEditor` but defaults all to **0** (not current store values on first run; current values on redo)
- Two quick buttons above grid: **All level 100** / **Clear all**
- **Continue →** always enabled
- On continue: write all crafter levels to `useSettingsStore`

### Step 3: You're Ready

- Summary showing configured world · DC and non-zero crafter levels
- **Go to What Now? →** (primary gold) — close wizard, navigate to `/home`
- **Explore the app** (secondary muted) — close wizard, stay on current page
- On close: set `ffxiv-helper:onboarded` flag

---

## 4. Modal Behaviour

- Full-screen dark overlay (`bg-black/60`)
- Centered card: `max-w-lg w-full bg-bg-card border border-border-base p-6`
- Steps 1–2: no backdrop dismiss, no close button
- Step 3: backdrop dismiss allowed
- Progress: 3 dots/pips at top showing current step (gold = active/completed, dim = pending)
- Mobile: modal scrollable, grid stacks to 2 columns

---

## 5. Redo Setup

Bottom of Settings page (after Backup & Restore):

```
Not your world? Run setup again →
```

Clicking opens the wizard pre-populated with current settings values. On completion, rewrites settings + flag.

---

## 6. Files

### New Files
| File | Purpose |
|------|---------|
| `src/features/onboarding/OnboardingWizard.tsx` | Wizard modal with 3 steps |
| `src/features/onboarding/WorldPicker.tsx` | Searchable world select with DC auto-fill |
| `src/features/onboarding/CrafterSetup.tsx` | 8-job grid with All-100 / Clear-all buttons |
| `src/features/onboarding/fetchWorldData.ts` | Fetch + join Universalis world/DC endpoints |
| `src/features/onboarding/useOnboarding.ts` | State hook: step, values, open/close, completion |

### Modified Files
| File | Changes |
|------|---------|
| `src/App.tsx` | Render `<OnboardingWizard>` conditionally |
| `src/routes/Settings.tsx` | "Redo setup" link at bottom |
