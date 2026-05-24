import { describe, it, expect } from 'vitest';
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from './tools';

describe('TOOL_DEFINITIONS', () => {
  it('exports 4 tool definitions in OpenAI format', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(4);
    for (const t of TOOL_DEFINITIONS) {
      expect(t.type).toBe('function');
      expect(t.function.name).toBeTruthy();
      expect(t.function.parameters).toBeTruthy();
    }
  });

  it('has expected tool names', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.function.name);
    expect(names).toContain('price_check');
    expect(names).toContain('craft_flip_search');
    expect(names).toContain('best_deals');
    expect(names).toContain('vendor_flip_search');
  });
});

describe('executeTool', () => {
  it('returns error string for unknown tool', async () => {
    const result = await executeTool('nonexistent', {}, {} as ToolContext);
    expect(result).toContain('Unknown tool');
  });
});
