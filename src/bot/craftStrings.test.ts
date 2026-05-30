import { describe, it, expect } from 'vitest';
import { mentionOrName } from './craftStrings';

describe('mentionOrName', () => {
  it('renders a Discord mention for a snowflake id', () => {
    expect(mentionOrName('123456789012345678')).toBe('<@123456789012345678>');
  });

  it('renders the literal text for a character name', () => {
    expect(mentionOrName('Esther Martz')).toBe('Esther Martz');
  });

  it('treats too-short numeric strings as plain text', () => {
    expect(mentionOrName('42')).toBe('42');
  });
});
