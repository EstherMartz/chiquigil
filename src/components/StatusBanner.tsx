export function StatusBanner({ kind, children }: { kind: 'error' | 'info'; children: React.ReactNode }) {
  const cls = kind === 'error'
    ? 'border-crimson text-crimson'
    : 'border-aether text-aether';
  return (
    <div className={`border ${cls} bg-bg-card-hi/50 px-4 py-2 font-mono text-xs mb-4`}>{children}</div>
  );
}
