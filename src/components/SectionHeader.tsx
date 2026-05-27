import type { ReactNode } from 'react';

interface Props {
  /** Uppercase label, will be rendered in mono small-caps. */
  label: string;
  /** Optional trailing slot (counts, actions, chips). */
  trailing?: ReactNode;
  /** Sigil glyph rendered before the label. Defaults to a diamond crystal. */
  sigil?: string;
  /** Render compactly (smaller spacing, no underline). */
  compact?: boolean;
}

/**
 * Themed section header. Centralizes the mono-caps + crystal-sigil pattern
 * used across the app so every section reads as part of the same ledger.
 */
export function SectionHeader({ label, trailing, sigil = '❖', compact }: Props) {
  const headingSize = compact ? 'text-[10px]' : 'text-[14px]';
  const sigilSize = compact ? 'text-[12px]' : 'text-[16px]';
  return (
    <div className={`flex items-baseline justify-between gap-3 ${compact ? 'mb-2' : 'mb-4 pb-2 border-b border-border-base'}`}>
      <h2 className={`font-mono ${headingSize} tracking-[0.3em] uppercase text-gold flex items-center gap-2`}>
        <span aria-hidden className={`text-aether ${sigilSize} leading-none`}>{sigil}</span>
        {label}
      </h2>
      {trailing && (
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">
          {trailing}
        </div>
      )}
    </div>
  );
}
