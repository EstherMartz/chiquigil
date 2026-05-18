import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Tooltip content shown on hover. */
  label: ReactNode;
}

/**
 * Lightweight hover tooltip that overlays a small explainer above its trigger.
 *
 * Wrap a header label, button, or any inline element. The tooltip pops up
 * centered above the trigger and wraps at 260px. CSS-only show/hide via a
 * named Tailwind group, so no JS state is involved.
 */
export function InfoTooltip({ children, label }: Props) {
  return (
    <span className="group/tt relative inline-flex items-center">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tt:block z-30 border border-border-hi bg-bg-card-hi text-text-cream font-mono text-[10px] tracking-normal normal-case px-2.5 py-1.5 leading-relaxed whitespace-normal w-max max-w-[260px] shadow-lg"
      >
        {label}
      </span>
    </span>
  );
}
