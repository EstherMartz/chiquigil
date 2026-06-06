import type { ListSource } from './resolveList';

const LABEL: Record<ListSource, string> = {
  Crafted: 'CRAFTED',
  Gathered: 'GATHERED',
  TimedGather: 'TIMED GATHER',
  Vendor: 'VENDOR',
  MonsterDrop: 'MONSTER / OTHER',
  Tome: 'TOME / TOKEN',
  Crystal: 'CRYSTAL',
};

const COLOR: Record<ListSource, string> = {
  Crafted: 'border-gold text-gold',
  Gathered: 'border-jade text-jade',
  TimedGather: 'border-jade text-jade',
  Vendor: 'border-aether text-aether',
  MonsterDrop: 'border-crimson text-crimson',
  Tome: 'border-aether text-aether',
  Crystal: 'border-border-hi text-text-dim',
};

export function SourceTag({ source }: { source: ListSource }) {
  return (
    <span className={`inline-block font-mono text-[9px] tracking-widest uppercase border px-1.5 py-0.5 leading-none ${COLOR[source]}`}>
      {LABEL[source]}
    </span>
  );
}
