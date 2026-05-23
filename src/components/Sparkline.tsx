interface Props {
  points: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function Sparkline({ points, width = 80, height = 28, color, className = '' }: Props) {
  const nonNull = points.map((p, i) => p !== null ? { value: p, index: i } : null).filter(Boolean) as { value: number; index: number }[];

  if (nonNull.length < 2) {
    return <span className={`font-mono text-xs text-text-low ${className}`}>—</span>;
  }

  const min = Math.min(...nonNull.map((p) => p.value));
  const max = Math.max(...nonNull.map((p) => p.value));
  const range = max - min;
  const stepX = points.length <= 1 ? 0 : width / (points.length - 1);

  function toCoord(index: number, value: number): [number, number] {
    const x = index * stepX;
    const y = range === 0 ? height / 2 : height - ((value - min) / range) * height;
    return [x, y];
  }

  // Split into segments at null gaps
  const segments: string[][] = [];
  let current: string[] = [];
  for (let i = 0; i < points.length; i++) {
    if (points[i] !== null) {
      const [x, y] = toCoord(i, points[i]!);
      current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    } else {
      if (current.length > 0) { segments.push(current); current = []; }
    }
  }
  if (current.length > 0) segments.push(current);

  const strokeColor = color ?? 'currentColor';
  const last = nonNull[nonNull.length - 1];
  const [dotX, dotY] = toCoord(last.index, last.value);

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      {segments.map((seg, i) => (
        <polyline
          key={i}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.5}
          points={seg.join(' ')}
        />
      ))}
      <circle cx={dotX.toFixed(1)} cy={dotY.toFixed(1)} r="2" fill={strokeColor} />
    </svg>
  );
}
