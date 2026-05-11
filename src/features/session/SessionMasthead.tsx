import { useSettingsStore } from '../settings/store';

interface Props {
  dataUpdatedAt: number | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

function formatToday(): string {
  const d = new Date();
  return d
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase();
}

function formatRelative(ts: number | null): string {
  if (ts == null || ts === 0) return 'no data yet';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m === 1) return '1 min ago';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function SessionMasthead({ dataUpdatedAt, onRefresh, isRefreshing }: Props) {
  const { world, dc } = useSettingsStore();
  return (
    <div className="border-y border-border-base py-2 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 text-[10px] font-mono tracking-[0.25em] uppercase text-text-low">
      <div className="flex gap-3 items-center flex-wrap">
        <span className="text-gold">Eorzean Edition</span>
        <span className="text-border-hi">·</span>
        <span>{formatToday()}</span>
        <span className="text-border-hi">·</span>
        <span className="text-aether">{world}</span>
        <span className="text-border-hi">/</span>
        <span>{dc}</span>
      </div>
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="hover:text-aether transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 self-start sm:self-auto"
      >
        <span>Data {formatRelative(dataUpdatedAt)}</span>
        <span className={`text-aether text-base leading-none ${isRefreshing ? 'animate-spin' : ''}`}>
          {isRefreshing ? '◌' : '↻'}
        </span>
      </button>
    </div>
  );
}
