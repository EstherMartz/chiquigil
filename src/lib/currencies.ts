export type CurrencyId =
  | 'poetics' | 'mathematics' | 'heliometry' | 'mnemonics'
  | 'whiteCrafter' | 'purpleCrafter' | 'orangeCrafter'
  | 'whiteGatherer' | 'purpleGatherer' | 'orangeGatherer'
  | 'mgp' | 'wolfMarks' | 'bicolor';

export interface CurrencyDef {
  id: CurrencyId;
  label: string;
  shortLabel: string;
  itemId: number;
}

// VERIFY itemIds against XIVAPI v2 Item sheet before relying on data.
// Step 4 of this task probes XIVAPI to confirm.
export const CURRENCIES: readonly CurrencyDef[] = [
  { id: 'poetics',         label: 'Allagan Tomestone of Poetics',      shortLabel: 'Poetics',     itemId: 28 },
  { id: 'mathematics',     label: 'Allagan Tomestone of Mathematics',  shortLabel: 'Mathematics', itemId: 48 },
  { id: 'heliometry',      label: 'Allagan Tomestone of Heliometry',   shortLabel: 'Heliometry',  itemId: 47 },
  { id: 'mnemonics',       label: 'Allagan Tomestone of Mnemonics',    shortLabel: 'Mnemonics',   itemId: 49 },
  { id: 'whiteCrafter',    label: "White Crafters' Scrip",             shortLabel: 'W-Craft',     itemId: 25199 },
  { id: 'purpleCrafter',   label: "Purple Crafters' Scrip",            shortLabel: 'P-Craft',     itemId: 33913 },
  { id: 'orangeCrafter',   label: "Orange Crafters' Scrip",            shortLabel: 'O-Craft',     itemId: 41784 },
  { id: 'whiteGatherer',   label: "White Gatherers' Scrip",            shortLabel: 'W-Gather',    itemId: 25200 },
  { id: 'purpleGatherer',  label: "Purple Gatherers' Scrip",           shortLabel: 'P-Gather',    itemId: 33914 },
  { id: 'orangeGatherer',  label: "Orange Gatherers' Scrip",           shortLabel: 'O-Gather',    itemId: 41785 },
  { id: 'mgp',             label: 'MGP',                               shortLabel: 'MGP',         itemId: 29 },
  { id: 'wolfMarks',       label: 'Wolf Marks',                        shortLabel: 'Wolf',        itemId: 25 },
  { id: 'bicolor',         label: 'Bicolor Gemstone',                  shortLabel: 'Bicolor',     itemId: 26807 },
];

export function getCurrencyById(id: CurrencyId): CurrencyDef | undefined {
  return CURRENCIES.find((c) => c.id === id);
}

export const currencyByItemId: Map<number, CurrencyId> = new Map(
  CURRENCIES.map((c) => [c.itemId, c.id]),
);

/**
 * XIVAPI SpecialShop.UseCurrencyType = 4 encodes the cost as a tomestone
 * *type index* (from the TomestonesItem sheet) rather than an Item row ID.
 * This map resolves that index to the real Item ID so currencyByItemId can
 * match it.  Source: XIVAPI TomestonesItem sheet rows with Tomestones > 0.
 */
export const TOMESTONE_TYPE_TO_ITEM_ID: ReadonlyMap<number, number> = new Map([
  [1, 28],  // Poetics
  [2, 48],  // Mathematics
  [3, 49],  // Mnemonics
  [4, 47],  // Heliometry
]);

/**
 * XIVAPI SpecialShop.UseCurrencyType = 16 encodes scrip costs as a type
 * index rather than the scrip Item row ID.  Only applies when the raw
 * ItemCost value is small (≤ 10); larger values in UCT-16 shops are
 * direct item references (e.g. raid tokens) handled by the normal path.
 * Confirmed: type 4 → Purple Gatherers' (Chiaroglow Aethersand).
 * Orange scrips (Dawntrail 7.1+) are provisionally mapped at indices 5-6;
 * they may not have shops in XIVAPI yet.
 */
export const SCRIP_TYPE_TO_ITEM_ID: ReadonlyMap<number, number> = new Map([
  [1, 25199],  // White Crafters' Scrip
  [2, 25200],  // White Gatherers' Scrip
  [3, 33913],  // Purple Crafters' Scrip
  [4, 33914],  // Purple Gatherers' Scrip
  [5, 41784],  // Orange Crafters' Scrip
  [6, 41785],  // Orange Gatherers' Scrip
]);
