interface Props {
  icon?: string;
  message: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}

export const EmptyState = ({ icon = '◆', message, action }: Props) => {
  return (
    <div className="border border-border-base bg-bg-card flex flex-col items-center justify-center py-12 px-6 text-center gap-4">
      <div className="text-gold text-4xl" aria-hidden>
        {icon}
      </div>
      <p className="font-mono text-[11px] text-text-low max-w-md leading-relaxed">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.disabled}
          className="font-mono text-xs tracking-widest uppercase bg-gold text-bg-deep px-6 py-3 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
