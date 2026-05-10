interface Props {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ points, width = 120, height = 24, className = '' }: Props) {
  if (points.length === 0) {
    return <span className={`font-mono text-xs text-text-low ${className}`}>—</span>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;
  const stepX = points.length === 1 ? 0 : width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = range === 0 ? height / 2 : height - ((p - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        points={coords}
      />
    </svg>
  );
}
