import type { Ingredient } from '../../lib/recipes';

export interface InventoryEntry {
  /** XIVAPI item id; 0 if the row came from the CSV with only a name that we couldn't resolve. */
  itemId: number;
  /** Display name. From SnapshotItem if itemId resolved, else raw CSV cell. */
  name: string;
  qty: number;
  isHq: boolean;
  /** Normalized location tags from the parsed CSV; e.g. ['bag'], ['retainer'], ['bag', 'saddlebag']. */
  locations: string[];
}

export type Bucket = 'craft' | 'sellMb' | 'vendor' | 'discard';

export interface CraftOpportunity {
  outputItemId: number;
  outputName: string;
  outputUnitPrice: number;
  /** netProfit = outputUnitPrice - sum(opportunityCost of used inventory ingredients) - sum(MB price of missing ingredients). */
  netProfit: number;
  usedFromInventory: Array<{ itemId: number; name: string; amount: number }>;
  missingIngredients: Array<{ itemId: number; name: string; amount: number; mbUnitPrice: number }>;
}

export interface CleanupRow {
  entry: InventoryEntry;
  vendorRevenue: number;
  /** Per-unit MB trusted price for the row's HQ tier, times qty. 0 if no trusted tier. */
  mbRevenue: number;
  /** Listings count behind mbRevenue. Used to surface a "thin market" pill. */
  mbListingCount: number;
  bestCraft: CraftOpportunity | null;
  /** Up to 4 alternative craft opportunities ranked below bestCraft. */
  otherCrafts: CraftOpportunity[];
  bucket: Bucket;
  runnerUp: { action: Exclude<Bucket, 'discard'>; value: number } | null;
}

export interface CleanupResult {
  craft: CleanupRow[];
  sellMb: CleanupRow[];
  vendor: CleanupRow[];
  discard: CleanupRow[];
  unrecognized: InventoryEntry[];
}

/** Re-exported for craft-analyzer consumers so they don't need a second import. */
export type { Ingredient };
