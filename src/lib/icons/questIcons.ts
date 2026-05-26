export type QuestTypeKey = 'msq' | 'side' | 'feature' | 'leve';

interface QuestIconEntry {
  file: string;
  alt: string;
}

export const QUEST_ICONS: Readonly<Record<QuestTypeKey, QuestIconEntry>> = {
  'msq':     { file: '/icons/quests/msq.png',     alt: 'Main Scenario Quest' },
  'side':    { file: '/icons/quests/side.png',    alt: 'Side Quest' },
  'feature': { file: '/icons/quests/feature.png', alt: 'Feature Quest' },
  'leve':    { file: '/icons/quests/leve.png',    alt: 'Levequest' },
};

/**
 * Best-effort resolution of an XIVAPI JournalCategory name (used by /quest-items)
 * to a known quest-type slug. Returns null when we don't have an icon for it
 * (e.g. beast-tribe, repeatable, DoH/DoL class category names handled elsewhere).
 */
export function categoryNameToQuestType(name: string): QuestTypeKey | null {
  const lower = name.toLowerCase();
  if (lower.includes('main scenario')) return 'msq';
  if (lower.includes('levequest') || lower.includes('leve ')) return 'leve';
  if (lower.includes('feature') || lower.includes('class quest') || lower.includes('job quest')) return 'feature';
  if (lower.includes('side')) return 'side';
  return null;
}
