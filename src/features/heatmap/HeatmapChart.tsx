import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { squarify } from './squarify';
import type { HeatmapCell } from './buildHeatmapData';
import { fmtGil, garlandItemUrl, gamerEscapeItemUrl, universalisItemUrl } from '../../lib/format';
import { CopyButton } from '../../components/CopyButton';

const CHART_HEIGHT = 520;

function marginColor(margin: number): string {
  const clamped = Math.max(0, Math.min(1, (margin + 0.1) / 0.6));
  if (clamped < 0.5) {
    const t = clamped * 2;
    const r = 200;
    const g = Math.round(80 + t * 140);
    const b = Math.round(40 + t * 10);
    return `rgb(${r},${g},${b})`;
  }
  const t = (clamped - 0.5) * 2;
  const r = Math.round(200 - t * 140);
  const g = Math.round(220 - t * 30);
  const b = Math.round(50 + t * 50);
  return `rgb(${r},${g},${b})`;
}

function velocityColor(velocity: number, maxVelocity: number): string {
  const t = maxVelocity > 0 ? Math.min(1, velocity / maxVelocity) : 0;
  const r = Math.round(60 + t * 10);
  const g = Math.round(80 + t * 40);
  const b = Math.round(120 + t * 100);
  return `rgb(${r},${g},${b})`;
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

  const maxVelocity = useMemo(() => Math.max(...cells.map((c) => c.velocity), 1), [cells]);

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
      <div
        ref={containerRef}
        className="relative border border-border-base bg-bg-deep overflow-hidden"
        style={{ height: CHART_HEIGHT }}
      >
        {rects.map((r) => {
          const cell = cellById.get(r.id);
          if (!cell) return null;
          const bg = cell.craftable && cell.margin != null
            ? marginColor(cell.margin)
            : velocityColor(cell.velocity, maxVelocity);
          const showLabel = r.w > 50 && r.h > 28;
          const showPrice = r.w > 70 && r.h > 44;
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
              title={cell.name}
            >
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
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 font-mono text-xs">
              <div>
                <dt className="text-text-low">Price</dt>
                <dd className="text-text-cream">{fmtGil(selected.salePrice)}</dd>
              </div>
              <div>
                <dt className="text-text-low">Velocity</dt>
                <dd className="text-text-cream">{selected.velocity.toFixed(1)}/day</dd>
              </div>
              <div>
                <dt className="text-text-low">Daily revenue</dt>
                <dd className="text-gold">{fmtGil(Math.round(selected.salePrice * selected.velocity))}</dd>
              </div>
              {selected.margin != null && (
                <div>
                  <dt className="text-text-low">Margin</dt>
                  <dd className={selected.margin > 0.2 ? 'text-jade' : selected.margin > 0 ? 'text-text-cream' : 'text-red-400'}>
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
              className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-aether px-3 py-2 hover:border-aether transition-colors"
            >
              Item page ↗
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
