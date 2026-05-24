import { describe, it, expect } from 'vitest';
import { parseOpenRouterResponse, type OpenRouterResponse } from './openrouter';

describe('parseOpenRouterResponse', () => {
  it('extracts text content from a simple response', () => {
    const raw: OpenRouterResponse = {
      choices: [{
        message: { role: 'assistant', content: 'Hola ✨', tool_calls: undefined },
        finish_reason: 'stop',
      }],
    };
    const parsed = parseOpenRouterResponse(raw);
    expect(parsed.content).toBe('Hola ✨');
    expect(parsed.toolCalls).toEqual([]);
  });

  it('extracts tool calls when present', () => {
    const raw: OpenRouterResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'price_check', arguments: '{"item_name":"tunic"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    };
    const parsed = parseOpenRouterResponse(raw);
    expect(parsed.content).toBeNull();
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0].name).toBe('price_check');
    expect(parsed.toolCalls[0].args).toEqual({ item_name: 'tunic' });
  });

  it('handles empty choices gracefully', () => {
    const raw: OpenRouterResponse = { choices: [] };
    const parsed = parseOpenRouterResponse(raw);
    expect(parsed.content).toBeNull();
    expect(parsed.toolCalls).toEqual([]);
  });
});
