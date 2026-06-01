import type { ReactNode } from 'react';

interface Props { active: boolean; onClick: () => void; children: ReactNode }

/** Small NQ/HQ toggle button shared by the supply-depth and concentration blocks. */
export function QualityTab({ active, onClick, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 border transition-colors ${
        active ? 'border-gold text-gold' : 'border-border-base text-text-low hover:text-text-cream'
      }`}
    >
      {children}
    </button>
  );
}
