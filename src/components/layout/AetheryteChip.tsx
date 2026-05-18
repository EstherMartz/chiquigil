import { Link } from 'react-router-dom';
import { useSettingsStore } from '../../features/settings/store';

/**
 * Aetheryte chip: a compact world/DC indicator in the header. Mirrors the
 * "you are attuned here" feel of an FFXIV aetheryte crystal. Click → Settings
 * to retune (change world or DC).
 */
export function AetheryteChip() {
  const { world, dc } = useSettingsStore();
  return (
    <Link
      to="/settings"
      title="Tap to retune your home world or data center"
      className="inline-flex items-center gap-2 border border-border-base hover:border-aether px-2.5 py-1.5 font-mono text-[10px] tracking-widest uppercase text-text-dim hover:text-aether transition-colors"
    >
      <span aria-hidden className="text-aether text-[11px] leading-none">◆</span>
      <span className="text-text-cream">{world}</span>
      <span className="text-text-low">·</span>
      <span>{dc}</span>
    </Link>
  );
}
