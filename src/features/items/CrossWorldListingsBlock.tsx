import type { WorldListing } from '../../lib/universalis';
import { dcOf } from '../../lib/europeWorlds';
import { fmtGil } from '../../lib/format';
import { SectionHeader } from '../../components/SectionHeader';
import { HqStar } from '../../components/HqStar';

interface Props {
  listings: WorldListing[];
  homeWorld: string;
  homeMinNQ: number | null;
  homeMinHQ: number | null;
}

interface PreparedRow {
  world: string;
  price: number;
  hq: boolean;
  dc: 'Chaos' | 'Light' | null;
  isHome: boolean;
  diffPct: number | null;
}

function prepare(listings: WorldListing[], homeWorld: string, homeMinNQ: number | null, homeMinHQ: number | null): PreparedRow[] {
  const rows: PreparedRow[] = [];
  for (const l of listings) {
    if (!l.world) continue;
    const isHome = l.world === homeWorld;
    const home = l.hq ? homeMinHQ : homeMinNQ;
    const diffPct = isHome || home == null || home === 0
      ? null
      : Math.round(((l.price - home) / home) * 100);
    rows.push({
      world: l.world,
      price: l.price,
      hq: l.hq,
      dc: dcOf(l.world),
      isHome,
      diffPct,
    });
  }
  rows.sort((a, b) => a.price - b.price || a.world.localeCompare(b.world));
  return rows;
}

function dcClass(dc: 'Chaos' | 'Light' | null): string {
  if (dc === 'Chaos') return 'text-aether';
  if (dc === 'Light') return 'text-jade';
  return 'text-text-low';
}

function diffClass(diff: number | null): string {
  if (diff == null) return 'text-text-low';
  if (diff < 0) return 'text-jade';
  if (diff > 0) return 'text-crimson';
  return 'text-text-cream';
}

function formatDiff(diff: number | null): string {
  if (diff == null) return '—';
  return diff > 0 ? `+${diff}%` : `${diff}%`;
}

export function CrossWorldListingsBlock({ listings, homeWorld, homeMinNQ, homeMinHQ }: Props) {
  const rows = prepare(listings, homeWorld, homeMinNQ, homeMinHQ);
  if (rows.length === 0) return null;

  return (
    <section>
      <SectionHeader label="Cross-world listings" compact />
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
              <th className="text-right px-3 py-2">#</th>
              <th className="text-left px-3 py-2">DC</th>
              <th className="text-left px-3 py-2">Server</th>
              <th className="text-left px-3 py-2">HQ</th>
              <th className="text-right px-3 py-2">Price</th>
              <th className="text-right px-3 py-2">vs home</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.world}:${i}:${r.price}:${r.hq ? 'h' : 'n'}`} className="border-t border-border-base hover:bg-bg-card-hi transition-colors">
                <td className="px-3 py-2 text-right font-mono text-text-low">{i + 1}</td>
                <td className={`px-3 py-2 font-mono text-[11px] ${dcClass(r.dc)}`}>{r.dc ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className="text-text-cream">{r.world}</span>
                  {r.isHome && (
                    <span className="ml-2 font-mono text-[10px] tracking-widest uppercase text-text-low border border-border-base px-1.5 py-0.5">
                      home
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.hq ? <span aria-label="HQ" className="text-gold inline-flex items-baseline"><HqStar /></span> : null}
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmtGil(r.price)}</td>
                <td className={`px-3 py-2 text-right font-mono ${diffClass(r.diffPct)}`}>{formatDiff(r.diffPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
