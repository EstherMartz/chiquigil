interface Props {
  icon: string;
  message: string;
  action?: { label: string; onClick: () => void };
}

export const EmptyState = ({ icon, message, action }: Props) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-2xl text-text-low mb-2" aria-hidden>
        {icon}
      </div>
      <p className="text-sm text-text-low max-w-prose">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
