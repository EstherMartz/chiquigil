interface Props {
  current: number;
  total: number;
  label?: string;
}

export function ProgressBar({ current, total, label }: Props) {
  const percentage = (current / total) * 100;

  return (
    <div className="space-y-1.5">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-bg-card-hi shadow-inner">
        <div
          className="h-full rounded-full bg-aether transition-[width] duration-300 shadow-lg shadow-aether/50"
          style={{ width: `${percentage}%` }}
        />
        {current < total && (
          <div className="absolute right-0 top-0 h-full w-4 animate-pulse rounded-full bg-aether/60" />
        )}
      </div>
      <div className="font-mono text-[10px] text-text-low">
        {current.toLocaleString()} / {total.toLocaleString()} items
        {label && ` · ${label}`}
      </div>
    </div>
  );
}
