export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenRouterResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
}

export interface ParsedResponse {
  content: string | null;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}

export function parseOpenRouterResponse(raw: OpenRouterResponse): ParsedResponse {
  const choice = raw.choices[0];
  if (!choice) return { content: null, toolCalls: [] };

  const toolCalls = (choice.message.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  }));

  return { content: choice.message.content, toolCalls };
}

export async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
): Promise<OpenRouterResponse> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<OpenRouterResponse>;
}
