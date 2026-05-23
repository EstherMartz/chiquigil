import { fmtGil, fmtGilFull } from '../lib/format';

interface Props {
  value: number | null | undefined;
  /** Use the bigger 'hero' size, e.g. for masthead totals. */
  big?: boolean;
  /** Hide the gil glyph (when context already implies currency). */
  bare?: boolean;
  /** Override formatted text (e.g. show a sign prefix). */
  display?: string;
  /** Extra class names to merge in (e.g. for color emphasis). */
  className?: string;
}

/**
 * Gil currency renderer. Prefixes a faint gold "⊚" glyph so monetary
 * numbers read as currency at a glance instead of bare integers. Falls
 * back to the existing `fmtGil` formatter for the number itself.
 */
export function Gil({ value, big, bare, display, className }: Props) {
  const text = display ?? fmtGil(value ?? null);
  const full = fmtGilFull(value ?? null);
  return (
    <span className={`tabular-nums ${className ?? ''}`} title={full ? `${full} gil` : undefined}>
      {!bare && (
        <span aria-hidden className={`text-gold/70 mr-1 ${big ? 'text-base' : 'text-[9px]'}`}>⊚</span>
      )}
      {text}
    </span>
  );
}
