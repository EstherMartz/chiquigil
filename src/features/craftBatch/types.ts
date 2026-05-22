export interface BatchConfig {
  budget: number;
  batchSize: number;
}

export interface BatchItem {
  id: number;
  name: string;
  sc: number;
  materialCost: number;
  salePrice: number;
  profit: number;
  velocity: number;
  gilPerDay: number;
  hq: boolean;
  score: number;
}

export interface BatchResult {
  items: BatchItem[];
  totalCost: number;
  expectedRevenue: number;
  expectedProfit: number;
  roi: number;
  budgetRemaining: number;
  categoryBreakdown: Record<number, number>;
}
