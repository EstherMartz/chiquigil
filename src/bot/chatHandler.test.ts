import { describe, it, expect } from 'vitest';
import { stripLeakedMarkup } from './chatHandler';

describe('stripLeakedMarkup', () => {
  it('removes <function=...> XML tags', () => {
    const input = 'Hello <function=price_check>{"item":"sword"}</function> world';
    expect(stripLeakedMarkup(input)).toBe('Hello  world');
  });

  it('removes multiple XML tags', () => {
    const input = 'Start <function=price_check>...</function> middle <function=craft_flip_search>...</function> end';
    expect(stripLeakedMarkup(input)).toBe('Start  middle  end');
  });

  it('returns original text when no markup', () => {
    expect(stripLeakedMarkup('Just a normal message')).toBe('Just a normal message');
  });

  it('removes "Llamando a X..." Spanish narration', () => {
    const input = 'Llamando a price_check... aquí están los resultados';
    expect(stripLeakedMarkup(input)).toBe('aquí están los resultados');
  });

  it('removes "Qiqirn usa X" Spanish narration', () => {
    const input = 'Qiqirn usa craft_flip_search para buscar';
    expect(stripLeakedMarkup(input)).toBe('para buscar');
  });

  it('handles mixed markup and narration', () => {
    const input = 'Llamando a price_check... <function=price_check>{...}</function> Qiqirn usa craft_flip_search resultado';
    expect(stripLeakedMarkup(input)).toBe('resultado');
  });

  it('trims leading/trailing whitespace after cleanup', () => {
    const input = '  <function=price_check>...</function>   ';
    expect(stripLeakedMarkup(input)).toBe('');
  });

  it('preserves normal content around markup', () => {
    const input = 'Item A costs <function=price_check>{"item":"a"}</function> and item B costs 100 gil';
    expect(stripLeakedMarkup(input)).toBe('Item A costs  and item B costs 100 gil');
  });
});
