# Refreshing the Glamour Demand data

The Glamour Demand page reads `public/data/snapshots/glamours.json`, produced by
a standalone Python scraper of Eorzea Collection's most-loved glamours.

## Monthly refresh

1. Run the scraper (Python 3.11+, `pip install httpx beautifulsoup4`):
   - Set its `OUTPUT_FILE` to `public/data/snapshots/glamours.json` (or copy the
     output there afterward).
   - Default config scrapes 10 pages (~360 glamours) with a 1s polite delay.
2. Commit the refreshed `glamours.json`.
3. Deploy. The page resolves item names → IDs at runtime against the current item
   snapshot and drops untradeable/unmatched names automatically.

## Output format

```json
{ "generated_at": "ISO-8601-UTC", "ranking": [ { "item": "Name", "uses": 87 } ] }
```

`generated_at` drives the "Scraped X ago" freshness line; `ranking` is the
appearance-count ranking (one increment per glamour an item appears in). Other
fields the scraper writes (`pages_scraped`, `glamours_checked`, `unique_items`)
are informational and ignored by the app.

## How the app uses it

- `loadStaticGlamourRanking()` (`src/lib/staticSnapshots.ts`) fetches the file.
- `resolveGlamourRanking()` (`src/features/glamour/resolveGlamourRanking.ts`)
  joins scraped names to the item snapshot: it normalizes names (strips the HQ
  glyph, case, whitespace), drops untradeable items (`sc === 0`) and names with
  no item match, and counts both for the page's transparency footnote.
- The page then fetches marketboard price + velocity for the matched items.

If many names show as "unmatched" after a refresh, the item snapshot is likely
older than the gear referenced (e.g. a brand-new patch) — re-bake snapshots with
`npm run snapshots`.
