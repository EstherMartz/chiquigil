# First-Time Onboarding Wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-step onboarding wizard that appears on first visit to configure world, DC, and crafter levels.

**Architecture:** New `OnboardingWizard` component renders as a modal overlay in App.tsx. Internal state machine tracks step + form values. World data fetched from Universalis API. Settings written incrementally via existing Zustand store.

**Tech Stack:** React 18, Zustand, Tailwind CSS

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `src/features/onboarding/fetchWorldData.ts` | Fetch world/DC mapping from Universalis |
| `src/features/onboarding/WorldPicker.tsx` | Searchable world select with DC auto-fill |
| `src/features/onboarding/CrafterSetup.tsx` | 8-job grid with quick-fill buttons |
| `src/features/onboarding/OnboardingWizard.tsx` | 3-step modal wizard |

### Modified Files
| File | Changes |
|------|---------|
| `src/App.tsx` | Conditionally render wizard |
| `src/routes/Settings.tsx` | "Redo setup" link |

---

## Task 1: World Data Fetcher

**Files:**
- Create: `src/features/onboarding/fetchWorldData.ts`

- [ ] **Step 1: Create the fetcher**

```ts
// src/features/onboarding/fetchWorldData.ts
import { dcOf } from '../../lib/europeWorlds';

export interface WorldEntry {
  name: string;
  dc: string;
}

interface RawDc { name: string; worlds: number[] }
interface RawWorld { id: number; name: string }

export async function fetchWorldData(): Promise<WorldEntry[]> {
  try {
    const [dcsRes, worldsRes] = await Promise.all([
      fetch('https://universalis.app/api/v2/data-centers'),
      fetch('https://universalis.app/api/v2/worlds'),
    ]);
    if (!dcsRes.ok || !worldsRes.ok) throw new Error('fetch failed');

    const dcs: RawDc[] = await dcsRes.json();
    const worlds: RawWorld[] = await worldsRes.json();

    const worldIdToName = new Map<number, string>();
    for (const w of worlds) worldIdToName.set(w.id, w.name);

    const entries: WorldEntry[] = [];
    for (const dc of dcs) {
      for (const wid of dc.worlds) {
        const name = worldIdToName.get(wid);
        if (name) entries.push({ name, dc: dc.name });
      }
    }
    entries.sort((a, b) => a.dc.localeCompare(b.dc) || a.name.localeCompare(b.name));
    return entries;
  } catch {
    // Fallback to hardcoded EU worlds
    const { CHAOS_WORLDS, LIGHT_WORLDS } = await import('../../lib/europeWorlds');
    const entries: WorldEntry[] = [];
    for (const w of CHAOS_WORLDS) entries.push({ name: w, dc: 'Chaos' });
    for (const w of LIGHT_WORLDS) entries.push({ name: w, dc: 'Light' });
    entries.sort((a, b) => a.dc.localeCompare(b.dc) || a.name.localeCompare(b.name));
    return entries;
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/fetchWorldData.ts
git commit -m "feat: add world/DC data fetcher for onboarding wizard"
```

---

## Task 2: WorldPicker Component

**Files:**
- Create: `src/features/onboarding/WorldPicker.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/onboarding/WorldPicker.tsx
import { useState, useRef, useEffect } from 'react';
import type { WorldEntry } from './fetchWorldData';

interface Props {
  worlds: WorldEntry[];
  value: string;
  onChange: (world: string, dc: string) => void;
}

export function WorldPicker({ worlds, value, onChange }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? worlds.filter((w) => w.name.toLowerCase().includes(query.toLowerCase()))
    : worlds;

  // Group by DC
  const grouped = new Map<string, WorldEntry[]>();
  for (const w of filtered) {
    const arr = grouped.get(w.dc) ?? [];
    arr.push(w);
    grouped.set(w.dc, arr);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function select(w: WorldEntry) {
    setQuery(w.name);
    onChange(w.name, w.dc);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low mb-1 block">
          Home World
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange('', ''); }}
          onFocus={() => setOpen(true)}
          placeholder="Type your world name…"
          className="w-full bg-bg-card-hi border border-border-base text-text-cream font-mono text-sm px-3 py-2 placeholder:text-text-low"
        />
      </label>

      {open && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-bg-card-hi border border-border-hi max-h-60 overflow-y-auto">
          {[...grouped.entries()].map(([dc, dcWorlds]) => (
            <div key={dc}>
              <div className="px-3 py-1 font-mono text-[9px] tracking-widest uppercase text-text-low bg-bg-card sticky top-0">
                {dc}
              </div>
              {dcWorlds.map((w) => (
                <button
                  key={w.name}
                  type="button"
                  onClick={() => select(w)}
                  className={`w-full text-left px-3 py-1.5 font-mono text-xs hover:bg-bg-card cursor-pointer ${
                    w.name === value ? 'text-gold' : 'text-text-cream'
                  }`}
                >
                  {w.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/WorldPicker.tsx
git commit -m "feat: add WorldPicker component for onboarding"
```

---

## Task 3: CrafterSetup Component

**Files:**
- Create: `src/features/onboarding/CrafterSetup.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/onboarding/CrafterSetup.tsx
import type { CrafterLevels } from '../settings/store';

const JOBS: (keyof CrafterLevels)[] = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL'];

function tierClass(lvl: number): string {
  if (lvl >= 100) return 'text-gold-hi';
  if (lvl >= 80) return 'text-text-cream';
  if (lvl >= 50) return 'text-text-dim';
  return 'text-text-low';
}

interface Props {
  levels: CrafterLevels;
  onChange: (levels: CrafterLevels) => void;
}

export function CrafterSetup({ levels, onChange }: Props) {
  function setLevel(job: keyof CrafterLevels, value: number) {
    onChange({ ...levels, [job]: Math.max(0, Math.min(100, value)) });
  }

  function allMax() {
    const next = { ...levels };
    for (const j of JOBS) next[j] = 100;
    onChange(next);
  }

  function clearAll() {
    const next = { ...levels };
    for (const j of JOBS) next[j] = 0;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={allMax}
          className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-dim px-3 py-1.5 hover:border-gold hover:text-gold transition-colors"
        >
          All level 100
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-dim px-3 py-1.5 hover:border-aether hover:text-aether transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {JOBS.map((job) => {
          const lvl = levels[job];
          return (
            <label key={job} className="flex flex-col items-center text-center p-2 border border-border-base bg-bg-card-hi">
              <span className="font-mono text-[10px] tracking-widest text-text-dim uppercase">{job}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={lvl}
                onChange={(e) => setLevel(job, Number(e.target.value) || 0)}
                className={`mt-1 w-full bg-transparent text-center font-display text-2xl font-semibold focus:outline-none ${tierClass(lvl)}`}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/CrafterSetup.tsx
git commit -m "feat: add CrafterSetup component for onboarding"
```

---

## Task 4: OnboardingWizard Modal

**Files:**
- Create: `src/features/onboarding/OnboardingWizard.tsx`

- [ ] **Step 1: Create the wizard**

```tsx
// src/features/onboarding/OnboardingWizard.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore, type CrafterLevels } from '../settings/store';
import { WorldPicker } from './WorldPicker';
import { CrafterSetup } from './CrafterSetup';
import { fetchWorldData, type WorldEntry } from './fetchWorldData';

const ZERO_LEVELS: CrafterLevels = { CRP: 0, BSM: 0, ARM: 0, GSM: 0, LTW: 0, WVR: 0, ALC: 0, CUL: 0 };

interface Props {
  onComplete: () => void;
  prefill?: boolean; // true = redo mode, pre-fill from current settings
}

export function OnboardingWizard({ onComplete, prefill }: Props) {
  const navigate = useNavigate();
  const settings = useSettingsStore();

  const [step, setStep] = useState(1);
  const [worlds, setWorlds] = useState<WorldEntry[]>([]);
  const [world, setWorld] = useState(prefill ? settings.world : '');
  const [dc, setDc] = useState(prefill ? settings.dc : '');
  const [levels, setLevels] = useState<CrafterLevels>(prefill ? { ...settings.retainerLevels } : { ...ZERO_LEVELS });

  useEffect(() => {
    fetchWorldData().then(setWorlds);
  }, []);

  function handleStep1Continue() {
    settings.setWorld(world);
    settings.setDc(dc);
    setStep(2);
  }

  function handleStep2Continue() {
    for (const [job, lvl] of Object.entries(levels)) {
      settings.setRetainerLevel(job as keyof CrafterLevels, lvl);
    }
    setStep(3);
  }

  function handleFinish(goToWhatNow: boolean) {
    localStorage.setItem('ffxiv-helper:onboarded', '1');
    onComplete();
    if (goToWhatNow) navigate('/home');
  }

  // Summary for step 3
  const nonZeroCrafters = Object.entries(levels)
    .filter(([, lvl]) => lvl > 0)
    .map(([job, lvl]) => `${job} ${lvl}`)
    .join(' · ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={step === 3 ? () => handleFinish(false) : undefined}
      />

      {/* Modal card */}
      <div className="relative z-10 max-w-lg w-full bg-bg-card border border-border-base p-6 max-h-[90vh] overflow-y-auto">
        {/* Progress pips */}
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <span
              key={s}
              className={`w-2 h-2 rounded-full ${s <= step ? 'bg-gold' : 'bg-border-base'}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-lg text-gold tracking-wide">Where do you play?</h2>
              <p className="font-mono text-[10px] text-text-low mt-1">
                All market prices and profit calculations are based on your home world and data center.
              </p>
            </div>

            <WorldPicker worlds={worlds} value={world} onChange={(w, d) => { setWorld(w); setDc(d); }} />

            {dc && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-text-low">Data Center:</span>
                <span className="font-mono text-[10px] tracking-widest uppercase border border-aether/40 text-aether px-2 py-0.5 rounded-sm">
                  {dc}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={handleStep1Continue}
              disabled={!world || !dc}
              className="w-full font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-3 hover:bg-gold hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continue →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-lg text-gold tracking-wide">What can you craft?</h2>
              <p className="font-mono text-[10px] text-text-low mt-1">
                Set the level of each crafting job. This filters out recipes you can't make and powers the Trained Eye threshold. Set to 0 if you don't have that job.
              </p>
            </div>

            <CrafterSetup levels={levels} onChange={setLevels} />

            <button
              type="button"
              onClick={handleStep2Continue}
              className="w-full font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-3 hover:bg-gold hover:text-bg-deep transition-colors"
            >
              Continue →
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-lg text-gold tracking-wide">
                You're all set, {world}!
              </h2>
              <p className="font-mono text-[10px] text-text-low mt-1">
                Gilipichi will now show you real market data for your world. Start with What Now? for an instant overview of your best gil-making opportunity right now.
              </p>
            </div>

            <div className="space-y-2 font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gold">◆</span>
                <span className="text-text-low">Home world:</span>
                <span className="text-text-cream">{world} · {dc}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gold">◆</span>
                <span className="text-text-low">Crafters:</span>
                <span className="text-text-cream">{nonZeroCrafters || 'none set'}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleFinish(true)}
                className="flex-1 font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-3 hover:bg-gold hover:text-bg-deep transition-colors"
              >
                Go to What Now? →
              </button>
              <button
                type="button"
                onClick={() => handleFinish(false)}
                className="flex-1 font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-dim px-4 py-3 hover:border-aether hover:text-aether transition-colors"
              >
                Explore the app
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/OnboardingWizard.tsx
git commit -m "feat: add 3-step onboarding wizard modal"
```

---

## Task 5: App Integration + Settings Redo Link

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/routes/Settings.tsx`

- [ ] **Step 1: Add wizard to App.tsx**

Read `src/App.tsx`. Add state + conditional render:

```tsx
import { useState } from 'react';
import { OnboardingWizard } from './features/onboarding/OnboardingWizard';

// Inside App component, before the return:
const [showOnboarding, setShowOnboarding] = useState(
  () => !localStorage.getItem('ffxiv-helper:onboarded'),
);
```

Render the wizard after `<Sidebar />` and before `<main>`:

```tsx
{showOnboarding && (
  <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
)}
```

- [ ] **Step 2: Add "Redo setup" link to Settings**

In `src/routes/Settings.tsx`, at the very bottom (after the last `<section>`), add:

```tsx
<div className="pt-4 border-t border-border-base">
  <button
    type="button"
    onClick={() => setShowRedo(true)}
    className="font-mono text-[10px] text-text-low hover:text-aether transition-colors"
  >
    Not your world? Run setup again →
  </button>
  {showRedo && (
    <OnboardingWizard
      prefill
      onComplete={() => setShowRedo(false)}
    />
  )}
</div>
```

Add state and import at top:

```tsx
import { useState } from 'react'; // may already be imported
import { OnboardingWizard } from '../features/onboarding/OnboardingWizard';

// Inside component:
const [showRedo, setShowRedo] = useState(false);
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 4: Run tests**

Run: `npx vitest run 2>&1 | tail -10`

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/routes/Settings.tsx
git commit -m "feat: integrate onboarding wizard in App + redo link in Settings"
```

---

## Task 6: Final Verification + Push

- [ ] **Step 1: Full build**

Run: `npx tsc --noEmit && npx vite build 2>&1 | tail -5`

- [ ] **Step 2: Run all tests**

Run: `npx vitest run 2>&1 | tail -10`

- [ ] **Step 3: Push**

```bash
git push
```
