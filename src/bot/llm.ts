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

interface GroqResponse {
  choices: Array<{
    message: { role: string; content: string | null; tool_calls?: ToolCall[] };
    finish_reason: string;
  }>;
}

export interface ParsedResponse {
  content: string | null;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}

export function parseResponse(raw: GroqResponse): ParsedResponse {
  const choice = raw.choices[0];
  if (!choice) return { content: null, toolCalls: [] };

  if (choice.message.tool_calls?.length) {
    const toolCalls = choice.message.tool_calls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));
    return { content: choice.message.content, toolCalls };
  }

  const text = choice.message.content ?? '';
  const fnMatch = text.match(/<function=(\w+)>([\s\S]*?)<\/function>/);
  if (fnMatch) {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(fnMatch[2]); } catch { /* empty args */ }
    const cleanContent = text.replace(/<function=\w+>[\s\S]*?<\/function>/g, '').trim() || null;
    return { content: cleanContent, toolCalls: [{ id: 'fn_' + Date.now(), name: fnMatch[1], args }] };
  }

  return { content: choice.message.content, toolCalls: [] };
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

export async function callGroq(
  apiKey: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
): Promise<GroqResponse> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, messages, tools: tools.length > 0 ? tools : undefined, max_tokens: 1024, temperature: 0.7 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<GroqResponse>;
}
