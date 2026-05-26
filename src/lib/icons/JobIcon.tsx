import { GameIcon } from './GameIcon';
import { JOB_ICONS, type JobKey } from './jobIcons';

interface Props {
  job: JobKey;
  size?: number;
  decorative?: boolean;
  className?: string;
}

export function JobIcon({ job, size, decorative = true, className }: Props) {
  const entry = JOB_ICONS[job];
  if (!entry) return null;
  return <GameIcon src={entry.file} alt={entry.alt} size={size} decorative={decorative} className={className} />;
}
