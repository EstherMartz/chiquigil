import { GameIcon } from './GameIcon';
import { QUEST_ICONS, type QuestTypeKey } from './questIcons';

interface Props {
  type: QuestTypeKey;
  size?: number;
  decorative?: boolean;
  className?: string;
}

export function QuestTypeIcon({ type, size, decorative = true, className }: Props) {
  const entry = QUEST_ICONS[type];
  if (!entry) return null;
  return <GameIcon src={entry.file} alt={entry.alt} size={size} decorative={decorative} className={className} />;
}
