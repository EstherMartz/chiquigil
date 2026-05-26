import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QuestTypeIcon } from './QuestTypeIcon';
import { categoryNameToQuestType } from './questIcons';

describe('QuestTypeIcon', () => {
  it('renders the matching icon', () => {
    const { container } = render(<QuestTypeIcon type="msq" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/icons/quests/msq.png');
  });

  it('renders null for unknown type', () => {
    const { container } = render(<QuestTypeIcon type={'unknown' as never} />);
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('categoryNameToQuestType', () => {
  it.each([
    ['Main Scenario Quest', 'msq'],
    ['Side Quest', 'side'],
    ['Disciple of the Hand', null],
    ['Levequest', 'leve'],
    ['Beast Tribe Quest', null],
    ['Allied Beast Tribe Quest', null],
    ['Carpenter', null],
    ['Feature Quest', 'feature'],
  ] as const)('maps %s -> %s', (input, expected) => {
    expect(categoryNameToQuestType(input)).toBe(expected);
  });
});
