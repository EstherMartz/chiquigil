import { describe, it, expect } from 'vitest';
import { sanitizeArgs, TOOL_DEFINITIONS } from './tools';

describe('sanitizeArgs', () => {
  it('coerces string numbers to numbers', () => {
    expect(sanitizeArgs({ limit: '5' })).toEqual({ limit: 5 });
  });

  it('coerces decimal string numbers to numbers', () => {
    expect(sanitizeArgs({ limit: '5.5' })).toEqual({ limit: 5.5 });
  });

  it('strips empty string values', () => {
    expect(sanitizeArgs({ category: '', limit: 3 })).toEqual({ limit: 3 });
  });

  it('strips null and undefined values', () => {
    expect(sanitizeArgs({ category: null, limit: 3, sort: undefined })).toEqual({ limit: 3 });
  });

  it('preserves non-numeric strings', () => {
    expect(sanitizeArgs({ category: 'meals', limit: 5 })).toEqual({ category: 'meals', limit: 5 });
  });

  it('handles mixed types', () => {
    expect(sanitizeArgs({ item_name: 'sword', limit: '10', category: '' })).toEqual({
      item_name: 'sword',
      limit: 10,
    });
  });
});

describe('TOOL_DEFINITIONS', () => {
  it('exports 4 tool definitions', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(4);
  });

  it('contains price_check tool', () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.function.name === 'price_check');
    expect(tool).toBeDefined();
    expect(tool?.function.description).toContain('market prices');
  });

  it('contains craft_flip_search tool', () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.function.name === 'craft_flip_search');
    expect(tool).toBeDefined();
    expect(tool?.function.description).toContain('craft');
  });

  it('contains best_deals tool', () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.function.name === 'best_deals');
    expect(tool).toBeDefined();
    expect(tool?.function.description).toContain('discount');
  });

  it('contains vendor_flip_search tool', () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.function.name === 'vendor_flip_search');
    expect(tool).toBeDefined();
    expect(tool?.function.description).toContain('vendor');
  });

  it('all tools are properly formatted', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.type).toBe('function');
      expect(tool.function.name).toBeDefined();
      expect(tool.function.description).toBeDefined();
      expect(tool.function.parameters).toBeDefined();
    }
  });
});
