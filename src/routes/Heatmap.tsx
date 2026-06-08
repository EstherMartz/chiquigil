import { HeatmapView } from '../features/heatmap/HeatmapView';

export default function Heatmap() {
  // Title + description live in HeatmapView's header (alongside the freshness
  // stamp and refresh control), so the route only provides the layout shell —
  // a route-level heading here would duplicate the "Market Heatmap" title.
  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <HeatmapView />
    </div>
  );
}
