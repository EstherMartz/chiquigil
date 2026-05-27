import { HeatmapView } from '../features/heatmap/HeatmapView';

export default function Heatmap() {
  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Market Heatmap</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Treemap of market activity. Size = sales velocity, color = profit margin (craftable) or velocity (non-craftable).
        </p>
      </div>
      <HeatmapView />
    </div>
  );
}
