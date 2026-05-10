export function ScoreBar({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block w-16 h-1 bg-border-base relative align-middle">
        <span
          className="block h-full bg-gradient-to-r from-aether to-gold"
          style={{ width: `${score}%` }}
        />
      </span>
      <span className="font-mono text-xs">{score}</span>
    </span>
  );
}
