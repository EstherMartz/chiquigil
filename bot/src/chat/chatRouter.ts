import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { callOpenRouter, parseOpenRouterResponse, type ChatMessage } from './openrouter';
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from './tools';
import { SYSTEM_PROMPT } from './systemPrompt';

const MAX_ITERATIONS = 3;
const COOLDOWN_MS = 5000;
const cooldowns = new Map<string, number>();

export interface ChatDeps {
  apiKey: string;
  model: string;
  toolCtx: ToolContext;
}

export async function handleChatCommand(
  interaction: ChatInputCommandInteraction,
  deps: ChatDeps,
): Promise<void> {
  const userId = interaction.user.id;

  // Rate limit
  const lastTs = cooldowns.get(userId) ?? 0;
  if (Date.now() - lastTs < COOLDOWN_MS) {
    await interaction.reply({ content: 'Espera un momentito ✨', ephemeral: true });
    return;
  }
  cooldowns.set(userId, Date.now());

  await interaction.deferReply();
  const userMessage = interaction.options.getString('message', true);
  const startTime = Date.now();

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ];

    let finalContent: string | null = null;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const raw = await callOpenRouter(deps.apiKey, deps.model, messages, TOOL_DEFINITIONS);
      const parsed = parseOpenRouterResponse(raw);

      if (parsed.toolCalls.length === 0) {
        finalContent = parsed.content;
        break;
      }

      // Append assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: parsed.content,
        tool_calls: raw.choices[0].message.tool_calls,
      });

      // Execute each tool and append results
      for (const tc of parsed.toolCalls) {
        const result = await executeTool(tc.name, tc.args, deps.toolCtx);
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

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const embed = new EmbedBuilder()
      .setColor(0xD4A958)
      .setDescription(finalContent)
      .setFooter({ text: `${deps.model} · ${elapsed}s` });

    await interaction.editReply({ embeds: [embed] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Chat error:', msg);
    await interaction.editReply({
      content: 'Ay, mi conexión con las estrellas falló ✨ Inténtalo otra vez',
    });
  }
}
