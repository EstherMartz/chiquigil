export interface ParsedSale {
  name: string;
  quantity: number;
  unitPrice: number;
  world: string;
  retainer: string;
  soldAt: number; // epoch ms
}

function parseSoldAt(raw: string): number {
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  return new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss).getTime();
}

export function parseSalesCsv(text: string): ParsedSale[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const rows: ParsedSale[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const name = cols[1]?.trim() ?? '';
    if (!name) continue;
    const quantity = parseInt(cols[2] ?? '0', 10) || 0;
    const unitPrice = parseInt(cols[3] ?? '0', 10) || 0;
    const world = cols[4]?.trim() ?? '';
    const retainer = cols[5]?.trim() ?? '';
    const soldAt = parseSoldAt(cols[6] ?? '');
    if (!soldAt) continue;
    rows.push({ name, quantity, unitPrice, world, retainer, soldAt });
  }
  return rows;
}
