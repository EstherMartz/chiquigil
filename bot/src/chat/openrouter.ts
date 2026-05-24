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

// --- Anthropic API support ---

interface AnthropicContent {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicResponse {
  content: AnthropicContent[];
  stop_reason: string;
}

function toAnthropicMessages(messages: ChatMessage[]): { system: string; messages: Array<{ role: string; content: unknown }> } {
  let system = '';
  const out: Array<{ role: string; content: unknown }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = msg.content ?? '';
      continue;
    }

    if (msg.role === 'user') {
      out.push({ role: 'user', content: msg.content ?? '' });
      continue;
    }

    if (msg.role === 'assistant') {
      const content: AnthropicContent[] = [];
      if (msg.content) content.push({ type: 'text', text: msg.content });
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
      }
      out.push({ role: 'assistant', content });
      continue;
    }

    if (msg.role === 'tool') {
      // Anthropic wants tool_result inside a user message
      const last = out[out.length - 1];
      if (last?.role === 'user' && Array.isArray(last.content)) {
        (last.content as AnthropicContent[]).push({
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: msg.content ?? '',
        });
      } else {
        out.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.tool_call_id,
            content: msg.content ?? '',
          }],
        });
      }
    }
  }

  return { system, messages: out };
}

function toAnthropicTools(tools: ToolDefinition[]): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

function fromAnthropicResponse(raw: AnthropicResponse): OpenRouterResponse {
  let content: string | null = null;
  const toolCalls: ToolCall[] = [];

  for (const block of raw.content) {
    if (block.type === 'text' && block.text) {
      content = (content ?? '') + block.text;
    }
    if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id!,
        type: 'function',
        function: {
          name: block.name!,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  return {
    choices: [{
      message: {
        role: 'assistant',
        content,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      finish_reason: raw.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
    }],
  };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
): Promise<OpenRouterResponse> {
  const { system, messages: anthropicMsgs } = toAnthropicMessages(messages);

  const body: Record<string, unknown> = {
    model,
    messages: anthropicMsgs,
    max_tokens: 1024,
    system,
  };
  if (tools.length > 0) body.tools = toAnthropicTools(tools);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`);
  }
  const raw = await res.json() as AnthropicResponse;
  return fromAnthropicResponse(raw);
}

// --- Unified caller ---

export type LLMProvider = 'openrouter' | 'anthropic' | 'groq';

export async function callLLM(
  provider: LLMProvider,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
): Promise<OpenRouterResponse> {
  if (provider === 'anthropic') {
    return callAnthropic(apiKey, model, messages, tools);
  }
  if (provider === 'groq') {
    return callOpenAICompatible('https://api.groq.com/openai/v1/chat/completions', 'Groq', apiKey, model, messages, tools);
  }
  return callOpenAICompatible('https://openrouter.ai/api/v1/chat/completions', 'OpenRouter', apiKey, model, messages, tools);
}

async function callOpenAICompatible(
  endpoint: string,
  label: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
): Promise<OpenRouterResponse> {
  const res = await fetch(endpoint, {
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
    throw new Error(`${label} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<OpenRouterResponse>;
}
