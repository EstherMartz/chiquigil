/**
 * Loading shimmer placeholder. Shares the SparklineShimmer idiom
 * (bg-card-hi tint + animate-pulse) so the whole app's loading states read
 * the same. Use for tiles/values whose data arrives after first paint, so a
 * confident-but-wrong interim number never renders (see DashboardView).
 */
export function Skeleton({ className = '', width, height }: {
  className?: string;
  width?: number | string;
  height?: number | string;
}) {
  return (
    <div
      className={`bg-bg-card-hi/50 rounded animate-pulse ${className}`}
      style={{ width, height }}
      aria-hidden
    />
  );
}
