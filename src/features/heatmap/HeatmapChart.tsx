import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { squarify } from './squarify';
import type { HeatmapCell, CellKind, CellTier } from './buildHeatmapData';
import { fmtGil, garlandItemUrl, gamerEscapeItemUrl, universalisItemUrl } from '../../lib/format';
import { CopyButton } from '../../components/CopyButton';

const CHART_HEIGHT = 520;

// Base hex color per play kind — matches the design tokens (gold/jade/aether/crimson).
const KIND_BASE: Record<CellKind, string> = {
  craft:  '#d4a857',
  vendor: '#7ab06f',
  gather: '#c2683a',
  flip:   '#7a8cc2',
};

// Brightness alpha (00..ff hex) per tier — S is brightest, D is faintest.
const TIER_ALPHA: Record<CellTier, string> = {
  S: 'cc',
  A: '99',
  B: '66',
  C: '40',
  D: '20',
};

const KIND_LABEL: Record<CellKind, string> = {
  craft:  'Craft-flip',
  vendor: 'Vendor flip',
  gather: 'Gathering',
  flip:   'Cross-world / currency',
};

function tileColor(kind: CellKind, tier: CellTier): string {
  return KIND_BASE[kind] + TIER_ALPHA[tier];
}

export function HeatmapChart({ cells }: { cells: HeatmapCell[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rects = useMemo(
    () => squarify(cells.map((c) => ({ id: c.id, area: c.area })), containerWidth, CHART_HEIGHT),
    [cells, containerWidth],
  );

  const cellById = useMemo(() => {
    const m = new Map<number, HeatmapCell>();
    for (const c of cells) m.set(c.id, c);
    return m;
  }, [cells]);

  const selected = selectedId != null ? cellById.get(selectedId) ?? null : null;

  return (
    <div className="space-y-3">
      {/* Legend: hue = kind */}
      <div className="flex items-center gap-4 flex-wrap font-mono text-[10px] text-text-low">
        <span className="tracking-widest uppercase">Color:</span>
        {(['craft', 'vendor', 'gather', 'flip'] as CellKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-text-dim">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: KIND_BASE[k] }} />
            {KIND_LABEL[k]}
          </span>
        ))}
        <span className="flex-1" />
        <span className="tracking-widest uppercase">Size = velocity · Brightness = margin tier</span>
      </div>

      <div
        ref={containerRef}
        className="relative border border-border-base bg-bg-deep overflow-hidden"
        style={{ height: CHART_HEIGHT }}
      >
        {rects.map((r) => {
          const cell = cellById.get(r.id);
          if (!cell) return null;
          const bg = tileColor(cell.kind, cell.tier);
          const showLabel = r.w > 50 && r.h > 28;
          const showPrice = r.w > 70 && r.h > 44;
          // Tiny tiles still get a label (smaller, single line) so the
          // bottom-right of the map isn't a field of blank squares.
          const showTinyLabel = !showLabel && r.w > 26 && r.h > 13;
          const isSelected = r.id === selectedId;
          return (
            <div
              key={r.id}
              className={`absolute cursor-pointer overflow-hidden flex flex-col justify-center px-1.5 transition-[filter,outline] ${isSelected ? 'outline outline-2 outline-gold brightness-125 z-10' : 'border border-bg-deep/40 hover:brightness-125'}`}
              style={{
                left: r.x,
                top: r.y,
                width: r.w,
                height: r.h,
                backgroundColor: bg,
              }}
              onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
              title={`${cell.name} · ${KIND_LABEL[cell.kind]}\n${cell.velocity.toFixed(1)}/day · ${fmtGil(Math.round(cell.salePrice * cell.velocity))} gil/day${cell.margin != null ? ` · ${(cell.margin * 100).toFixed(0)}% margin` : ''}`}
            >
              {showTinyLabel && (
                <span className="text-[7px] font-mono leading-none text-white/80 truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                  {cell.name}
                </span>
              )}
              {showLabel && (
                <span className="text-[10px] font-mono leading-tight text-white/90 truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                  {cell.name}
                </span>
              )}
              {showPrice && (
                <span className="text-[9px] font-mono text-white/60 truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                  {fmtGil(cell.salePrice)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="border border-gold bg-bg-card p-4 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-display text-lg text-text-cream">{selected.name}</span>
              <CopyButton text={selected.name} />
              <span className="font-mono text-[10px] tracking-widest uppercase border px-2 py-0.5 rounded-sm"
                    style={{ color: KIND_BASE[selected.kind], borderColor: KIND_BASE[selected.kind] + '66' }}>
                {KIND_LABEL[selected.kind]}
              </span>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 font-mono text-xs">
              <div>
                <dt className="text-text-low">Price</dt>
                <dd className="text-text-cream tabular-nums">{fmtGil(selected.salePrice)}</dd>
              </div>
              <div>
                <dt className="text-text-low">Velocity</dt>
                <dd className="text-text-cream tabular-nums">{selected.velocity.toFixed(1)}/day</dd>
              </div>
              <div>
                <dt className="text-text-low">Gil/day</dt>
                <dd className="text-gold tabular-nums">{fmtGil(Math.round(selected.salePrice * selected.velocity))}</dd>
              </div>
              {selected.margin != null && (
                <div>
                  <dt className="text-text-low">Margin</dt>
                  <dd className={`tabular-nums ${selected.margin > 0.2 ? 'text-jade' : selected.margin > 0 ? 'text-text-cream' : 'text-crimson'}`}>
                    {(selected.margin * 100).toFixed(0)}%
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              to={`/item/${selected.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-3 py-2 hover:opacity-90 transition-opacity"
            >
              Open item page →
            </Link>
            <a
              href={gamerEscapeItemUrl(selected.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-aether px-3 py-2 hover:border-aether transition-colors"
              title="Gamer Escape wiki"
            >
              GE ↗
            </a>
            <a
              href={universalisItemUrl(selected.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-aether px-3 py-2 hover:border-aether transition-colors"
              title="Universalis (market data)"
            >
              UV ↗
            </a>
            <a
              href={garlandItemUrl(selected.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-aether px-3 py-2 hover:border-aether transition-colors"
            >
              Garland ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export { KIND_BASE, KIND_LABEL };
