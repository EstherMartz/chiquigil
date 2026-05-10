export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="font-mono text-xs text-text-low animate-pulse">{label}</div>
  );
}
