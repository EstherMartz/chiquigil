# Planner Sales Import Design

**Date:** 2026-05-24
**Status:** Approved

## Problem

The planner tracks crafting plans and treasury manually. The user exports sales
history CSVs from the FFXIV companion app / third-party tools and wants to
import them into the planner to see what actually sold, auto-attribute sales to
plan items, and get suggestions for items worth adding to the plan.

## Solution Overview

Add CSV upload to the Crafting Plan page. Parse the CSV, deduplicate against
previously imported rows, auto-match sales to existing plan items by name, and
surface unmatched sales as suggestions. Redesign the page layout to show sales
insights alongside the existing plan lanes.

## CSV Format

```
Icon,Name,Quantity,Unit Price,World,Retainer,Sold At
,Open Book,1,89989,Phantom,El'jonah,24/05/2026 19:38:26
```

- `Icon` column is always empty (ignored)
- `Sold At` format: `DD/MM/YYYY HH:mm:ss`
- All fields are strings; Quantity and Unit Price need numeric parsing

## Duplicate Detection

Composite key: `name.toLowerCase()|quantity|unitPrice|soldAtTimestamp`

Checked against:
1. `importedSaleKeys` set in persisted store (cross-session dedup)
2. Same-batch rows (intra-file dedup)

Exact duplicates in the CSV (same name, qty, price, timestamp) are imported
once; the second is skipped.

## Auto-Matching

Compare CSV `Name` (case-insensitive, trimmed) against all plan item names
across all four lanes. On match:
- Increment item `unitsSold` by `Quantity`
- Increment item `earned` by `Quantity * Unit Price`
- Create log entry with `itemId` attribution

On no match:
- Create log entry without `itemId`, tagged `source: 'csv-import'`
- Sale appears in "Unplanned Sales" suggestions

## Store Changes (`plannerStore.ts`)

### New State Fields
- `importedSaleKeys: string[]` — persisted array of dedup keys (serializable)

### New Mutations
- `importCsv(rows: ParsedSale[])` — batch mutation:
  1. Filter out rows whose key exists in `importedSaleKeys`
  2. For each remaining row, try name-match against plan items
  3. If matched: call internal recordSale logic for that item
  4. If unmatched: add log entry with `source: 'csv-import'`, no itemId
  5. Append all new keys to `importedSaleKeys`
  6. Return `{ imported: number, matched: number, skipped: number }`

### Log Entry Extension
Add optional fields to `LogEntry`:
- `retainer?: string`
- `source?: 'manual' | 'csv-import'`
- `csvName?: string` — original item name from CSV (for unmatched display)

## Page Layout (top to bottom)

### 1. Hero + Import (HeroBlock area)
- Existing treasury stats, progress bar, log-gil form
- New "Import Sales CSV" button next to log form
- After import: inline summary "Imported X sales (Y matched, Z new, W skipped)"

### 2. Sales Insights (new section)
Two sub-panels:

**Recent Sales** — table of all CSV-imported log entries, most recent first:
- Columns: Name, Qty, Total Gil, Retainer, Date, Status (Planned/Unplanned badge)
- Matches existing table patterns (SortableHeader, etc.)

**Suggestions** — aggregated unmatched items:
- Group by name, sum quantity and total gil
- Show: "You sold Xqty of [Name] for [total] gil"
- Quick-add button pre-fills AddItemModal with name and computed price

### 3. The Plan (existing lanes)
- Four lane cards unchanged
- PlanItemRow shows existing data (units, earned) which now includes CSV-sourced sales

### 4. Daily Rhythm (existing)
- Unchanged

## New Files

| File | Purpose |
|------|---------|
| `src/features/planner/parseSalesCsv.ts` | Parse CSV text, validate rows, generate dedup keys. Pure functions. |
| `src/features/planner/SalesImport.tsx` | Upload button, file reader, calls store.importCsv, shows result toast |
| `src/features/planner/SalesInsights.tsx` | Recent sales table + suggestions panel |

## Modified Files

| File | Changes |
|------|---------|
| `plannerStore.ts` | Add `importedSaleKeys`, `importCsv` mutation, extend `LogEntry` type |
| `PlannerView.tsx` | Add SalesInsights section between Hero and lanes |
| `HeroBlock.tsx` | Add SalesImport trigger button |
| `seedPlanner.ts` | Extend `LogEntry` type with optional fields |

## Styling

- Import button: `bg-panel-alt border border-border` with upload icon
- Sales table: matches existing `ResultTableScaffold` patterns
- Planned badge: `text-jade bg-jade/10 border border-jade/20`
- Unplanned badge: `text-aether bg-aether/10 border border-aether/20`
- Suggestion cards: `bg-panel-alt border border-border` with gold "Add to plan" button

## Out of Scope

- Automatic CSV file watching / polling
- Editing imported sales after import
- Export of sales data
- Price history charts from sales data
- Multi-world filtering
