import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadOpportunities, type Opportunity, type OpportunityKind } from '../../lib/opportunities';
import { useSnapshotById } from '../queries/useSnapshotById';
import { ResultTableScaffold, EmptyResults } from '../queries/ResultTableScaffold';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { FreshnessChip } from '../../components/FreshnessChip';
import { Spinner } from '../../components/Spinner';

const KIND_LABEL: Record<OpportunityKind, string> = { crash: 'crash', spike: 'spike', empty: 'empty' };
const KIND_CLASS: Record<OpportunityKind, string> = {
  crash: 'text-crimson border-crimson/40',
  spike: 'text-jade border-jade/40',
  empty: 'text-gold border-gold/40',
};

type Row = Opportunity & { name: string; id: number };
type SortKey = 'detectedAt' | 'gilPerDay' | 'changePct';
const KIND_FILTERS: Array<{ id: OpportunityKind | 'all'; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'crash', label: 'Crash' }, { id: 'spike', label: 'Spike' }, { id: 'empty', label: 'Empty' },
];

function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export function OpportunitiesView() {
  const feed = useQuery({ queryKey: ['opportunities'], queryFn: loadOpportunities });
  const byId = useSnapshotById();
  const [kind, setKind] = useState<OpportunityKind | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('detectedAt');
  const now = Date.now();

  const rows = useMemo<Row[]>(() => {
    const opps = feed.data?.opportunities ?? [];
    const named = opps.map((o) => ({ ...o, id: o.itemId, name: byId.get(o.itemId)?.name ?? `#${o.itemId}` }));
    const filtered = kind === 'all' ? named : named.filter((o) => o.kind === kind);
    const dir = sortKey === 'changePct' ? 1 : -1; // changePct asc (biggest crash first); others desc
    return [...filtered].sort((a, b) => {
      // empty rows have changePct === null — keep them last rather than treating null as 0.
      const av = a[sortKey] as number | null;
      const bv = b[sortKey] as number | null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
  }, [feed.data, byId, kind, sortKey]);

  if (feed.isLoading) return <Spinner label="Loading opportunities…" />;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-2xl text-gold tracking-wide">Opportunities</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          What just changed across your data center since the last market refresh — fresh price crashes (buy),
          spikes (sell), and shelves that just emptied (craft). Rolling 2-hour window.
        </p>
        {feed.data && feed.data.ts > 0 && (
          <div className="opacity-70 scale-90 origin-left"><FreshnessChip ts={feed.data.ts} now={now} /></div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 border border-border-base bg-bg-card">
        {KIND_FILTERS.map((k) => (
          <button key={k.id} type="button" onClick={() => setKind(k.id)}
            className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${kind === k.id ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'}`}>
            {k.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">Sort</span>
          {(['detectedAt', 'gilPerDay', 'changePct'] as SortKey[]).map((s) => (
            <button key={s} type="button" onClick={() => setSortKey(s)}
              className={`font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 border ${sortKey === s ? 'border-aether text-aether' : 'border-border-base text-text-dim hover:text-aether'}`}>
              {s === 'detectedAt' ? 'Newest' : s === 'gilPerDay' ? 'Gil/day' : 'Move %'}
            </button>
          ))}
        </div>
      </div>

      <ResultTableScaffold
        rows={rows}
        totalCandidates={feed.data?.opportunities.length ?? 0}
        skippedChunks={0}
        emptyState={<EmptyResults>No fresh opportunities right now — check back after the next refresh.</EmptyResults>}
        renderTable={(visible) => (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[10px] tracking-widest uppercase text-text-low border-b border-border-base">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Signal</th>
                <th className="px-3 py-2">World</th>
                <th className="px-3 py-2 text-right">Was → Now</th>
                <th className="px-3 py-2 text-right">Move</th>
                <th className="px-3 py-2 text-right">Gil/day</th>
                <th className="px-3 py-2 text-right">Seen</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={`${r.itemId}:${r.kind}`} className="border-b border-border-base/50 align-top">
                  <td className="px-3 py-2"><ItemNameLinks id={r.itemId} name={r.name} /></td>
                  <td className="px-3 py-2">
                    <span className={`font-mono text-[10px] tracking-widest uppercase px-1.5 py-0.5 border ${KIND_CLASS[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-text-cream">{r.world || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[11px]">
                    {r.kind === 'empty' ? `${r.oldValue} → ${r.newValue} listings` : `${r.oldValue?.toLocaleString()} → ${r.newValue?.toLocaleString()}`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[11px]">{r.changePct != null ? `${r.changePct > 0 ? '+' : ''}${r.changePct}%` : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[11px]">{r.gilPerDay ? r.gilPerDay.toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-[10px] text-text-low whitespace-nowrap">{ago(r.detectedAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      />
    </div>
  );
}
