import type { CraftStatus } from '../items/craftStatus';
import type { CrafterCode } from '../items/types';
import { crafterBeadClass } from '../items/crafterColors';

const STATUS_PILL: Record<CraftStatus, string> = {
  ok:    'border-jade text-jade',
  short: 'border-gold text-gold',
  no:    'border-crimson text-crimson opacity-70',
};

/**
 * Craft pill: status-colored border (can-craft / short-by / can't), with a
 * tiny leading bullet in the crafter's identity color so a glance reads as
 * "BSM that I can craft" without needing to parse the code.
 */
export function CraftTag({ crafter, status }: { crafter: CrafterCode; status: CraftStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[10px] tracking-widest px-1.5 py-0.5 border rounded-sm ${STATUS_PILL[status]}`}>
      <span aria-hidden className={`${crafterBeadClass(crafter)} text-[8px] leading-none`}>●</span>
      {crafter}
    </span>
  );
}
