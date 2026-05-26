import type { Message } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { callLLM, parseOpenRouterResponse, type ChatMessage, type LLMProvider } from './openrouter';
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from './tools';
import { SYSTEM_PROMPT } from './systemPrompt';

const MAX_ITERATIONS = 5;
const COOLDOWN_MS = 5000;
const TYPING_INTERVAL_MS = 8000; // re-send typing every 8s (Discord expires at 10s)
const CAT_CHANCE = 0.15; // ~1 in 7 responses
const CAT_GIFS = [
  'https://media.tenor.com/Yav3V4JTsjAAAAAd/cat-typing.gif',
  'https://media.tenor.com/wfMCaxJdhhkAAAAd/cat-money.gif',
  'https://media.tenor.com/F2FJBmJYIRMAAAAd/cat-cute.gif',
  'https://media.tenor.com/DHLMxVnU1TQAAAAC/cat-nod.gif',
  'https://media.tenor.com/gP6gauAPD0AAAAAd/cat-business.gif',
];
const cooldowns = new Map<string, number>();

export interface ChatDeps {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  toolCtx: ToolContext;
}

export async function handleChatMessage(
  msg: Message,
  deps: ChatDeps,
): Promise<void> {
  const userId = msg.author.id;

  // Rate limit — tell the user instead of silently dropping
  const lastTs = cooldowns.get(userId) ?? 0;
  if (Date.now() - lastTs < COOLDOWN_MS) {
    await msg.react('⏳').catch(() => {});
    return;
  }
  cooldowns.set(userId, Date.now());

  // Acknowledge receipt immediately so the user knows we're working on it
  await msg.react('✨').catch(() => {});

  // Keep typing indicator alive throughout the entire operation
  let typingTimer: ReturnType<typeof setInterval> | null = null;
  const sendTyping = async () => {
    if (msg.channel.isTextBased() && 'sendTyping' in msg.channel) {
      await msg.channel.sendTyping().catch(() => {});
    }
  };
  await sendTyping();
  typingTimer = setInterval(sendTyping, TYPING_INTERVAL_MS);

  const userMessage = msg.content;
  const startTime = Date.now();

  try {
    console.log(`[chat] ${msg.author.tag}: "${userMessage.slice(0, 80)}"`);

    // ~1% chance: nudge the LLM to weave in Karash Barash (a shady Lalafell NPC)
    const karashNudge = Math.random() < 0.01
      ? '\n\n[Nota interna: en esta respuesta, entrelaza de forma natural una mención a Karash Barash, un Lalafell turbio de Ul\'dah que Qiqirn conoce. Puede ser una comparación, un recuerdo, una queja o un rumor — que fluya dentro de la conversación, no pegado al final.]'
      : '';

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + karashNudge },
      { role: 'user', content: userMessage },
    ];

    let finalContent: string | null = null;
    let toolsEverCalled = false;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      console.log(`[chat] iteration ${i + 1}/${MAX_ITERATIONS} — calling LLM…`);
      let raw;
      try {
        raw = await callLLM(deps.provider, deps.apiKey, deps.model, messages, TOOL_DEFINITIONS);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        // Groq tool_use_failed — just retry with tools on next iteration
        if (errMsg.includes('tool_use_failed') || errMsg.includes('tool call validation failed')) {
          console.log('[chat] tool call malformed, will retry with tools…');
          continue;
        }
        throw e;
      }
      const parsed = parseOpenRouterResponse(raw);

      if (parsed.toolCalls.length === 0) {
        // If no tools were ever called and the response contains price-like
        // data, the LLM is hallucinating items — force it to use tools.
        const hasMarketData = parsed.content && /\d+[KMkm]\s*gil/i.test(parsed.content);
        if (!toolsEverCalled && hasMarketData) {
          console.log('[chat] LLM returned market data without calling tools — forcing tool use');
          messages.push(
            { role: 'assistant', content: parsed.content },
            { role: 'user', content: 'DEBES usar herramientas antes de dar precios. Llama una herramienta ahora.' },
          );
          continue;
        }
        finalContent = parsed.content;
        console.log(`[chat] got final response (${finalContent?.length ?? 0} chars)`);
        break;
      }

      const choice = raw.choices[0];
      if (!choice) {
        console.log('[chat] empty response from OpenRouter, stopping');
        break;
      }

      toolsEverCalled = true;
      console.log(`[chat] ${parsed.toolCalls.length} tool call(s): ${parsed.toolCalls.map((t) => t.name).join(', ')}`);

      // Append assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: parsed.content,
        tool_calls: choice.message.tool_calls,
      });

      // Execute each tool and append results
      for (const tc of parsed.toolCalls) {
        console.log(`[chat] executing ${tc.name}(${JSON.stringify(tc.args).slice(0, 100)})`);
        const result = await executeTool(tc.name, tc.args, deps.toolCtx);
        console.log(`[chat] ${tc.name} returned ${result.length} chars`);
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
    finalContent = finalContent
      .replace(/<function=\w+>[\s\S]*?<\/function>/g, '')
      .replace(/Llamando a \w+\.\.\./g, '')
      .replace(/Qiqirn usa \w+/g, '')
      .trim() || 'Qiqirn no encontró nada... intenta otra vez ✨';

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[chat] replying (${elapsed}s total)`);

    const embed = new EmbedBuilder()
      .setColor(0xD4A958)
      .setDescription(finalContent)
      .setFooter({ text: `${deps.model} · ${elapsed}s` });

    if (Math.random() < CAT_CHANCE) {
      const gif = CAT_GIFS[Math.floor(Math.random() * CAT_GIFS.length)];
      embed.setImage(gif);
    }

    await msg.reply({ embeds: [embed] });
    await msg.reactions.cache.get('✨')?.users.remove(msg.client.user?.id).catch(() => {});
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`[chat] error: ${errMsg}`);
    await msg.react('❌').catch(() => {});
    await msg.reply('Ay, mi conexión con las estrellas falló ✨ Inténtalo otra vez').catch(() => {});
  } finally {
    if (typingTimer) clearInterval(typingTimer);
  }
}
