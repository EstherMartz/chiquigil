import type { BatchItem } from '../craftBatch/types';

export interface SavedBatchItem {
  id: number;
  name: string;
  materialCost: number;
  estimatedPrice: number;
  hq: boolean;
  actualPrice: number | null;
  soldAt: string | null;
}

export interface SavedBatch {
  batchId: string;
  createdAt: string;
  budget: number;
  items: SavedBatchItem[];
  status: 'active' | 'closed';
}

export function batchItemToSaved(item: BatchItem): SavedBatchItem {
  return {
    id: item.id,
    name: item.name,
    materialCost: item.materialCost,
    estimatedPrice: item.salePrice,
    hq: item.hq,
    actualPrice: null,
    soldAt: null,
  };
}
