/**
 * Plugin API Client for QiqirnCompanion Dalamud plugin.
 * Provides typed wrappers for all plugin browsing and claiming endpoints.
 */

export interface ItemSearchResult {
  id: number;
  name: string;
  hasRecipe: boolean;
  rarity: number;
}

export interface ItemsPageResponse {
  items: ItemSearchResult[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RecipeSource {
  type: 'recipe';
  jobId: number;
  jobName: string;
  level: number;
  ingredients: Array<{ itemId: number; itemName: string; qty: number }>;
  outputQty: number;
}

export interface VendorSource {
  type: 'vendor';
  npcId: number;
  npcName: string;
  price: number;
}

export interface GatheringSource {
  type: 'gather';
  level: number;
  timed: boolean;
}

export interface SpecialShopSource {
  type: 'special_shop';
  currency: string;
  currencyId: number;
  cost: number;
}

export interface CompanyCraftSource {
  type: 'company_craft';
  craftName: string;
  ingredients: Array<{ itemId: number; itemName: string; qty: number }>;
}

export type ItemSource =
  | RecipeSource
  | VendorSource
  | GatheringSource
  | SpecialShopSource
  | CompanyCraftSource;

export interface ItemSourcesResponse {
  itemId: number;
  itemName: string;
  sources: ItemSource[];
}

export interface CraftTaskDetail {
  itemId: number;
  itemName: string;
  qty: number;
  source: string;
}

export interface CraftAcquisitionDetail {
  itemId: number;
  itemName: string;
  qtyNeeded: number;
  source: string;
  meta: Record<string, any>;
}

export interface CraftBreakdownResponse {
  itemId: number;
  itemName: string;
  quantity: number;
  crafts: CraftTaskDetail[];
  acquire: CraftAcquisitionDetail[];
  totalCost?: number;
}

export interface ClaimTaskRequest {
  projectId: number;
  taskId: number;
  characterName: string;
  guildId: string;
}

export interface ClaimTaskResponse {
  ok: boolean;
  task?: {
    id: number;
    status: string;
    assigneeName: string;
  };
  error?: string;
}

export class PluginApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'https://qiqirn.tools') {
    this.baseUrl = baseUrl;
  }

  /**
   * Search for items by name.
   */
  async searchItems(q: string, page: number = 1, pageSize: number = 20): Promise<ItemsPageResponse> {
    const params = new URLSearchParams({
      q,
      page: String(page),
      pageSize: String(pageSize),
    });

    const res = await fetch(`${this.baseUrl}/api/plugin/items?${params}`);
    if (!res.ok) throw new Error(`Search items failed: ${res.statusText}`);
    return res.json();
  }

  /**
   * Get all ways to obtain an item (recipes, vendors, gathering, etc).
   */
  async getItemSources(itemId: number): Promise<ItemSourcesResponse> {
    const params = new URLSearchParams({ id: String(itemId) });

    const res = await fetch(`${this.baseUrl}/api/plugin/item-sources?${params}`);
    if (!res.ok) throw new Error(`Get item sources failed: ${res.statusText}`);
    return res.json();
  }

  /**
   * Get full craft breakdown with all required materials and estimated cost.
   */
  async getCraftBreakdown(itemId: number, qty: number): Promise<CraftBreakdownResponse> {
    const params = new URLSearchParams({
      id: String(itemId),
      qty: String(qty),
    });

    const res = await fetch(`${this.baseUrl}/api/plugin/craft-breakdown?${params}`);
    if (!res.ok) throw new Error(`Get craft breakdown failed: ${res.statusText}`);
    return res.json();
  }

  /**
   * Claim a project task for your character.
   */
  async claimTask(req: ClaimTaskRequest): Promise<ClaimTaskResponse> {
    const res = await fetch(`${this.baseUrl}/api/plugin/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const error = await res.json();
      return { ok: false, error: error.error };
    }

    return res.json();
  }

  /**
   * Get what you can craft from your current inventory.
   */
  async getCraftableItems(inventory: Array<{ id: number; qty: number }>): Promise<{
    craftable: Array<{
      itemId: number;
      name: string;
      qty: number;
      minNQ: number | null;
      velocity: number;
    }>;
  }> {
    const params = new URLSearchParams({
      inv: JSON.stringify(inventory),
    });

    const res = await fetch(`${this.baseUrl}/api/plugin/craftable?${params}`);
    if (!res.ok) throw new Error(`Get craftable items failed: ${res.statusText}`);
    return res.json();
  }
}
