import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useGlamourSnapshot } from '../queries/useGlamourSnapshot';
import { resolveGlamourRanking } from './resolveGlamourRanking';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData, type MarketItem } from '../../lib/universalis';
import type { GlamourPeriod } from '../../lib/staticSnapshots';
import { CategorySelect } from '../../components/CategorySelect';
import { categoryLabel } from '../../lib/itemSearchCategories';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { EmptyState } from '../../components/EmptyState';
import { SectionHeader } from '../../components/SectionHeader';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { fmtGil } from '../../lib/format';

type SortKey = 'uses' | 'ilvl' | 'price' | 'velocity' | 'name';
interface SortState { key: SortKey; dir: 'asc' | 'desc' }

function salePrice(m: MarketItem): number {
  return m.medianNQ ?? m.medianHQ ?? m.minNQ ?? m.minHQ ?? 0;
}

function relativeAge(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

const PERIOD_LABEL: Record<GlamourPeriod, string> = { recent: 'Last month', all: 'All-time' };

export function GlamourDemandView() {
  const { world } = useSettingsStore();
  const [period, setPeriod] = useState<GlamourPeriod>('recent');
  const itemSnap = useItemSnapshot();
  const glamour = useGlamourSnapshot(period);
  const [selectedCats, setSelectedCats] = useState<number[]>([]);
  const [sort, setSort] = useState<SortState>({ key: 'uses', dir: 'desc' });

  const resolution = useMemo(() => {
    if (!itemSnap.data || !glamour.data) {
      return { rows: [], matched: 0, unmatched: 0, untradeable: 0 };
    }
    return resolveGlamourRanking(glamour.data.ranking, itemSnap.data.items);
  }, [itemSnap.data, glamour.data]);

  const resolvedIds = useMemo(() => resolution.rows.map((r) => r.id), [resolution.rows]);

  const scan = useMutation<{ saleMap: MarketData; skipped: number }>({
    mutationFn: async () => {
      if (resolvedIds.length === 0) return { saleMap: {}, skipped: 0 };
      const res = await fetchInBatches<MarketItem>(
        resolvedIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return { saleMap: res.data, skipped: res.errors.length };
    },
  });

  const ready = itemSnap.data != null && glamour.data != null && resolvedIds.length > 0;

  // Auto-scan prices whenever the resolved item set changes — on first load and
  // on every period toggle (the snapshot object identity changes per window).
  const scanMutate = scan.mutate;
  useEffect(() => {
    if (ready) scanMutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glamour.data, itemSnap.data]);

  const categories = useMemo(() => {
    const ids = [...new Set(resolution.rows.map((r) => r.sc))];
    return ids.map((id) => ({ id, name: categoryLabel(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [resolution.rows]);

  const maxUses = useMemo(
    () => resolution.rows.reduce((m, r) => Math.max(m, r.uses), 0),
    [resolution.rows],
  );

  const rows = useMemo(() => {
    const saleMap = scan.data?.saleMap ?? {};
    let list = resolution.rows.map((r) => {
      const m = saleMap[String(r.id)];
      return { ...r, price: m ? salePrice(m) : null, velocity: m ? m.velocity : null };
    });
    if (selectedCats.length > 0) list = list.filter((r) => selectedCats.includes(r.sc));
    const dir = sort.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let cmp: number;
      if (sort.key === 'name') cmp = a.name.localeCompare(b.name);
      else if (sort.key === 'price') cmp = (a.price ?? -1) - (b.price ?? -1);
      else if (sort.key === 'velocity') cmp = (a.velocity ?? -1) - (b.velocity ?? -1);
      else cmp = (a[sort.key] as number) - (b[sort.key] as number);
      return cmp * dir || a.name.localeCompare(b.name);
    });
    return list;
  }, [resolution.rows, scan.data, selectedCats, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '');
  const age = relativeAge(glamour.data?.generatedAt ?? null);

  if (glamour.data && glamour.data.ranking.length === 0) {
    return (
      <div className="max-w-[100rem] mx-auto px-4 space-y-4">
        <Header age={null} resolution={resolution} period={period} />
        <PeriodToggle period={period} onChange={setPeriod} />
        <EmptyState
          icon="✦"
          message={`No ${PERIOD_LABEL[period].toLowerCase()} glamour data yet. Run the scraper (see docs/scraping-glamours.md) and commit the snapshot, or switch window above.`}
        />
      </div>
    );
  }

  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <Header age={age} resolution={resolution} period={period} />
      <PeriodToggle period={period} onChange={setPeriod} />

      {categories.length > 0 && (
        <div className="max-w-md">
          <CategorySelect
            categories={categories}
            selected={selectedCats}
            onChange={setSelectedCats}
            placeholder="Filter by category…"
          />
        </div>
      )}

      {scan.isPending && <Spinner label={`Fetching ${world} prices for ${resolvedIds.length} items…`} />}
      {scan.data && scan.data.skipped > 0 && (
        <StatusBanner kind="error">{scan.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          <SectionHeader label={`Glamour items (${rows.length})`} />

          <div className="md:hidden border border-border-base bg-bg-card divide-y divide-border-base">
            {rows.map((row, idx) => (
              <div key={row.id} className="p-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-text-low w-6 shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <ItemNameLinks id={row.id} name={row.name} sub={categoryLabel(row.sc)} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 pl-8 font-mono text-xs">
                  <Stat label="Uses" value={String(row.uses)} tone="text-aether" />
                  <Stat label="Price" value={row.price != null ? fmtGil(row.price) : '—'} tone="text-gold" />
                  <Stat label="Vel" value={row.velocity != null ? `${row.velocity.toFixed(1)}/d` : '—'} tone="text-text-cream" />
                </div>
              </div>
            ))}
          </div>

          <table className="w-full text-xs font-mono hidden md:table">
            <thead>
              <tr className="border-b border-border-base">
                <th className="text-left px-2 py-1 text-text-low font-normal">#</th>
                <Th onClick={() => toggleSort('name')} className="text-left">Item{arrow('name')}</Th>
                <th className="text-left px-2 py-1 text-text-low font-normal">Category</th>
                <Th onClick={() => toggleSort('ilvl')} className="text-right">Lvl{arrow('ilvl')}</Th>
                <Th onClick={() => toggleSort('uses')} className="text-right">Uses{arrow('uses')}</Th>
                <Th onClick={() => toggleSort('price')} className="text-right">Price{arrow('price')}</Th>
                <Th onClick={() => toggleSort('velocity')} className="text-right">Vel/day{arrow('velocity')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border-base hover:bg-bg-card-hi/50 transition-colors">
                  <td className="px-2 py-1.5 text-text-low">{idx + 1}</td>
                  <td className="px-2 py-1.5"><ItemNameLinks id={row.id} name={row.name} /></td>
                  <td className="px-2 py-1.5 text-text-low">{categoryLabel(row.sc)}</td>
                  <td className="text-right px-2 py-1.5 tabular-nums">i{row.ilvl}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-2">
                      <span className="h-1.5 bg-aether/60" style={{ width: `${maxUses ? (row.uses / maxUses) * 48 : 0}px` }} />
                      <span className="tabular-nums text-aether w-8 text-right">{row.uses}</span>
                    </div>
                  </td>
                  <td className="text-right px-2 py-1.5 tabular-nums text-gold">{row.price != null ? fmtGil(row.price) : '—'}</td>
                  <td className="text-right px-2 py-1.5 tabular-nums">{row.velocity != null ? row.velocity.toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ready && scan.data && rows.length === 0 && (
        <StatusBanner kind="info">No items match the current filter.</StatusBanner>
      )}
    </div>
  );
}

function Header({ age, resolution, period }: { age: string | null; resolution: { matched: number; unmatched: number; untradeable: number }; period: GlamourPeriod }) {
  const windowLabel = period === 'recent' ? "the last month's" : 'all-time';
  return (
    <div>
      <h2 className="font-display text-lg text-gold tracking-wide">Glamour Demand</h2>
      <p className="font-mono text-[11px] text-text-low max-w-prose">
        Tradeable gear ranked by how often it appears in {windowLabel} most-loved Eorzea Collection glamours.
        {age ? ` Scraped ${age}.` : ''}
      </p>
      <p className="font-mono text-[10px] text-text-low mt-1">
        {resolution.matched} ranked · {resolution.unmatched} unmatched · {resolution.untradeable} untradeable hidden
      </p>
    </div>
  );
}

function PeriodToggle({ period, onChange }: { period: GlamourPeriod; onChange: (p: GlamourPeriod) => void }) {
  const opts: { value: GlamourPeriod; label: string }[] = [
    { value: 'recent', label: 'Last month' },
    { value: 'all', label: 'All-time' },
  ];
  return (
    <div className="flex gap-2">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`font-mono text-[10px] tracking-widest uppercase px-3 py-1 border transition-colors ${
            period === o.value ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Th({ children, onClick, className = '' }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <th
      onClick={onClick}
      className={`px-2 py-1 text-text-low font-normal cursor-pointer select-none hover:text-aether ${className}`}
    >
      {children}
    </th>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">{label}</div>
      <div className={`mt-0.5 tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
