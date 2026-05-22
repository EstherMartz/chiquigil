export type CurrencyId =
  | 'poetics' | 'heliometry' | 'mnemonics'
  | 'whiteCrafter' | 'purpleCrafter'
  | 'whiteGatherer' | 'purpleGatherer'
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
  { id: 'heliometry',      label: 'Allagan Tomestone of Heliometry',   shortLabel: 'Heliometry',  itemId: 47 },
  { id: 'mnemonics',       label: 'Allagan Tomestone of Mnemonics',    shortLabel: 'Mnemonics',   itemId: 49 },
  { id: 'whiteCrafter',    label: "White Crafters' Scrip",             shortLabel: 'W-Craft',     itemId: 25199 },
  { id: 'purpleCrafter',   label: "Purple Crafters' Scrip",            shortLabel: 'P-Craft',     itemId: 33913 },
  { id: 'whiteGatherer',   label: "White Gatherers' Scrip",            shortLabel: 'W-Gather',    itemId: 25200 },
  { id: 'purpleGatherer',  label: "Purple Gatherers' Scrip",           shortLabel: 'P-Gather',    itemId: 33914 },
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
  [2, 48],  // Mathematics (retired but may still appear in shop data)
  [3, 49],  // Mnemonics
  [4, 47],  // Heliometry
]);
