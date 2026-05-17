import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { fetchHistoryWithin, type HistoryEntry } from '../../lib/universalisHistory';
import { SectionHeader } from '../../components/SectionHeader';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { fmtGil } from '../../lib/format';

const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;

interface Props {
  itemId: number;
  scope: string;   // world or DC name
  canHq: boolean;  // hide HQ line for items that can't be HQ
}

export function SaleHistoryBlock({ itemId, scope, canHq }: Props) {
  const q = useQuery({
    queryKey: ['item-history', scope, itemId, 30],
    enabled: Number.isFinite(itemId) && itemId > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const map = await fetchHistoryWithin(scope, [itemId], THIRTY_DAYS_SEC);
      return map.get(itemId) ?? [];
    },
  });

  return (
    <section>
      <SectionHeader label="Sale History" compact />
      {q.isLoading && <Spinner label="Loading 30-day sale history..." />}
      {q.isError && <StatusBanner kind="error">Universalis history fetch failed: {(q.error as Error).message}</StatusBanner>}
      {q.data && q.data.length === 0 && (
        <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
          No sales in the last 30 days.
        </div>
      )}
      {q.data && q.data.length > 0 && <HistoryContent entries={q.data} canHq={canHq} />}
    </section>
  );
}

function HistoryContent({ entries, canHq }: { entries: HistoryEntry[]; canHq: boolean }) {
  // Build chart data: one point per sale. X = timestamp (ms), Y = price.
  // Recharts handles missing values per-series, so use { ts, nq, hq } with one of nq/hq populated.
  const chartData = [...entries]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((e) => ({
      ts: e.timestamp * 1000,
      nq: e.hq ? null : e.pricePerUnit,
      hq: e.hq ? e.pricePerUnit : null,
    }));

  // Summary stats (across all entries).
  const prices = entries.map((e) => e.pricePerUnit).sort((a, b) => a - b);
  const total = entries.length;
  const min = prices[0];
  const max = prices[prices.length - 1];
  const mean = Math.round(prices.reduce((s, p) => s + p, 0) / total);
  const median = prices.length % 2 === 0
    ? Math.round((prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2)
    : prices[(prices.length - 1) / 2];
  const earliest = Math.min(...entries.map((e) => e.timestamp)) * 1000;
  const daysSpanned = Math.max(1, (Date.now() - earliest) / 86_400_000);
  const avgPerDay = total / daysSpanned;

  // Last 20 sales (most recent first).
  const last20 = [...entries].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);

  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

  return (
    <div className="space-y-4">
      <div className="border border-border-base bg-bg-card p-4">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="#2a2a2a" strokeDasharray="3 3" />
            <XAxis
              dataKey="ts"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={fmtDate}
              stroke="#888"
              tick={{ fontSize: 10, fontFamily: 'monospace' }}
            />
            <YAxis
              tickFormatter={(v) => fmtGil(v)}
              stroke="#888"
              tick={{ fontSize: 10, fontFamily: 'monospace' }}
              width={70}
            />
            <Tooltip
              labelFormatter={(ts) => new Date(ts as number).toLocaleString('en-GB')}
              formatter={(value) => (value != null ? fmtGil(value as number) : null)}
              contentStyle={{ background: '#111', border: '1px solid #2a2a2a', fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }} />
            <Line type="monotone" dataKey="nq" name="NQ" stroke="#7fb3d5" strokeWidth={1.5} dot={false} connectNulls />
            {canHq && <Line type="monotone" dataKey="hq" name="HQ" stroke="#e8c547" strokeWidth={1.5} dot={false} connectNulls />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
        <Stat label="Median" value={fmtGil(median)} />
        <Stat label="Mean" value={fmtGil(mean)} />
        <Stat label="Min" value={fmtGil(min)} />
        <Stat label="Max" value={fmtGil(max)} />
        <Stat label="Sales" value={total.toLocaleString()} />
        <Stat label="Per day" value={avgPerDay.toFixed(1)} />
      </div>

      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">When</th>
              <th className="text-right px-3 py-2">Qty</th>
              <th className="text-right px-3 py-2">Price/unit</th>
              <th className="text-left px-3 py-2">Quality</th>
            </tr>
          </thead>
          <tbody>
            {last20.map((e, i) => (
              <tr key={i} className="border-t border-border-base">
                <td className="px-3 py-2 font-mono text-text-low">{new Date(e.timestamp * 1000).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="px-3 py-2 font-mono text-right">{e.quantity}</td>
                <td className="px-3 py-2 font-mono text-right">{fmtGil(e.pricePerUnit)}</td>
                <td className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest">
                  {e.hq ? <span className="text-gold">HQ</span> : <span className="text-text-low">NQ</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border-base bg-bg-card p-2">
      <div className="font-mono text-[9px] tracking-widest text-text-low uppercase mb-1">{label}</div>
      <div className="font-display text-base">{value}</div>
    </div>
  );
}
