import type { CraftStatus } from '../items/craftStatus';
import type { CrafterCode } from '../items/types';

const cls: Record<CraftStatus, string> = {
  ok: 'border-jade text-jade',
  short: 'border-gold text-gold',
  no: 'border-crimson text-crimson opacity-70',
};

export function CraftTag({ crafter, status }: { crafter: CrafterCode; status: CraftStatus }) {
  return (
    <span className={`inline-block font-mono text-[10px] tracking-widest px-1.5 py-0.5 border rounded-sm ${cls[status]}`}>
      {crafter}
    </span>
  );
}
