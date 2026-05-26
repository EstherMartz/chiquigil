import { describe, it, expect } from 'vitest';
import { parseResponse } from './llm';

describe('parseResponse', () => {
  it('extracts native tool calls', () => {
    const raw = {
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'tc1',
            type: 'function' as const,
            function: { name: 'price_check', arguments: '{"item_name":"potion"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    };
    const parsed = parseResponse(raw);
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0].name).toBe('price_check');
    expect(parsed.toolCalls[0].args).toEqual({ item_name: 'potion' });
  });

  it('detects malformed <function=...> XML from Llama', () => {
    const raw = {
      choices: [{
        message: { role: 'assistant', content: '<function=price_check>{"item_name":"sword"}</function>' },
        finish_reason: 'stop',
      }],
    };
    const parsed = parseResponse(raw);
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0].name).toBe('price_check');
    expect(parsed.toolCalls[0].args).toEqual({ item_name: 'sword' });
  });

  it('returns content when no tool calls', () => {
    const raw = {
      choices: [{ message: { role: 'assistant', content: 'Hola aventurero!' }, finish_reason: 'stop' }],
    };
    const parsed = parseResponse(raw);
    expect(parsed.content).toBe('Hola aventurero!');
    expect(parsed.toolCalls).toHaveLength(0);
  });

  it('returns empty when no choices', () => {
    const parsed = parseResponse({ choices: [] });
    expect(parsed.content).toBeNull();
    expect(parsed.toolCalls).toHaveLength(0);
  });
});
