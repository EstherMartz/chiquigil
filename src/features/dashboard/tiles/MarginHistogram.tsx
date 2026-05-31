import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, LabelList, ResponsiveContainer } from 'recharts';
import { fmtGil } from '../../../lib/format';
import type { MarginBucket } from '../aggregate';

/**
 * Net-margin distribution, velocity-aware: bar height = item count, bar
 * brightness = how much gil/day flows through that band (a high-margin band of
 * items nobody buys stays dim; a band that actually moves glows). So a single
 * tall-but-dim bar reads very differently from a tall bright one.
 */
export function MarginHistogram({ buckets }: { buckets: MarginBucket[] }) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const maxGil = buckets.reduce((m, b) => Math.max(m, b.gilPerDay), 0);

  // Brightness ramp per band by its share of the busiest band's gil/day.
  const opacityFor = (gpd: number) => (maxGil > 0 ? 0.3 + 0.7 * (gpd / maxGil) : 0.6);

  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Margin distribution</div>
        <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">{total} craftables · net</div>
      </div>
      <p className="font-mono text-[10px] text-text-low mb-3">
        Bar height = item count per net-margin band. Brightness = gil/day flowing through it (dim = high margin but barely sells).
      </p>
      {total === 0 ? (
        <div className="flex items-center justify-center text-text-low text-sm italic" style={{ height: 160 }}>
          No craftable items priced yet.
        </div>
      ) : (
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
              <XAxis
                dataKey="label" stroke="#666"
                tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#8a8170' }} height={20} interval={0}
              />
              <YAxis hide domain={[0, (max: number) => Math.ceil(max * 1.15)]} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                formatter={(value, _n, p) => {
                  const gpd = (p?.payload as MarginBucket | undefined)?.gilPerDay ?? 0;
                  return [`${value} item${value === 1 ? '' : 's'} · ${fmtGil(Math.round(gpd))}/day`, 'In band'];
                }}
                labelFormatter={(label) => `${label} margin`}
                contentStyle={{ background: '#111', border: '1px solid #2a2a2a', fontSize: 11 }}
                labelStyle={{ color: '#e8e0d0' }}
                itemStyle={{ color: '#cfc7b8' }}
              />
              <Bar dataKey="count" isAnimationActive={false}>
                {buckets.map((b) => (
                  <Cell key={b.label} fill={b.fill} fillOpacity={opacityFor(b.gilPerDay)} />
                ))}
                <LabelList dataKey="count" position="top" fill="#cfc7b8" fontSize={11} fontFamily="monospace" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
