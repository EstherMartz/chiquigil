import { callGroq, parseResponse, type ChatMessage } from './llm';
import { TOOL_DEFINITIONS, executeTool, type ToolDeps } from './tools';
import { SYSTEM_PROMPT } from './systemPrompt';

const MARKET_KEYWORDS = /precio|comprar|vender|vende|craft|craftear|gil|mercado|market|ganancia|rentable|barato|caro|flip|materia|tinte|dye|pocion|poción|comida|arma|armadura|accesorio|mueble|minion|oferta|ganga|npc|vendor|recipe|receta|ingrediente|material|madera|metal|tela|cuero|piedra|lumber|cloth|leather|stone|item|objeto|cuanto|cuánto|cuesta|vale/i;

function needsMarketTools(question: string): boolean {
  return MARKET_KEYWORDS.test(question);
}

const MAX_ITERATIONS = 5;
const CAT_CHANCE = 0.15; // ~1 in 7 responses
const CAT_GIFS = [
  'https://media.tenor.com/Yav3V4JTsjAAAAAd/cat-typing.gif',
  'https://media.tenor.com/wfMCaxJdhhkAAAAd/cat-money.gif',
  'https://media.tenor.com/F2FJBmJYIRMAAAAd/cat-cute.gif',
  'https://media.tenor.com/DHLMxVnU1TQAAAAC/cat-nod.gif',
  'https://media.tenor.com/gP6gauAPD0AAAAAd/cat-business.gif',
];

export function stripLeakedMarkup(text: string): string {
  return text
    .replace(/<function=\w+>[\s\S]*?<\/function>/g, '')
    .replace(/Llamando a \w+\.\.\./g, '')
    .replace(/Qiqirn usa \w+/g, '')
    .trim();
}

export interface ChatHandlerDeps {
  groqApiKey: string;
  toolDeps: ToolDeps;
}

export async function handleChat(question: string, deps: ChatHandlerDeps): Promise<string> {
  // ~1% chance: nudge the LLM to weave in Karash Barash (a shady Lalafell NPC)
  const karashNudge = Math.random() < 0.01
    ? '\n\n[Nota interna: en esta respuesta, entrelaza de forma natural una mención a Karash Barash, un Lalafell turbio de Ul\'dah que Qiqirn conoce. Puede ser una comparación, un recuerdo, una queja o un rumor — que fluya dentro de la conversación, no pegado al final.]'
    : '';

  const tools = needsMarketTools(question) ? TOOL_DEFINITIONS : [];

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT + karashNudge },
    { role: 'user', content: question },
  ];

  let finalContent: string | null = null;
  let toolsEverCalled = false;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let raw;
    try {
      raw = await callGroq(deps.groqApiKey, messages, tools);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      // Groq tool_use_failed — just retry with tools on next iteration
      if (errMsg.includes('tool_use_failed') || errMsg.includes('tool call validation failed')) {
        continue;
      }
      throw e;
    }

    const parsed = parseResponse(raw);

    if (parsed.toolCalls.length === 0) {
      // If no tools were ever called and the response contains price-like
      // data, the LLM is hallucinating items — force it to use tools.
      const hasMarketData = parsed.content && /\d+[KMkm]\s*gil/i.test(parsed.content);
      if (!toolsEverCalled && hasMarketData) {
        messages.push(
          { role: 'assistant', content: parsed.content },
          { role: 'user', content: 'DEBES usar herramientas antes de dar precios. Llama una herramienta ahora.' },
        );
        continue;
      }
      finalContent = parsed.content;
      break;
    }

    toolsEverCalled = true;

    // Append assistant message with tool calls
    const choice = raw.choices[0];
    messages.push({
      role: 'assistant',
      content: parsed.content,
      tool_calls: choice?.message.tool_calls,
    });

    // Execute each tool and append results
    for (const tc of parsed.toolCalls) {
      const result = await executeTool(tc.name, tc.args, deps.toolDeps);
      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: tc.id,
      });
    }
  }

  if (!finalContent) {
    finalContent = 'No pude completar tu consulta — inténtalo de nuevo ✨';
  }

  // Strip any leaked tool-call markup from the response
  finalContent = stripLeakedMarkup(finalContent) || 'Qiqirn no encontró nada... intenta otra vez ✨';

  // ~15% chance: add a random cat GIF to the response object
  const gifUrl = Math.random() < CAT_CHANCE ? CAT_GIFS[Math.floor(Math.random() * CAT_GIFS.length)] : undefined;

  return JSON.stringify({
    content: finalContent,
    image: gifUrl,
  });
}
