export interface ComputePlanRow {
  id: number;
  name: string;
  unitPrice: number;
  gilFlow: number;
}

export interface ComputePlanOptions {
  mode: 'time' | 'gil';
  itemCount: number;
  budgetTimeMin: number;
  budgetGil: number;
  itemsPerMin: number;
}

export interface PlanRow {
  id: number;
  name: string;
  unitPrice: number;
  gilFlow: number;
  qty: number;
  subtotal: number;
}

export interface PlanResult {
  rows: PlanRow[];
  cappedAt: number;
  skippedZeroPriceIds: number[];
  totalGil: number;
  totalMinutes: number;
}

const GBR_MIN_QTY = 1;
const GBR_MAX_QTY = 999_999;

const clampQty = (n: number) => Math.max(GBR_MIN_QTY, Math.min(GBR_MAX_QTY, Math.round(n)));

export function computePlan(rows: ComputePlanRow[], opts: ComputePlanOptions): PlanResult {
  const skippedZeroPriceIds: number[] = [];
  const valid: ComputePlanRow[] = [];
  for (const r of rows.slice(0, opts.itemCount)) {
    if (r.unitPrice <= 0) {
      skippedZeroPriceIds.push(r.id);
      continue;
    }
    valid.push(r);
  }

  const sumGilFlow = valid.reduce((acc, r) => acc + r.gilFlow, 0);
  if (valid.length === 0 || sumGilFlow <= 0) {
    return {
      rows: [],
      cappedAt: Math.min(opts.itemCount, rows.length),
      skippedZeroPriceIds,
      totalGil: 0,
      totalMinutes: 0,
    };
  }

  const planRows: PlanRow[] = valid.map((r) => {
    const share = r.gilFlow / sumGilFlow;
    let qty: number;
    if (opts.mode === 'time') {
      const totalItems = opts.budgetTimeMin * opts.itemsPerMin;
      qty = clampQty(totalItems * share);
    } else {
      qty = clampQty((opts.budgetGil * share) / r.unitPrice);
    }
    return {
      id: r.id,
      name: r.name,
      unitPrice: r.unitPrice,
      gilFlow: r.gilFlow,
      qty,
      subtotal: qty * r.unitPrice,
    };
  });

  const totalQty = planRows.reduce((acc, r) => acc + r.qty, 0);
  const totalGil = planRows.reduce((acc, r) => acc + r.subtotal, 0);
  const totalMinutes = opts.itemsPerMin > 0 ? Math.ceil(totalQty / opts.itemsPerMin) : 0;

  return {
    rows: planRows,
    cappedAt: Math.min(opts.itemCount, rows.length),
    skippedZeroPriceIds,
    totalGil,
    totalMinutes,
  };
}
