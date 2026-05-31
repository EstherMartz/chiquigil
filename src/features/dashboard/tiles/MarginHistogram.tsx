import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { MarginBucket } from '../aggregate';

/** How many of your craftable targets sit in each net-margin band. */
export function MarginHistogram({ buckets }: { buckets: MarginBucket[] }) {
  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Margin distribution</div>
        <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">{total} craftables · net</div>
      </div>
      {total === 0 ? (
        <div className="flex items-center justify-center text-text-low text-sm italic" style={{ height: 160 }}>
          No craftable items priced yet.
        </div>
      ) : (
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <XAxis
                dataKey="label" stroke="#666"
                tick={{ fontSize: 9, fontFamily: 'monospace' }} height={20}
              />
              <YAxis hide domain={[0, 'dataMax']} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                formatter={(value) => [`${value} item${value === 1 ? '' : 's'}`, 'Count']}
                contentStyle={{ background: '#111', border: '1px solid #2a2a2a', fontSize: 11 }}
              />
              <Bar dataKey="count" isAnimationActive={false}>
                {buckets.map((b) => (
                  <Cell key={b.label} fill={b.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
