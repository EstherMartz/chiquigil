import { describe, it, expect } from 'vitest';
import { linkifyItems, ITEMS_BASE_URL } from './linkifyItems';
import { buildNameIndex } from './nameIndex';

const index = buildNameIndex(new Map<number, string>([
  [100, 'Grade 4 Tincture of Strength'],
  [200, 'Rarefied Sykon Bavarois'],
  [300, 'Potion'],
]));

const url = (id: number) => `${ITEMS_BASE_URL}/item/${id}`;

describe('linkifyItems', () => {
  it('links a bolded name that matches a catalog item', () => {
    const out = linkifyItems('Compra **Potion** barato barato', index);
    expect(out).toBe(`Compra [**Potion**](${url(300)}) barato barato`);
  });

  it('matches case-insensitively but preserves the original display text', () => {
    const out = linkifyItems('mira **rarefied sykon bavarois** brilli', index);
    expect(out).toBe(`mira [**rarefied sykon bavarois**](${url(200)}) brilli`);
  });

  it('leaves bolded non-items untouched', () => {
    const out = linkifyItems('**Ul\'dah** huele a gil y a **ganancia**', index);
    expect(out).toBe('**Ul\'dah** huele a gil y a **ganancia**');
  });

  it('links every item mention in the text', () => {
    const out = linkifyItems('• **Potion** — 100 gil\n• **Grade 4 Tincture of Strength** — 5K gil', index);
    expect(out).toBe(
      `• [**Potion**](${url(300)}) — 100 gil\n• [**Grade 4 Tincture of Strength**](${url(100)}) — 5K gil`,
    );
  });

  it('does not double-link an already-linked label', () => {
    const already = `[**Potion**](${url(300)})`;
    expect(linkifyItems(already, index)).toBe(already);
  });

  it('ignores surrounding whitespace inside the bold span', () => {
    const out = linkifyItems('**  Potion  **', index);
    expect(out).toBe(`[**  Potion  **](${url(300)})`);
  });

  it('returns text with no bold spans unchanged', () => {
    expect(linkifyItems('Qiqirn no encontró nada ✨', index)).toBe('Qiqirn no encontró nada ✨');
  });

  it('handles empty input', () => {
    expect(linkifyItems('', index)).toBe('');
  });
});
