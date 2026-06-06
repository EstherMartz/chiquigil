export interface CraftListItem {
  itemId: number;
  itemName: string;
  qty: number;
  isHq: boolean;
}

export interface CraftListSummary {
  id: string;
  name: string;
  itemCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CraftListDetail {
  id: string;
  ownerId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  items: CraftListItem[];
}
