export interface ShopEntry {
  itemId: number;
  receiveQty: number;
  costPerUnit: number;
  isHq: boolean;
}

export interface SpecialShopSnapshot {
  byCurrency: Map<string, ShopEntry[]>;
}
