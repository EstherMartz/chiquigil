import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { EmptyState } from '../../components/EmptyState';
import { useLevePlanStore } from './levePlanStore';
import type { LeveRow } from './computeLevePlan';
import type { LeveJobFilter } from './levePlanStore';
import { JobIcon, isJobKey } from '../../lib/icons';

interface Props {
  rows: LeveRow[];
}

const JOB_OPTIONS: Array<{ value: LeveJobFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'doh', label: 'All DoH' },
  { value: 'CRP', label: 'Carpenter' },
  { value: 'BSM', label: 'Blacksmith' },
  { value: 'ARM', label: 'Armorer' },
  { value: 'GSM', label: 'Goldsmith' },
  { value: 'LTW', label: 'Leatherworker' },
  { value: 'WVR', label: 'Weaver' },
  { value: 'ALC', label: 'Alchemist' },
  { value: 'CUL', label: 'Culinarian' },
  { value: 'dol', label: 'All DoL' },
  { value: 'MIN', label: 'Miner' },
  { value: 'BTN', label: 'Botanist' },
  { value: 'FSH', label: 'Fisher' },
  { value: 'GC', label: 'Grand Company' },
];

export function LevePlanner({ rows }: Props) {
  const s = useLevePlanStore();

  return (
    <section className="border border-border-base bg-bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
        <label className="flex items-center gap-1.5" aria-label="Gil mode">
          <input type="radio" checked={s.mode === 'gil'} onChange={() => s.setMode('gil')} />
          Gil
        </label>
        <label className="flex items-center gap-1.5" aria-label="Exp mode">
          <input type="radio" checked={s.mode === 'exp'} onChange={() => s.setMode('exp')} />
          Exp
        </label>

        <label className="flex items-center gap-1.5" aria-label="Job filter">
          Job
          {isJobKey(s.jobFilter) && <JobIcon job={s.jobFilter} />}
          <select
            value={s.jobFilter}
            onChange={(e) => s.setJobFilter(e.target.value as LeveJobFilter)}
            className="bg-bg-card-hi border border-border-base px-1.5 py-0.5"
          >
            {JOB_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5" aria-label="Max level">
          Lvl ≤
          <input
            type="number" min={1} max={100} value={s.maxLevel}
            onChange={(e) => s.setMaxLevel(Number(e.target.value))}
            className="w-14 bg-bg-card-hi border border-border-base px-1.5 py-0.5"
          />
        </label>
      </div>

      <p className="font-mono text-[10px] text-text-low max-w-prose">
        DoH gil assumes 100% HQ submission. DoL collectability bonuses (+50% to +150%) not modeled.
        EXP shown is the raw base — over-level penalties are not applied.
      </p>

      {rows.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-2 py-1">Name</th>
              <th className="text-left px-2 py-1">Job</th>
              <th className="text-right px-2 py-1">Lvl</th>
              <th className="text-left px-2 py-1">City</th>
              <th className="text-right px-2 py-1">Gross</th>
              <th className="text-right px-2 py-1">Mat Cost</th>
              <th className="text-right px-2 py-1">Net Gil</th>
              <th className="text-right px-2 py-1">EXP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                <td className="px-2 py-1.5">
                  {r.targetItemId != null
                    ? <ItemNameLinks id={r.targetItemId} name={r.targetItemQty != null ? `${r.name} ×${r.targetItemQty}` : r.name} />
                    : <span>{r.name}</span>}
                </td>
                <td className="px-2 py-1.5 font-mono text-text-low">
                  <span className="inline-flex items-center gap-1">
                    {isJobKey(r.classJobCode) && <JobIcon job={r.classJobCode} />}
                    <span>{r.classJobCode}</span>
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{r.level}</td>
                <td className="px-2 py-1.5 font-mono text-text-low">{r.city}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtGil(r.grossGil)}</td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {r.type !== 'doh' ? '—' : !r.hasMatCostData ? '?' : fmtGil(r.matCost ?? 0)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-gold-hi">
                  {!r.hasMatCostData ? '—' : fmtGil(r.netGil)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{r.exp.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState icon="❖" message="Click Run Query to populate this plan." />
      )}
    </section>
  );
}
