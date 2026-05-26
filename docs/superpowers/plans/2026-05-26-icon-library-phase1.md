# Icon Library — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle FFXIV class/job, currency, HQ marker, and quest-type icons under `public/icons/`, expose them through a typed React primitive + wrappers, and decorate existing call sites — without changing any text labels or sort/filter behaviour.

**Architecture:** One `GameIcon` primitive (`<img>` with size + alt) plus four thin wrappers (`JobIcon`, `CurrencyIcon`, `QuestTypeIcon`, `HqStar` already exists and gets refactored). A one-off `scripts/extract-icon-mapping.ts` parses the gitignored gamerescape HTML with `jsdom` to produce `(label, filename)` mappings per category, which we paste into TS const maps and use to copy PNGs into `public/icons/{jobs,currency,quests,hq}/`.

**Tech Stack:** React 18, TypeScript, Tailwind, Vitest + React Testing Library, jsdom (already in devDependencies for vitest).

**Spec:** [docs/superpowers/specs/2026-05-26-icon-library-phase1-design.md](../specs/2026-05-26-icon-library-phase1-design.md)

---

## File Map

### Created

| Path | Responsibility |
|------|----------------|
| `src/lib/icons/GameIcon.tsx` | Base `<img>` primitive — size, alt, lazy, className |
| `src/lib/icons/GameIcon.test.tsx` | Primitive render tests |
| `src/lib/icons/JobIcon.tsx` | Wrapper keyed by 3-letter abbreviation |
| `src/lib/icons/JobIcon.test.tsx` | Job wrapper tests |
| `src/lib/icons/jobIcons.ts` | Const map `{ CRP: { file, alt }, ... }` |
| `src/lib/icons/CurrencyIcon.tsx` | Wrapper keyed by item ID (or `'gil'` sentinel) |
| `src/lib/icons/CurrencyIcon.test.tsx` | Currency wrapper tests |
| `src/lib/icons/currencyIcons.ts` | Const map keyed by item ID + `'gil'` |
| `src/lib/icons/QuestTypeIcon.tsx` | Wrapper keyed by quest-type slug |
| `src/lib/icons/QuestTypeIcon.test.tsx` | Quest wrapper tests |
| `src/lib/icons/questIcons.ts` | Const map keyed by slug + label→slug helper |
| `src/lib/icons/index.ts` | Re-exports |
| `scripts/extract-icon-mapping.ts` | One-off parser, prints TS maps + `cp` snippets |
| `scripts/extract-icon-mapping.test.ts` | Parser smoke test against inline fixture |
| `public/icons/jobs/*.png` | 11 PNGs renamed to friendly slugs |
| `public/icons/currency/*.png` | 17 PNGs |
| `public/icons/quests/*.png` | ~6 PNGs |
| `public/icons/hq/marker.png` | 1 PNG |

### Modified

| Path | What changes |
|------|--------------|
| `src/components/HqStar.tsx` | Render `<GameIcon src="/icons/hq/marker.png">` instead of inline `★` |
| `src/features/profit/RecipeModal.tsx` | Prefix the `{recipe.classJob}` text on line 60 with `<JobIcon>` |
| `src/features/leves/LevePlanner.tsx` | Prefix the job/class display with `<JobIcon>` (find via grep — `classJob` or similar prop) |
| `src/routes/GatheringPlan.tsx` | Prefix BTN/MIN/FSH labels with `<JobIcon>` |
| `src/routes/CraftFromInventory.tsx` | Prefix the recipe-job column with `<JobIcon>` |
| `src/features/queries/QuestItemFlipResults.tsx` | Prefix Category cell with `<JobIcon>` when the category resolves to a job, else `<QuestTypeIcon>` when it resolves to a quest type |
| `src/features/insights/CurrencyFlipView.tsx` | Prefix each option in the currency picker with `<CurrencyIcon>` |
| `src/features/items/CurrencySourceCard.tsx` | Prefix each currency-offer row's `shortLabel` with `<CurrencyIcon>` |
| `src/features/shoppingList/ShoppingListPlan.tsx` | Prefix the `└─ <cost> <shortLabel> avail.` info-line currency with `<CurrencyIcon>` |
| `src/routes/GcSeals.tsx` | Add the active GC's seal `<CurrencyIcon>` to the page header |
| `src/routes/QuestItems.tsx` (or `QuestItemFlipResults.tsx`) | Prefix Category cell with `<QuestTypeIcon>` when category resolves |

### Not Modified

12 existing `HqStar` callers (`src/routes/Item.tsx`, the various `*Results.tsx` files, etc.) are untouched — they get the new visual for free via the `HqStar` refactor.

---

## Task 1: GameIcon primitive (TDD)

**Files:**
- Create: `src/lib/icons/GameIcon.tsx`
- Test: `src/lib/icons/GameIcon.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/lib/icons/GameIcon.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GameIcon } from './GameIcon';

describe('GameIcon', () => {
  it('renders an img with the given src and alt', () => {
    render(<GameIcon src="/icons/jobs/CRP.png" alt="Carpenter" />);
    const img = screen.getByAltText('Carpenter');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/icons/jobs/CRP.png');
  });

  it('defaults size to 16 and applies it to width/height attributes', () => {
    render(<GameIcon src="/x.png" alt="x" />);
    const img = screen.getByAltText('x');
    expect(img).toHaveAttribute('width', '16');
    expect(img).toHaveAttribute('height', '16');
  });

  it('respects a custom size', () => {
    render(<GameIcon src="/x.png" alt="x" size={24} />);
    const img = screen.getByAltText('x');
    expect(img).toHaveAttribute('width', '24');
    expect(img).toHaveAttribute('height', '24');
  });

  it('uses empty alt when decorative=true', () => {
    render(<GameIcon src="/x.png" alt="Carpenter" decorative />);
    const img = document.querySelector('img');
    expect(img).toHaveAttribute('alt', '');
  });

  it('passes className through', () => {
    render(<GameIcon src="/x.png" alt="x" className="custom-cls" />);
    expect(screen.getByAltText('x')).toHaveClass('custom-cls');
  });

  it('sets loading=lazy by default', () => {
    render(<GameIcon src="/x.png" alt="x" />);
    expect(screen.getByAltText('x')).toHaveAttribute('loading', 'lazy');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/icons/GameIcon.test.tsx --run`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement GameIcon**

```tsx
// src/lib/icons/GameIcon.tsx
interface GameIconProps {
  src: string;
  alt: string;
  size?: number;
  decorative?: boolean;
  className?: string;
}

export function GameIcon({ src, alt, size = 16, decorative = false, className }: GameIconProps) {
  return (
    <img
      src={src}
      alt={decorative ? '' : alt}
      width={size}
      height={size}
      loading="lazy"
      className={`inline-block align-[-2px] ${className ?? ''}`}
      style={{ width: size, height: size }}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/icons/GameIcon.test.tsx --run`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/lib/icons/GameIcon.tsx src/lib/icons/GameIcon.test.tsx
git commit -m "feat(icons): GameIcon primitive

Base <img> component with size, alt, decorative-alt-suppression, and
baseline alignment built in. Foundation for JobIcon / CurrencyIcon /
QuestTypeIcon wrappers and the HqStar refactor."
```

---

## Task 2: Extraction script with fixture test

**Files:**
- Create: `scripts/extract-icon-mapping.ts`
- Test: `scripts/extract-icon-mapping.test.ts`

**Background:** The gitignored HTML is at `Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki.html` (project root). Section headings are MediaWiki-style `<h2>`/`<h3>` with `<span class="mw-headline" id="...">`. Tables follow each heading. Each table cell pair looks like:

```html
<td><a href="..."><img src="..._files/062001_hr1.png" ...></a></td>
<td>Carpenter</td>
```

We use `jsdom` (already in devDependencies) to parse.

- [ ] **Step 1: Write the failing test against an inline fixture**

```ts
// scripts/extract-icon-mapping.test.ts
import { describe, it, expect } from 'vitest';
import { extractSectionMapping } from './extract-icon-mapping';

const FIXTURE = `
<h3><span class="mw-headline" id="Test_Section">Test Section</span></h3>
<table>
  <tr>
    <td><a href="/file/X"><img src="folder/062001_hr1.png" alt="X"></a></td>
    <td>Carpenter</td>
  </tr>
  <tr>
    <td><a href="/file/Y"><img src="folder/062002_hr1.png" alt="Y"></a></td>
    <td>Blacksmith</td>
  </tr>
</table>
<h3><span class="mw-headline" id="Next_Section">Next Section</span></h3>
<table>
  <tr>
    <td><img src="folder/999999_hr1.png"></td>
    <td>Should Not Appear</td>
  </tr>
</table>
`;

describe('extractSectionMapping', () => {
  it('extracts (label, filename) pairs from the table following the named heading, stopping at the next heading', () => {
    const result = extractSectionMapping(FIXTURE, 'Test_Section');
    expect(result).toEqual([
      { label: 'Carpenter', filename: '062001_hr1.png' },
      { label: 'Blacksmith', filename: '062002_hr1.png' },
    ]);
  });

  it('returns empty array when the heading is missing', () => {
    expect(extractSectionMapping(FIXTURE, 'No_Such_Section')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- scripts/extract-icon-mapping.test.ts --run`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the script**

```ts
// scripts/extract-icon-mapping.ts
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

export interface IconMappingEntry {
  label: string;
  filename: string;
}

/**
 * Extracts (label, filename) pairs from the first <table> following the
 * heading whose <span class="mw-headline"> has the given id. Stops at the
 * next heading element.
 */
export function extractSectionMapping(html: string, headlineId: string): IconMappingEntry[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const headline = doc.querySelector(`span.mw-headline[id="${headlineId}"]`);
  if (!headline) return [];
  const heading = headline.closest('h1, h2, h3, h4, h5, h6');
  if (!heading) return [];

  // Walk forward siblings until we hit the next heading or the end.
  const results: IconMappingEntry[] = [];
  let cur = heading.nextElementSibling;
  while (cur && !/^H[1-6]$/.test(cur.tagName)) {
    if (cur.tagName === 'TABLE') {
      const rows = cur.querySelectorAll('tr');
      for (const row of Array.from(rows)) {
        const img = row.querySelector('img');
        const cells = row.querySelectorAll('td');
        if (!img || cells.length < 2) continue;
        const src = img.getAttribute('src');
        if (!src) continue;
        const filename = basename(src);
        const label = (cells[1].textContent ?? '').trim();
        if (filename && label) results.push({ label, filename });
      }
    }
    cur = cur.nextElementSibling;
  }
  return results;
}

const HTML_PATH = "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki.html";

// CLI: `tsx scripts/extract-icon-mapping.ts <headlineId>`
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('extract-icon-mapping.ts')) {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: tsx scripts/extract-icon-mapping.ts <headlineId>');
    console.error('Common ids: Disciple_of_Land.2FHand_Class_Icons, Currency, Quest_Types');
    process.exit(1);
  }
  if (!existsSync(HTML_PATH)) {
    console.error(`HTML file not found at ${HTML_PATH}`);
    process.exit(2);
  }
  const html = readFileSync(HTML_PATH, 'utf8');
  const entries = extractSectionMapping(html, id);
  console.log(`// ${entries.length} entries for ${id}`);
  for (const e of entries) console.log(JSON.stringify(e));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- scripts/extract-icon-mapping.test.ts --run`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract-icon-mapping.ts scripts/extract-icon-mapping.test.ts
git commit -m "feat(icons): extraction script for gamerescape Dictionary HTML

Parses the gitignored Dictionary-of-Icons HTML with jsdom, walks the
table after a named section heading, returns (label, filename) pairs.
One-off helper; commits are the .ts maps it generates plus the PNGs."
```

---

## Task 3: Job icons — data + JobIcon wrapper

**Files:**
- Create: `src/lib/icons/jobIcons.ts`
- Create: `src/lib/icons/JobIcon.tsx`
- Test: `src/lib/icons/JobIcon.test.tsx`
- Create: `public/icons/jobs/*.png` (11 files)

- [ ] **Step 1: Run extraction script for the DoH/DoL class section**

```bash
npx tsx scripts/extract-icon-mapping.ts Disciple_of_Land.2FHand_Class_Icons
```

Expected output: a JSON-Lines list of ~12 entries (CRP, BSM, ARM, GSM, LTW, WVR, ALC, CUL, MIN, BTN, FSH; possibly also a generic DoH/DoL summary row to discard). Copy the relevant filenames.

- [ ] **Step 2: Copy + rename PNGs**

```bash
mkdir -p public/icons/jobs
# Replace NNNNNN_hr1.png with the actual filename from Step 1's output.
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<carpenter_filename>" public/icons/jobs/CRP.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<blacksmith_filename>" public/icons/jobs/BSM.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<armorer_filename>" public/icons/jobs/ARM.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<goldsmith_filename>" public/icons/jobs/GSM.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<leatherworker_filename>" public/icons/jobs/LTW.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<weaver_filename>" public/icons/jobs/WVR.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<alchemist_filename>" public/icons/jobs/ALC.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<culinarian_filename>" public/icons/jobs/CUL.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<miner_filename>" public/icons/jobs/MIN.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<botanist_filename>" public/icons/jobs/BTN.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<fisher_filename>" public/icons/jobs/FSH.png
```

Verify:
```bash
ls public/icons/jobs/ | wc -l
# Expected: 11
```

- [ ] **Step 3: Write the jobIcons.ts map**

```ts
// src/lib/icons/jobIcons.ts
export type JobKey = 'CRP' | 'BSM' | 'ARM' | 'GSM' | 'LTW' | 'WVR' | 'ALC' | 'CUL' | 'MIN' | 'BTN' | 'FSH';

interface JobIconEntry {
  file: string; // path under public/
  alt: string;
}

export const JOB_ICONS: Readonly<Record<JobKey, JobIconEntry>> = {
  CRP: { file: '/icons/jobs/CRP.png', alt: 'Carpenter' },
  BSM: { file: '/icons/jobs/BSM.png', alt: 'Blacksmith' },
  ARM: { file: '/icons/jobs/ARM.png', alt: 'Armorer' },
  GSM: { file: '/icons/jobs/GSM.png', alt: 'Goldsmith' },
  LTW: { file: '/icons/jobs/LTW.png', alt: 'Leatherworker' },
  WVR: { file: '/icons/jobs/WVR.png', alt: 'Weaver' },
  ALC: { file: '/icons/jobs/ALC.png', alt: 'Alchemist' },
  CUL: { file: '/icons/jobs/CUL.png', alt: 'Culinarian' },
  MIN: { file: '/icons/jobs/MIN.png', alt: 'Miner' },
  BTN: { file: '/icons/jobs/BTN.png', alt: 'Botanist' },
  FSH: { file: '/icons/jobs/FSH.png', alt: 'Fisher' },
};

export function isJobKey(s: string): s is JobKey {
  return s in JOB_ICONS;
}
```

- [ ] **Step 4: Write the failing test**

```tsx
// src/lib/icons/JobIcon.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { JobIcon } from './JobIcon';

describe('JobIcon', () => {
  it('renders the matching icon for a known job key', () => {
    render(<JobIcon job="CRP" />);
    const img = document.querySelector('img');
    expect(img).toHaveAttribute('src', '/icons/jobs/CRP.png');
  });

  it('passes alt through (presentational by default = empty alt)', () => {
    render(<JobIcon job="CRP" />);
    expect(document.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('uses non-empty alt when decorative={false}', () => {
    render(<JobIcon job="CRP" decorative={false} />);
    expect(document.querySelector('img')).toHaveAttribute('alt', 'Carpenter');
  });

  it('renders null for unknown keys', () => {
    const { container } = render(<JobIcon job={'XXX' as never} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `npm test -- src/lib/icons/JobIcon.test.tsx --run`
Expected: FAIL.

- [ ] **Step 6: Implement JobIcon**

```tsx
// src/lib/icons/JobIcon.tsx
import { GameIcon } from './GameIcon';
import { JOB_ICONS, type JobKey } from './jobIcons';

interface Props {
  job: JobKey;
  size?: number;
  decorative?: boolean;
  className?: string;
}

export function JobIcon({ job, size, decorative = true, className }: Props) {
  const entry = JOB_ICONS[job];
  if (!entry) return null;
  return <GameIcon src={entry.file} alt={entry.alt} size={size} decorative={decorative} className={className} />;
}
```

- [ ] **Step 7: Run tests to verify pass**

Run: `npm test -- src/lib/icons/JobIcon.test.tsx --run`
Expected: PASS, 4/4.

- [ ] **Step 8: Commit**

```bash
git add public/icons/jobs/ src/lib/icons/jobIcons.ts src/lib/icons/JobIcon.tsx src/lib/icons/JobIcon.test.tsx
git commit -m "feat(icons): JobIcon wrapper + 11 DoH/DoL class icons

Adds public/icons/jobs/ with CRP/BSM/ARM/GSM/LTW/WVR/ALC/CUL plus
BTN/MIN/FSH PNGs (extracted from gamerescape Dictionary of Icons via
scripts/extract-icon-mapping.ts). JobIcon wrapper renders null for
unknown keys."
```

---

## Task 4: Currency icons — data + CurrencyIcon wrapper

**Files:**
- Create: `src/lib/icons/currencyIcons.ts`
- Create: `src/lib/icons/CurrencyIcon.tsx`
- Test: `src/lib/icons/CurrencyIcon.test.tsx`
- Create: `public/icons/currency/*.png` (17 files)

**Currencies to extract** (cross-reference `src/lib/currencies.ts` and `src/lib/gcSealsYield.ts`):

| Key | Item ID | Label |
|---|---|---|
| 28 | 28 | Allagan Tomestone of Poetics |
| 48 | 48 | Allagan Tomestone of Mathematics |
| 47 | 47 | Allagan Tomestone of Heliometry |
| 49 | 49 | Allagan Tomestone of Mnemonics |
| 25199 | 25199 | White Crafters' Scrip |
| 33913 | 33913 | Purple Crafters' Scrip |
| 41784 | 41784 | Orange Crafters' Scrip |
| 25200 | 25200 | White Gatherers' Scrip |
| 33914 | 33914 | Purple Gatherers' Scrip |
| 41785 | 41785 | Orange Gatherers' Scrip |
| 29 | 29 | MGP |
| 25 | 25 | Wolf Marks |
| 26807 | 26807 | Bicolor Gemstone |
| (Maelstrom seal) | from gcSealsYield.ts | Storm Seal |
| (Twin Adder seal) | from gcSealsYield.ts | Serpent Seal |
| (Immortal Flames seal) | from gcSealsYield.ts | Flame Seal |
| 'gil' | sentinel | Gil |

- [ ] **Step 1: Run extraction for the Currency section**

```bash
npx tsx scripts/extract-icon-mapping.ts Currency
```

Expected: ~20-30 entries. We pick the 17 we need by label.

- [ ] **Step 2: Copy + rename PNGs**

```bash
mkdir -p public/icons/currency
# For each (label, filename) pair from Step 1 that we keep, copy with friendly name:
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<poetics_file>" public/icons/currency/28.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<mathematics_file>" public/icons/currency/48.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<heliometry_file>" public/icons/currency/47.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<mnemonics_file>" public/icons/currency/49.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<wcraft_file>" public/icons/currency/25199.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<pcraft_file>" public/icons/currency/33913.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<ocraft_file>" public/icons/currency/41784.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<wgather_file>" public/icons/currency/25200.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<pgather_file>" public/icons/currency/33914.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<ogather_file>" public/icons/currency/41785.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<mgp_file>" public/icons/currency/29.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<wolf_file>" public/icons/currency/25.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<bicolor_file>" public/icons/currency/26807.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<storm_seal_file>" public/icons/currency/storm-seal.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<serpent_seal_file>" public/icons/currency/serpent-seal.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<flame_seal_file>" public/icons/currency/flame-seal.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<gil_file>" public/icons/currency/gil.png
```

Verify:
```bash
ls public/icons/currency/ | wc -l
# Expected: 17
```

If a label doesn't appear in the extracted entries (some currencies may live under a different section heading like "Grand Company"), grep the HTML for the literal label and locate the surrounding `<img src>` manually. Note any gaps as `TODO: file missing — falls back to text-only` in the map.

- [ ] **Step 3: Write currencyIcons.ts**

```ts
// src/lib/icons/currencyIcons.ts
export type CurrencyIconKey = number | 'gil' | 'storm-seal' | 'serpent-seal' | 'flame-seal';

interface CurrencyIconEntry {
  file: string;
  alt: string;
}

export const CURRENCY_ICONS: ReadonlyMap<CurrencyIconKey, CurrencyIconEntry> = new Map([
  [28,    { file: '/icons/currency/28.png',    alt: 'Allagan Tomestone of Poetics' }],
  [48,    { file: '/icons/currency/48.png',    alt: 'Allagan Tomestone of Mathematics' }],
  [47,    { file: '/icons/currency/47.png',    alt: 'Allagan Tomestone of Heliometry' }],
  [49,    { file: '/icons/currency/49.png',    alt: 'Allagan Tomestone of Mnemonics' }],
  [25199, { file: '/icons/currency/25199.png', alt: "White Crafters' Scrip" }],
  [33913, { file: '/icons/currency/33913.png', alt: "Purple Crafters' Scrip" }],
  [41784, { file: '/icons/currency/41784.png', alt: "Orange Crafters' Scrip" }],
  [25200, { file: '/icons/currency/25200.png', alt: "White Gatherers' Scrip" }],
  [33914, { file: '/icons/currency/33914.png', alt: "Purple Gatherers' Scrip" }],
  [41785, { file: '/icons/currency/41785.png', alt: "Orange Gatherers' Scrip" }],
  [29,    { file: '/icons/currency/29.png',    alt: 'MGP' }],
  [25,    { file: '/icons/currency/25.png',    alt: 'Wolf Marks' }],
  [26807, { file: '/icons/currency/26807.png', alt: 'Bicolor Gemstone' }],
  ['gil',          { file: '/icons/currency/gil.png',          alt: 'Gil' }],
  ['storm-seal',   { file: '/icons/currency/storm-seal.png',   alt: 'Storm Seal' }],
  ['serpent-seal', { file: '/icons/currency/serpent-seal.png', alt: 'Serpent Seal' }],
  ['flame-seal',   { file: '/icons/currency/flame-seal.png',   alt: 'Flame Seal' }],
]);
```

- [ ] **Step 4: Write the failing test**

```tsx
// src/lib/icons/CurrencyIcon.test.tsx
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CurrencyIcon } from './CurrencyIcon';

describe('CurrencyIcon', () => {
  it('renders by numeric item id', () => {
    const { container } = render(<CurrencyIcon currencyKey={28} />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/icons/currency/28.png');
  });

  it('renders by gil sentinel', () => {
    const { container } = render(<CurrencyIcon currencyKey="gil" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/icons/currency/gil.png');
  });

  it('renders by GC seal slug', () => {
    const { container } = render(<CurrencyIcon currencyKey="storm-seal" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/icons/currency/storm-seal.png');
  });

  it('renders null for unknown key', () => {
    const { container } = render(<CurrencyIcon currencyKey={999999} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `npm test -- src/lib/icons/CurrencyIcon.test.tsx --run`
Expected: FAIL.

- [ ] **Step 6: Implement CurrencyIcon**

```tsx
// src/lib/icons/CurrencyIcon.tsx
import { GameIcon } from './GameIcon';
import { CURRENCY_ICONS, type CurrencyIconKey } from './currencyIcons';

interface Props {
  currencyKey: CurrencyIconKey;
  size?: number;
  decorative?: boolean;
  className?: string;
}

export function CurrencyIcon({ currencyKey, size, decorative = true, className }: Props) {
  const entry = CURRENCY_ICONS.get(currencyKey);
  if (!entry) return null;
  return <GameIcon src={entry.file} alt={entry.alt} size={size} decorative={decorative} className={className} />;
}
```

- [ ] **Step 7: Run tests to verify pass**

Run: `npm test -- src/lib/icons/CurrencyIcon.test.tsx --run`
Expected: PASS, 4/4.

- [ ] **Step 8: Commit**

```bash
git add public/icons/currency/ src/lib/icons/currencyIcons.ts src/lib/icons/CurrencyIcon.tsx src/lib/icons/CurrencyIcon.test.tsx
git commit -m "feat(icons): CurrencyIcon wrapper + 17 currency icons

Keyed by FFXIV item id (tomestones, scrips, MGP, Wolf Marks, Bicolor)
plus four string sentinels (gil + three GC seals). Renders null for
unknown keys."
```

---

## Task 5: Quest type icons — data + QuestTypeIcon wrapper

**Files:**
- Create: `src/lib/icons/questIcons.ts`
- Create: `src/lib/icons/QuestTypeIcon.tsx`
- Test: `src/lib/icons/QuestTypeIcon.test.tsx`
- Create: `public/icons/quests/*.png` (~6 files)

- [ ] **Step 1: Run extraction for the Quest Types section**

```bash
npx tsx scripts/extract-icon-mapping.ts Quest_Types
```

Expected: ~10–20 entries (MSQ, side, feature, beast tribe, repeatable, leve, blue, plus per-expansion variants). For V1 we keep 6: `msq`, `side`, `feature`, `beast-tribe`, `repeatable`, `leve`.

- [ ] **Step 2: Copy + rename PNGs**

```bash
mkdir -p public/icons/quests
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<msq_file>" public/icons/quests/msq.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<side_file>" public/icons/quests/side.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<feature_file>" public/icons/quests/feature.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<beast_tribe_file>" public/icons/quests/beast-tribe.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<repeatable_file>" public/icons/quests/repeatable.png
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<leve_file>" public/icons/quests/leve.png
```

Verify: `ls public/icons/quests/ | wc -l` → 6.

- [ ] **Step 3: Write questIcons.ts**

```ts
// src/lib/icons/questIcons.ts
export type QuestTypeKey = 'msq' | 'side' | 'feature' | 'beast-tribe' | 'repeatable' | 'leve';

interface QuestIconEntry {
  file: string;
  alt: string;
}

export const QUEST_ICONS: Readonly<Record<QuestTypeKey, QuestIconEntry>> = {
  'msq':         { file: '/icons/quests/msq.png',         alt: 'Main Scenario Quest' },
  'side':        { file: '/icons/quests/side.png',        alt: 'Side Quest' },
  'feature':     { file: '/icons/quests/feature.png',     alt: 'Feature Quest' },
  'beast-tribe': { file: '/icons/quests/beast-tribe.png', alt: 'Beast Tribe Quest' },
  'repeatable':  { file: '/icons/quests/repeatable.png',  alt: 'Repeatable Quest' },
  'leve':        { file: '/icons/quests/leve.png',        alt: 'Levequest' },
};

/**
 * Best-effort resolution of an XIVAPI JournalCategory name (used by /quest-items)
 * to a known quest-type slug. Returns null if we don't have an icon for it.
 */
export function categoryNameToQuestType(name: string): QuestTypeKey | null {
  const lower = name.toLowerCase();
  if (lower.includes('main scenario')) return 'msq';
  if (lower.includes('beast tribe') || lower.includes('allied')) return 'beast-tribe';
  if (lower.includes('levequest') || lower.includes('leve ')) return 'leve';
  if (lower.includes('feature') || lower.includes('class quest') || lower.includes('job quest')) return 'feature';
  if (lower.includes('repeatable') || lower.includes('daily') || lower.includes('weekly')) return 'repeatable';
  if (lower.includes('side')) return 'side';
  return null;
}
```

- [ ] **Step 4: Write the failing tests**

```tsx
// src/lib/icons/QuestTypeIcon.test.tsx
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QuestTypeIcon } from './QuestTypeIcon';
import { categoryNameToQuestType } from './questIcons';

describe('QuestTypeIcon', () => {
  it('renders the matching icon', () => {
    const { container } = render(<QuestTypeIcon type="msq" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/icons/quests/msq.png');
  });

  it('renders null for unknown type', () => {
    const { container } = render(<QuestTypeIcon type={'unknown' as never} />);
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('categoryNameToQuestType', () => {
  it.each([
    ['Main Scenario Quest', 'msq'],
    ['Side Quest', 'side'],
    ['Disciple of the Hand', null],
    ['Levequest', 'leve'],
    ['Beast Tribe Quest', 'beast-tribe'],
    ['Allied Beast Tribe Quest', 'beast-tribe'],
    ['Carpenter', null],
  ])('maps %s -> %s', (input, expected) => {
    expect(categoryNameToQuestType(input)).toBe(expected);
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `npm test -- src/lib/icons/QuestTypeIcon.test.tsx --run`
Expected: FAIL.

- [ ] **Step 6: Implement QuestTypeIcon**

```tsx
// src/lib/icons/QuestTypeIcon.tsx
import { GameIcon } from './GameIcon';
import { QUEST_ICONS, type QuestTypeKey } from './questIcons';

interface Props {
  type: QuestTypeKey;
  size?: number;
  decorative?: boolean;
  className?: string;
}

export function QuestTypeIcon({ type, size, decorative = true, className }: Props) {
  const entry = QUEST_ICONS[type];
  if (!entry) return null;
  return <GameIcon src={entry.file} alt={entry.alt} size={size} decorative={decorative} className={className} />;
}
```

- [ ] **Step 7: Run tests to verify pass**

Run: `npm test -- src/lib/icons/QuestTypeIcon.test.tsx --run`
Expected: PASS.

- [ ] **Step 8: Add index.ts re-exports**

```ts
// src/lib/icons/index.ts
export { GameIcon } from './GameIcon';
export { JobIcon } from './JobIcon';
export { CurrencyIcon } from './CurrencyIcon';
export { QuestTypeIcon } from './QuestTypeIcon';
export { JOB_ICONS, type JobKey, isJobKey } from './jobIcons';
export { CURRENCY_ICONS, type CurrencyIconKey } from './currencyIcons';
export { QUEST_ICONS, type QuestTypeKey, categoryNameToQuestType } from './questIcons';
```

- [ ] **Step 9: Commit**

```bash
git add public/icons/quests/ src/lib/icons/questIcons.ts src/lib/icons/QuestTypeIcon.tsx src/lib/icons/QuestTypeIcon.test.tsx src/lib/icons/index.ts
git commit -m "feat(icons): QuestTypeIcon wrapper + 6 quest-type icons + index barrel

Covers MSQ, Side, Feature, Beast Tribe, Repeatable, Leve. Includes
categoryNameToQuestType() helper for resolving XIVAPI JournalCategory
names to quest-type slugs (used by /quest-items)."
```

---

## Task 6: HQ marker — refactor HqStar to render an icon

**Files:**
- Create: `public/icons/hq/marker.png` (1 file)
- Modify: `src/components/HqStar.tsx`

**Context:** The existing `HqStar` component renders a `★` text glyph and is consumed by 12 call sites. Refactoring its internals lets every consumer get the icon for free.

- [ ] **Step 1: Run extraction for the HQ marker**

```bash
npx tsx scripts/extract-icon-mapping.ts Item_Icons
```

Find the row whose label is `High Quality` (or similar — could also be in `Quest_Icons` or `Player_Icons` if it's not in `Item_Icons`; if not found there, grep the HTML directly: `grep -n "High Quality" "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki.html"`).

- [ ] **Step 2: Copy the HQ marker PNG**

```bash
mkdir -p public/icons/hq
cp "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki_files/<hq_file>" public/icons/hq/marker.png
```

- [ ] **Step 3: Read the existing HqStar test surface**

```bash
# Identify the existing tests that snapshot HqStar output:
grep -rn "HqStar" src/ --include="*.test.tsx" --include="*.test.ts"
```

Most consumers test the inline `★` text. After this refactor, those tests will need to assert the presence of `<img alt="High Quality">` instead. Make a list of files to update in step 6.

- [ ] **Step 4: Write the new HqStar tests**

Replace the contents of (or add to) `src/components/HqStar.test.tsx` (create if it doesn't exist):

```tsx
// src/components/HqStar.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HqStar } from './HqStar';

describe('HqStar', () => {
  it('renders the HQ marker image with accessible alt', () => {
    render(<HqStar />);
    const img = screen.getByAltText('High Quality');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/icons/hq/marker.png');
  });

  it('adds a leading space via margin when leading=true', () => {
    const { container } = render(<HqStar leading />);
    expect(container.querySelector('span')?.className).toMatch(/ml-1/);
  });

  it('renders at larger size when big=true', () => {
    const { container } = render(<HqStar big />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('width', '18'); // 18px for big, 14px otherwise
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npm test -- src/components/HqStar.test.tsx --run`
Expected: FAIL (no img rendered).

- [ ] **Step 6: Refactor HqStar.tsx**

```tsx
// src/components/HqStar.tsx
import { GameIcon } from '../lib/icons/GameIcon';

interface Props {
  /** Leading space for inline use after the item name. */
  leading?: boolean;
  /** Slightly larger marker, e.g. for masthead. */
  big?: boolean;
}

/**
 * High-Quality marker. Renders the in-game HQ icon with a soft golden glow
 * on hover so the HQ signal carries warmth and reads consistently across
 * tables. (Replaced the inline ★ glyph in May 2026.)
 */
export function HqStar({ leading, big }: Props) {
  return (
    <span
      className={`inline-block transition-[filter] duration-200 hover:[filter:drop-shadow(0_0_4px_rgb(212_169_88_/_0.8))] ${leading ? 'ml-1' : ''}`}
    >
      <GameIcon
        src="/icons/hq/marker.png"
        alt="High Quality"
        size={big ? 18 : 14}
        decorative={false}
      />
    </span>
  );
}
```

- [ ] **Step 7: Run HqStar tests to verify pass**

Run: `npm test -- src/components/HqStar.test.tsx --run`
Expected: PASS, 3/3.

- [ ] **Step 8: Run the wider test suite — expect some consumer-side failures**

Run: `npm test -- --run`
Expected: Most pass; any test that asserts the literal `'★'` string in the rendered output of a consumer (e.g. `Item.test.tsx`, `CurrencySourceCard.test.tsx`) will FAIL. Update each one to assert `getByAltText('High Quality')` or `getAllByAltText(...)` instead of querying for the `'★'` text node.

For each failing test:
1. Read the failure to confirm it's `★`-related.
2. Replace `'★'` text assertions with `screen.getByAltText('High Quality')` (or `.getAllByAltText(...)` when multiple HQ markers can appear).
3. Re-run the file's test to confirm green.

- [ ] **Step 9: Run the full suite to confirm all green**

Run: `npm test -- --run`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add public/icons/hq/ src/components/HqStar.tsx src/components/HqStar.test.tsx \
  $(git diff --name-only -- '*.test.tsx' '*.test.ts')
git commit -m "feat(icons): HqStar renders in-game HQ marker image

Refactors HqStar from inline ★ text to an actual HQ marker icon while
preserving its API (leading, big). All 12 existing call sites get the
new visual for free. Updated downstream tests that asserted on the ★
literal to assert on alt='High Quality' instead."
```

---

## Task 7: Wire JobIcon into RecipeModal

**Files:**
- Modify: `src/features/profit/RecipeModal.tsx` (line 60)
- Modify: `src/features/profit/RecipeModal.test.tsx`

- [ ] **Step 1: Add a failing test that asserts the carpenter icon shows next to "CRP" in the job badge**

In `src/features/profit/RecipeModal.test.tsx` add a new test case (you may need to adjust the mock `recipe` to use `classJob: 'CRP'`):

```tsx
it('renders the JobIcon alongside the classJob abbreviation', () => {
  // ... existing setup, render RecipeModal with recipe.classJob === 'CRP'
  expect(screen.getByAltText('Carpenter')).toHaveAttribute('src', '/icons/jobs/CRP.png');
  expect(screen.getByText(/CRP/)).toBeInTheDocument();
});
```

If the existing test file doesn't already render RecipeModal with a known classJob, add a render call before the assertion. Mirror existing setup patterns.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/features/profit/RecipeModal.test.tsx --run`
Expected: FAIL on the new test (no IMG rendered).

- [ ] **Step 3: Modify RecipeModal.tsx**

Around line 60, change:

```tsx
<div className="font-mono text-[10px] tracking-widest text-aether uppercase">
  {recipe.classJob} · lvl {recipe.recipeLevel}
</div>
```

to:

```tsx
<div className="font-mono text-[10px] tracking-widest text-aether uppercase flex items-center gap-1">
  {isJobKey(recipe.classJob) && <JobIcon job={recipe.classJob} decorative={false} />}
  <span>{recipe.classJob} · lvl {recipe.recipeLevel}</span>
</div>
```

Add the imports at the top:

```tsx
import { JobIcon, isJobKey } from '../../lib/icons';
```

- [ ] **Step 4: Run RecipeModal tests to verify pass**

Run: `npm test -- src/features/profit/RecipeModal.test.tsx --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/profit/RecipeModal.tsx src/features/profit/RecipeModal.test.tsx
git commit -m "feat(icons): JobIcon in RecipeModal header

Prefixes the existing 'CRP · lvl 100' badge with the matching crafter
icon. Guarded by isJobKey so unknown classJob values fall back to text
only."
```

---

## Task 8: Wire JobIcon into LevePlanner (two sites)

**Files:**
- Modify: `src/features/leves/LevePlanner.tsx` — line 12 `JOB_OPTIONS` filter dropdown and the `Job` column at line 78.
- Modify: `src/routes/LevePlan.test.tsx`

**Note:** `src/features/gathering/GatheringPlanner.tsx` and `src/routes/GatheringPlan.tsx` do not currently render job-abbreviation text (gathering plans are budget-driven, not class-keyed), so they're skipped here. Watchlist's `CraftTag` shows a colored dot keyed to the crafter — also skipped, since replacing the dot with the full job icon would change its identity. Both are out-of-scope follow-ups.

- [ ] **Step 1: Read LevePlanner.tsx to understand the two render sites**

```bash
sed -n '1,30p' src/features/leves/LevePlanner.tsx
sed -n '70,110p' src/features/leves/LevePlanner.tsx
```

- The filter dropdown at line 12 uses `JOB_OPTIONS: Array<{ value: LeveJobFilter; label: string }>` and renders the labels via `JOB_OPTIONS.map(...)` inside a `<select>` at lines ~48–55. Native `<option>` cannot contain images, so the icon goes adjacent to the `<select>` (showing the currently-selected job), not inside the options.
- The table at line 74 has a `Job` column header at line 78. The cell render (further down in the file — read until you find it) emits the abbreviation as text.

- [ ] **Step 2: Add a failing test**

```tsx
// in src/routes/LevePlan.test.tsx (or LevePlanner-specific test file if you create one)
it('renders the JobIcon next to job abbreviations in the table', () => {
  // ... existing render setup, ensure fixture has at least one leve with job CRP
  expect(screen.getByAltText('Carpenter')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/routes/LevePlan.test.tsx --run`
Expected: FAIL.

- [ ] **Step 4: Modify the Job column cell**

In the table-body render section of `LevePlanner.tsx`, find the JSX that emits the job abbreviation (e.g. `<td>{leve.classJob}</td>` or similar) and replace with:

```tsx
import { JobIcon, isJobKey } from '../../lib/icons';

// in the table cell:
<td className="px-2 py-1">
  <span className="inline-flex items-center gap-1">
    {isJobKey(leve.classJob) && <JobIcon job={leve.classJob} />}
    <span>{leve.classJob}</span>
  </span>
</td>
```

- [ ] **Step 5: Modify the filter dropdown**

Adjacent to the `<select>` at line ~48, render the icon for the currently-selected job (skip when `'all'` is selected since there's no single job to depict):

```tsx
<label className="flex items-center gap-1.5" aria-label="Job filter">
  Job
  {isJobKey(s.jobFilter) && <JobIcon job={s.jobFilter} />}
  <select ...>
    {JOB_OPTIONS.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
</label>
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npm test -- src/routes/LevePlan.test.tsx --run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/leves/LevePlanner.tsx src/routes/LevePlan.test.tsx
git commit -m "feat(icons): JobIcon in LevePlanner filter + table

Prefixes the crafter/gatherer abbreviation in each row's Job cell and
shows the currently-selected job icon next to the filter dropdown
label. Gathering/watchlist call sites are deferred (no job text to
decorate today)."
```

---

## Task 9: Wire JobIcon into CraftFromInventory + QuestItemFlipResults

**Files:**
- Modify: `src/routes/CraftFromInventory.tsx`
- Modify: `src/features/queries/QuestItemFlipResults.tsx`
- Update: any affected snapshot/render tests

- [ ] **Step 1: Locate the job-string render sites**

```bash
grep -nE "classJob|CRP|BSM|crafter" src/routes/CraftFromInventory.tsx src/features/queries/QuestItemFlipResults.tsx
```

- [ ] **Step 2: Add failing tests**

For each render site, write a test asserting the JobIcon appears next to the job abbreviation (mirror Task 7's pattern).

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/routes/CraftFromInventory.test.tsx src/features/queries/QuestItemFlipResults.test.tsx --run`
Expected: FAIL on the new assertions.

- [ ] **Step 4: Modify both files**

Apply the same `<span><JobIcon ...> abbrev</span>` decoration pattern.

For `QuestItemFlipResults.tsx`, the category cell may contain either a job (CRP, BSM, …) or a non-job category name. Use a discriminator:

```tsx
import { JobIcon, QuestTypeIcon, isJobKey, categoryNameToQuestType } from '../../lib/icons';

// inside the Category cell render:
const jobMatch = isJobKey(row.categoryName) ? row.categoryName : null;
const questType = !jobMatch ? categoryNameToQuestType(row.categoryName) : null;

return (
  <span className="inline-flex items-center gap-1">
    {jobMatch && <JobIcon job={jobMatch} />}
    {questType && <QuestTypeIcon type={questType} />}
    <span>{row.categoryName}</span>
  </span>
);
```

(Note: this also covers part of Task 12. We can ship both bits in this task since they touch the same cell.)

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- src/routes/CraftFromInventory.test.tsx src/features/queries/QuestItemFlipResults.test.tsx --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/CraftFromInventory.tsx src/features/queries/QuestItemFlipResults.tsx \
  $(git diff --name-only -- '*.test.tsx')
git commit -m "feat(icons): JobIcon + QuestTypeIcon in CraftFromInventory and QuestItemFlipResults

CraftFromInventory recipe rows now show the crafter icon next to the
job abbreviation. QuestItemFlipResults Category cell now prefixes the
category name with either the matching JobIcon (when the category is
a class) or the matching QuestTypeIcon (when it resolves to a known
quest type)."
```

---

## Task 10: Wire CurrencyIcon into /currency-flip picker

**Files:**
- Modify: `src/features/insights/CurrencyFlipView.tsx`
- Modify: `src/features/insights/CurrencyFlipView.test.tsx`

- [ ] **Step 1: Locate the picker render**

```bash
grep -n "CURRENCIES\|currencyId\|shortLabel" src/features/insights/CurrencyFlipView.tsx
```

The picker is likely a `<select>` (or button group) iterating `CURRENCIES`. Each option/button should get a `<CurrencyIcon currencyKey={c.itemId} />` prefix.

- [ ] **Step 2: Add a failing test**

```tsx
it('renders a CurrencyIcon next to each option label in the picker', () => {
  // render CurrencyFlipView
  expect(screen.getAllByAltText('Allagan Tomestone of Poetics').length).toBeGreaterThan(0);
});
```

(Note: `<select><option>` elements cannot contain `<img>`. If the picker is a native `<select>`, the icon goes next to the picker *label*, not inside the options. If it's a custom button group / dropdown, the icon goes inside the button.)

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/features/insights/CurrencyFlipView.test.tsx --run`
Expected: FAIL.

- [ ] **Step 4: Modify the picker**

For a custom button group:
```tsx
<button onClick={...}>
  <CurrencyIcon currencyKey={c.itemId} />
  <span className="ml-1">{c.shortLabel}</span>
</button>
```

For a `<select>`: render the icon adjacent to the `<select>` rather than inside it, showing the currently-selected currency's icon based on state.

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- src/features/insights/CurrencyFlipView.test.tsx --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/insights/CurrencyFlipView.tsx src/features/insights/CurrencyFlipView.test.tsx
git commit -m "feat(icons): CurrencyIcon in /currency-flip picker"
```

---

## Task 11: Wire CurrencyIcon into CurrencySourceCard

**Files:**
- Modify: `src/features/items/CurrencySourceCard.tsx`
- Modify: `src/features/items/CurrencySourceCard.test.tsx`

- [ ] **Step 1: Locate the per-offer row render**

```bash
grep -n "shortLabel\|currencyItemId" src/features/items/CurrencySourceCard.tsx
```

Each row in CurrencySourceCard has a `<Link>` wrapping the `shortLabel`. Prefix the link content with a `<CurrencyIcon>`.

- [ ] **Step 2: Add a failing test**

```tsx
it('renders a CurrencyIcon next to each offer shortLabel', () => {
  // render with at least one offer where currencyItemId === 28 (Poetics)
  expect(screen.getByAltText('Allagan Tomestone of Poetics')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/features/items/CurrencySourceCard.test.tsx --run`
Expected: FAIL.

- [ ] **Step 4: Modify the row render**

```tsx
import { CurrencyIcon } from '../../lib/icons';

// Where the row currently renders <Link to="/currency-flip?currency=...">{shortLabel}</Link>:
<Link to={`/currency-flip?currency=${offer.currencyId}`} className="inline-flex items-center gap-1">
  <CurrencyIcon currencyKey={offer.currencyItemId} />
  <span>{offer.shortLabel}</span>
</Link>
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- src/features/items/CurrencySourceCard.test.tsx --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/items/CurrencySourceCard.tsx src/features/items/CurrencySourceCard.test.tsx
git commit -m "feat(icons): CurrencyIcon in CurrencySourceCard rows"
```

---

## Task 12: Wire CurrencyIcon into ShoppingListPlan

**Files:**
- Modify: `src/features/shoppingList/ShoppingListPlan.tsx`
- Modify: `src/features/shoppingList/ShoppingListPlan.test.tsx`

**Note:** `GcSeals.tsx` is generic across the three Grand Companies (it ranks gear by seal yield without picking a GC), so there's no "active GC" to depict in the header today. The three seal icons stay in `currencyIcons.ts` for future use (e.g., if we add a GC picker to settings). Skipping that part of the spec for V1.

- [ ] **Step 1: Locate the currency info-line in ShoppingListPlan SourceCell**

```bash
grep -n "avail\|shortLabel" src/features/shoppingList/ShoppingListPlan.tsx
```

The line looks like `└─ 10 Poetics avail.` with `shortLabel` wrapped in a `<Link to="/currency-flip?currency=...">`.

- [ ] **Step 2: Add a failing test**

In `src/features/shoppingList/ShoppingListPlan.test.tsx`:

```tsx
it('renders a CurrencyIcon in the currency availability info-line', () => {
  // existing fixture has a currency-available row for Poetics (item id 28)
  expect(screen.getByAltText('Allagan Tomestone of Poetics')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/features/shoppingList/ShoppingListPlan.test.tsx --run`
Expected: FAIL.

- [ ] **Step 4: Modify ShoppingListPlan SourceCell**

```tsx
import { CurrencyIcon } from '../../lib/icons';

// Inside the └─ availability line:
<span className="inline-flex items-center gap-1">
  └─ {cost}{' '}
  <Link to={`/currency-flip?currency=${currencyId}`} className="inline-flex items-center gap-1">
    <CurrencyIcon currencyKey={currencyItemId} />
    <span>{shortLabel}</span>
  </Link>
  {' '}avail.
</span>
```

The `currencyItemId` passed to `CurrencyIcon` should be the item id from `CURRENCIES` (see `src/lib/currencies.ts`). If the info-line currently only has the `CurrencyId` string id available, look up the item id via `getCurrencyById(id).itemId`.

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- src/features/shoppingList/ShoppingListPlan.test.tsx --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/shoppingList/ShoppingListPlan.tsx src/features/shoppingList/ShoppingListPlan.test.tsx
git commit -m "feat(icons): CurrencyIcon in ShoppingListPlan currency info-line"
```

---

## Task 13: Wire QuestTypeIcon into /quest-items (if Task 9 didn't already cover it)

**Note:** Task 9 already wired both `JobIcon` and `QuestTypeIcon` into `QuestItemFlipResults.tsx`'s Category cell. This task exists in case `/quest-items` has additional category-rendering sites — e.g., a filter dropdown that lists categories with icons.

**Files:**
- Modify: `src/features/insights/QuestItemFlipView.tsx` (filter dropdown, if present)
- Modify: `src/features/insights/QuestItemFlipView.test.tsx`

- [ ] **Step 1: Check for category-rendering sites outside the row cell**

```bash
grep -n "categoryName\|category" src/features/insights/QuestItemFlipView.tsx src/routes/QuestItems.tsx
```

If the only place categories are rendered is the table cell (already covered in Task 9), **skip this task and mark it complete**.

- [ ] **Step 2: If a category dropdown exists, add a failing test**

```tsx
it('renders QuestTypeIcon next to known quest-type options in the category dropdown', () => {
  // render QuestItemFlipView with a snapshot that contains "Main Scenario Quest" as a category
  expect(screen.getByAltText('Main Scenario Quest')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/features/insights/QuestItemFlipView.test.tsx --run`

- [ ] **Step 4: Modify the dropdown render**

```tsx
import { QuestTypeIcon, categoryNameToQuestType } from '../../lib/icons';

// Inside each <option> or button:
const type = categoryNameToQuestType(cat.name);
return (
  <button key={cat.name} ...>
    {type && <QuestTypeIcon type={type} />}
    {cat.name} ({cat.count})
  </button>
);
```

(If the picker is a native `<select>`, the icon goes adjacent to the `<select>` showing the currently-selected category — same pattern as Task 10.)

- [ ] **Step 5: Run tests to verify pass**

- [ ] **Step 6: Commit**

```bash
git add src/features/insights/QuestItemFlipView.tsx src/features/insights/QuestItemFlipView.test.tsx
git commit -m "feat(icons): QuestTypeIcon in /quest-items category dropdown"
```

---

## Task 14: Full-suite smoke + visual eyeball

- [ ] **Step 1: Run the full test suite**

```bash
npm test -- --run
```

Expected: PASS, all suites green. Note the new total test count (was 780; should be ~800 after this work).

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Boot the dev server and manually check each call site**

```bash
npm run dev
```

Visit each of these and confirm the icon renders inline + the layout doesn't shift:
- `/item/:id` for a known item (HQ marker rows, VendorSourceCard, CurrencySourceCard)
- `/currency-flip` (picker)
- `/shopping-list` with a few items added (currency info-line)
- `/gc-seals` (header)
- `/leves` (job column)
- `/gathering-plan` (gatherer label)
- `/quest-items` (category cell)
- `/craft-from-inventory` (recipe row)
- Open any RecipeModal from `/item/:id` (job badge)

Flag baseline-shift or sizing issues with screenshots in the final commit message.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: success. Confirm the `public/icons/` directory is included in `dist/icons/`.

- [ ] **Step 5: Update memory**

Add a project memory entry noting the icon-library is shipped, list the components + categories, and reference this plan + spec.

```bash
# (write to memory dir manually per CLAUDE.md auto-memory rules)
```

- [ ] **Step 6: Commit any tiny polish + close out**

```bash
git add -A
git commit -m "chore(icons): post-merge polish for phase 1 icon library"
```

---

## Out of plan, future work

These are explicitly out of scope; do not implement now:

- Item-type / item-search-category icons (XIVAPI-sourced, V2).
- Pet / role / FATE / mob / map icons.
- Icon-only condensed mode for dense tables.
- A `useIconWithTooltip` hook.
- Dark/light theme variants.
