import type { ReactNode } from 'react';

interface Props {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function HomePanel({ title, hint, children, defaultOpen = false }: Props) {
  return (
    <details
      className="border border-border-base bg-bg-card group open:border-border-hi"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none px-4 py-3 flex justify-between items-baseline">
        <h3 className="font-display text-base text-gold tracking-wide">{title}</h3>
        <span className="font-mono text-[10px] text-text-low tracking-widest uppercase">
          {hint ?? 'click to expand'}
        </span>
      </summary>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}
