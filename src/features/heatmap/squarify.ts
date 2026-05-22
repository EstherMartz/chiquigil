export interface SquarifyInput {
  id: number;
  area: number;
}

export interface SquarifyRect {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function squarify(
  items: SquarifyInput[],
  width: number,
  height: number,
): SquarifyRect[] {
  const valid = items.filter((i) => i.area > 0);
  if (valid.length === 0) return [];

  const totalArea = valid.reduce((s, i) => s + i.area, 0);
  const containerArea = width * height;
  const sorted = valid
    .map((i) => ({ id: i.id, area: (i.area / totalArea) * containerArea }))
    .sort((a, b) => b.area - a.area);

  const rects: SquarifyRect[] = [];
  layoutStrip(sorted, 0, 0, width, height, rects);
  return rects;
}

function layoutStrip(
  items: { id: number; area: number }[],
  x: number,
  y: number,
  w: number,
  h: number,
  out: SquarifyRect[],
): void {
  if (items.length === 0) return;
  if (items.length === 1) {
    out.push({ id: items[0].id, x, y, w, h });
    return;
  }

  const totalArea = items.reduce((s, i) => s + i.area, 0);
  const horizontal = w >= h;

  let rowArea = 0;
  let bestWorst = Infinity;
  let split = 1;

  for (let i = 0; i < items.length; i++) {
    rowArea += items[i].area;
    const worst = worstAspect(items.slice(0, i + 1), rowArea, horizontal ? h : w, totalArea, horizontal ? w : h);
    if (worst <= bestWorst) {
      bestWorst = worst;
      split = i + 1;
    } else {
      break;
    }
  }

  const rowItems = items.slice(0, split);
  const restItems = items.slice(split);
  const rowTotal = rowItems.reduce((s, i) => s + i.area, 0);

  if (horizontal) {
    const rowW = (rowTotal / totalArea) * w;
    let cy = y;
    for (const item of rowItems) {
      const cellH = (item.area / rowTotal) * h;
      out.push({ id: item.id, x, y: cy, w: rowW, h: cellH });
      cy += cellH;
    }
    layoutStrip(restItems, x + rowW, y, w - rowW, h, out);
  } else {
    const rowH = (rowTotal / totalArea) * h;
    let cx = x;
    for (const item of rowItems) {
      const cellW = (item.area / rowTotal) * w;
      out.push({ id: item.id, x: cx, y, w: cellW, h: rowH });
      cx += cellW;
    }
    layoutStrip(restItems, x, y + rowH, w, h - rowH, out);
  }
}

function worstAspect(
  row: { area: number }[],
  rowArea: number,
  side: number,
  totalArea: number,
  fullSide: number,
): number {
  const stripLen = (rowArea / totalArea) * fullSide;
  if (stripLen === 0) return Infinity;
  let worst = 0;
  for (const item of row) {
    const cellSide = (item.area / rowArea) * side;
    const aspect = cellSide > stripLen ? cellSide / stripLen : stripLen / cellSide;
    if (aspect > worst) worst = aspect;
  }
  return worst;
}
