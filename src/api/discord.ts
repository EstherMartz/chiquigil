import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyKey } from 'discord-interactions';
import { waitUntil } from '@vercel/functions';
import { handleChat } from '../bot/chatHandler';
import { GROQ_MODEL } from '../bot/llm';
import {
  handleCraftNew,
  handleCraftList,
  handleCraftShow,
  handleCraftClose,
  handleCraftSetup,
} from '../bot/craftCommands';
import {
  handleCraftButton,
  handleCraftSelect,
  handleCraftRequestButton,
  handleCraftRequestModal,
  handleCraftProgressModal,
} from '../bot/craftInteractions';
import { loadSnapshots } from '../bot/loadSnapshots';
import { buildNameIndex } from '../bot/nameIndex';
import { openCraftStore } from '../bot/craftStore';
import { fetchMarketForOutputs } from '../bot/marketFetch';
import * as discordApi from '../bot/discordApi';
import type { ToolDeps } from '../bot/tools';
import type { CraftCommandDeps } from '../bot/craftCommands';
import type { CraftInteractionDeps } from '../bot/craftInteractions';

const DISCORD_APP_ID = process.env.DISCORD_APP_ID ?? '';
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY ?? '';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? '';
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? '';
const GUILD_ALLOWLIST = (process.env.GUILD_ALLOWLIST ?? '').split(',').filter(Boolean);
const HOME_WORLD = process.env.HOME_WORLD ?? 'Phantom';
const HOME_DC = process.env.HOME_DC ?? 'Chaos';
const REGION = process.env.REGION ?? 'Europe';
const CRAFT_CHANNEL_ID = process.env.CRAFT_CHANNEL_ID || undefined;
const CRAFTER_ROLE_ID = process.env.CRAFTER_ROLE_ID || undefined;

let craftStorePromise: Promise<import('../src/bot/craftStore').CraftStore> | null = null;

function getCraftStore() {
  if (!craftStorePromise) {
    craftStorePromise = openCraftStore(process.env.TURSO_DATABASE_URL!);
  }
  return craftStorePromise;
}

async function loadMarketCache(): Promise<Record<string, Record<string, unknown>>> {
  const url = process.env.VITE_CACHE_BLOB_URL;
  if (!url) return { phantom: {}, dc: {}, region: {} };
  try {
    const res = await fetch(url);
    if (!res.ok) return { phantom: {}, dc: {}, region: {} };
    return (await res.json()) as Record<string, Record<string, unknown>>;
  } catch {
    return { phantom: {}, dc: {}, region: {} };
  }
}

export const config = { api: { bodyParser: false } };

function readBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: any) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let rawBody: string;
  try {
    rawBody = await readBody(req);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read body', detail: String(e) });
  }

  const signature = req.headers['x-signature-ed25519'] as string ?? '';
  const timestamp = req.headers['x-signature-timestamp'] as string ?? '';

  // Debug: return diagnostics on verification failure
  let isValid: boolean;
  try {
    const result = verifyKey(rawBody, signature, timestamp, DISCORD_PUBLIC_KEY);
    // verifyKey may return a Promise in v2+
    isValid = result instanceof Promise ? await result : result;
  } catch (e) {
    return res.status(500).json({
      error: 'verifyKey threw',
      detail: String(e),
      bodyLen: rawBody.length,
      hasSig: signature.length > 0,
      hasTs: timestamp.length > 0,
      keyLen: DISCORD_PUBLIC_KEY.length,
    });
  }

  if (!isValid) {
    return res.status(401).json({
      error: 'Invalid signature',
      bodyLen: rawBody.length,
      hasSig: signature.length > 0,
      hasTs: timestamp.length > 0,
      keyLen: DISCORD_PUBLIC_KEY.length,
    });
  }

  const interaction = JSON.parse(rawBody);

  // Handle PING
  if (interaction.type === 1) {
    return res.status(200).json({ type: 1 });
  }

  // Check guild allowlist for guild interactions
  if (interaction.guild_id && GUILD_ALLOWLIST.length > 0) {
    if (!GUILD_ALLOWLIST.includes(interaction.guild_id)) {
      return res.status(403).json({ error: 'Guild not allowed' });
    }
  }

  // Get base URL for snapshots
  const proto = req.headers['x-forwarded-proto'] ?? 'https';
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
  const baseUrl = `${proto}://${host}`;

  // Handle autocomplete (synchronous response required)
  if (interaction.type === 4) {
    // Autocomplete interactions require synchronous response
    // For now, return empty choices as placeholder
    return res.status(200).json({ type: 8, data: { choices: [] } });
  }

  // For deferred interactions, defer immediately then process in background
  if (interaction.type === 2) {
    // Slash command
    res.status(200).json({ type: 5, data: {} });

    waitUntil(
      (async () => {
        try {
          const proto = req.headers['x-forwarded-proto'] ?? 'https';
          const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
          const baseUrl = `${proto}://${host}`;

          const [snapshots, cache] = await Promise.all([
            loadSnapshots(baseUrl),
            loadMarketCache(),
          ]);

          const nameIndex = buildNameIndex(snapshots.namesById);
          const marketBundle = { phantom: cache.phantom ?? {}, dc: cache.dc ?? {}, region: cache.region ?? {} };

          const commandName = interaction.data.name;
          const options = interaction.data.options ?? [];
          const guildId = interaction.guild_id ?? '';
          const channelId = interaction.channel_id ?? '';
          const userId = interaction.member?.user?.id ?? '';
          const permissions = BigInt(interaction.member?.permissions ?? '0');

          let response: Record<string, unknown> = { content: 'Unknown command' };

          if (commandName === 'craft') {
            const store = await getCraftStore();
            const subcommand = options[0]?.name ?? '';
            const subOptions = options[0]?.options ?? [];

            const deps: CraftCommandDeps = {
              store,
              snapshots,
              nameIndex,
              marketBundle: marketBundle as any,
              botToken: DISCORD_BOT_TOKEN,
              appId: DISCORD_APP_ID,
              world: HOME_WORLD,
              dc: HOME_DC,
              region: REGION,
              craftChannelId: CRAFT_CHANNEL_ID,
              crafterRoleId: CRAFTER_ROLE_ID,
            };

            if (subcommand === 'new') {
              const item = subOptions.find((o) => o.name === 'item')?.value ?? '';
              const qty = parseInt(subOptions.find((o) => o.name === 'qty')?.value ?? '1', 10);
              const name = subOptions.find((o) => o.name === 'name')?.value ?? null;
              const pingRole = subOptions.find((o) => o.name === 'ping_role')?.value ?? null;

              response = await handleCraftNew(
                { item, qty, name, pingRole },
                guildId,
                channelId,
                userId,
                deps,
              );
            } else if (subcommand === 'list') {
              response = await handleCraftList(guildId, deps);
            } else if (subcommand === 'show') {
              const projectId = parseInt(subOptions.find((o) => o.name === 'id')?.value ?? '0', 10);
              response = await handleCraftShow(projectId, guildId, deps);
            } else if (subcommand === 'close') {
              const projectId = parseInt(subOptions.find((o) => o.name === 'id')?.value ?? '0', 10);
              response = await handleCraftClose(projectId, guildId, userId, permissions, deps);
            } else if (subcommand === 'setup') {
              response = await handleCraftSetup(guildId, channelId, permissions, deps);
            }
          } else if (commandName === 'oye') {
            const question = options.find((o) => o.name === 'question')?.value ?? '';

            const toolDeps: ToolDeps = {
              marketBundle: marketBundle as any,
              snapshots,
              nameIndex,
              world: HOME_WORLD,
              dc: HOME_DC,
            };

            const chatStart = Date.now();
            const output = await handleChat(question, {
              groqApiKey: GROQ_API_KEY,
              toolDeps,
            });
            const chatElapsed = ((Date.now() - chatStart) / 1000).toFixed(1);

            try {
              const parsed = JSON.parse(output);
              const embed: Record<string, unknown> = {
                color: 0xD4A958,
                description: parsed.content,
                footer: { text: `${GROQ_MODEL} · ${chatElapsed}s` },
              };
              if (parsed.image) embed.image = { url: parsed.image };
              response = { embeds: [embed] };
            } catch {
              response = { content: output };
            }
          } else if (commandName === 'craftable') {
            // Get the attachment
            const attachmentId = options.find((o: any) => o.name === 'csv')?.value;
            const file = interaction.data.resolved?.attachments?.[attachmentId];
            if (!file?.url) {
              response = { content: 'No CSV file found.' };
            } else {
              try {
                // Download CSV from Discord CDN
                const csvRes = await fetch(file.url);
                if (!csvRes.ok) {
                  response = { content: 'Failed to download CSV.' };
                } else {
                  const csvText = await csvRes.text();

                  // Parse inventory
                  const { parseAllaganInventory } = await import('../features/cleanup/parseAllaganInventory');
                  const parsed = parseAllaganInventory(csvText, snapshots.namesById);

                  // Build inventory map (sum NQ+HQ)
                  const inv = new Map<number, number>();
                  for (const e of parsed.entries) {
                    if (e.itemId === 0) continue;
                    inv.set(e.itemId, (inv.get(e.itemId) ?? 0) + e.qty);
                  }

                  // Find craftable recipes
                  const { findCraftableFromInventory } = await import('../features/craftFromInventory/findCraftable');
                  const gatheringSet = new Set(snapshots.gatheringCatalog.keys());
                  const craftableRows = findCraftableFromInventory(inv, snapshots.recipes, snapshots.namesById, {
                    maxMissing: 1,
                    vendorMap: snapshots.vendorMap,
                    gatheringSet,
                  });

                  // Format top 10
                  const top = craftableRows.slice(0, 10);
                  if (top.length === 0) {
                    response = {
                      content: 'No hay nada que puedas craftear con tu inventario actual (max 1 ingrediente faltante).',
                    };
                  } else {
                    let msg = '**What you can craft right now:**\n\n';
                    for (const row of top) {
                      const pct = Math.round(row.completeness * 100);
                      const status = pct === 100
                        ? `${row.totalIngredients}/${row.totalIngredients} ingredients ✓`
                        : `${row.totalIngredients - row.missingCount}/${row.totalIngredients} ingredients`;
                      msg += `🔨 **${row.name}** (${row.classJob} ${row.recipeLevel}) — ${status}\n`;
                      const missing = row.ingredients.filter((i: any) => !i.fulfilled);
                      if (missing.length > 0) {
                        const parts = missing.map((i: any) => {
                          const need = i.needed - i.have;
                          const src = i.unitPrice != null ? ` (${i.source} ${i.unitPrice}g)` : i.source === 'gather' ? ' (gather)' : '';
                          return `${i.name} x${need}${src}`;
                        });
                        msg += `  Missing: ${parts.join(', ')}\n`;
                      }
                    }

                    if (craftableRows.length > 10) {
                      msg += `\n_...and ${craftableRows.length - 10} more recipes._`;
                    }

                    response = { content: msg };
                  }
                }
              } catch (e) {
                response = { content: `Error processing CSV: ${e instanceof Error ? e.message : String(e)}` };
              }
            }
          }

          // Send final response
          await editOriginalResponse(
            DISCORD_APP_ID,
            interaction.token,
            response,
          );
        } catch (e) {
          console.error('[discord] deferred command error:', e);
          try {
            await editOriginalResponse(
              DISCORD_APP_ID,
              interaction.token,
              { content: 'Error: ' + (e instanceof Error ? e.message : String(e)) },
            );
          } catch {
            // Best effort
          }
        }
      })(),
    );
  } else if (interaction.type === 3) {
    // Message component (button or select)
    const componentType = interaction.data?.component_type ?? 0;
    const customId = interaction.data?.custom_id ?? '';

    if (componentType === 2) {
      // Button
      res.status(200).json({ type: 6, data: {} });

      waitUntil(
        (async () => {
          try {
            const [snapshots, cache, store] = await Promise.all([
              loadSnapshots(baseUrl),
              loadMarketCache(),
              getCraftStore(),
            ]);

            const guildId = interaction.guild_id ?? '';
            const userId = interaction.member?.user?.id ?? '';
            const messageId = interaction.message?.id ?? '';
            const channelId = interaction.channel_id ?? '';

            const deps: CraftInteractionDeps = {
              store,
              snapshots,
              nameIndex: buildNameIndex(snapshots.namesById),
              botToken: DISCORD_BOT_TOKEN,
              world: HOME_WORLD,
              dc: HOME_DC,
              region: REGION,
              craftChannelId: CRAFT_CHANNEL_ID,
              crafterRoleId: CRAFTER_ROLE_ID,
              fetchMarket: async (ids, cfg) => {
                return fetchMarketForOutputs(ids, cfg.world, cfg.dc, cfg.region);
              },
            };

            let interactionResponse;

            if (customId === 'cproj:requestbutton') {
              interactionResponse = handleCraftRequestButton();
            } else {
              interactionResponse = await handleCraftButton(
                customId,
                userId,
                guildId,
                messageId,
                channelId,
                deps,
              );
            }

            // Handle modal responses (type 9) - these are returned synchronously
            if (interactionResponse.type === 9) {
              // Modal responses should not happen here as we defer first
              // But if they do, we need to send them differently
              // For now, we'll treat this as an error case
              console.warn('[discord] received modal response for deferred button');
              return;
            }

            // For deferred responses (type 6), use editOriginal
            if (interactionResponse.type === 6 || !interactionResponse.type) {
              await editOriginalResponse(
                DISCORD_APP_ID,
                interaction.token,
                interactionResponse.data ?? {},
              );
            }
          } catch (e) {
            console.error('[discord] button error:', e);
            try {
              await editOriginalResponse(
                DISCORD_APP_ID,
                interaction.token,
                { content: 'Error: ' + (e instanceof Error ? e.message : String(e)) },
              );
            } catch {
              // Best effort
            }
          }
        })(),
      );
    } else if (componentType === 3) {
      // Select menu
      res.status(200).json({ type: 6, data: {} });

      waitUntil(
        (async () => {
          try {
            const [snapshots, cache, store] = await Promise.all([
              loadSnapshots(baseUrl),
              loadMarketCache(),
              getCraftStore(),
            ]);

            const guildId = interaction.guild_id ?? '';
            const userId = interaction.member?.user?.id ?? '';
            const messageId = interaction.message?.id ?? '';
            const channelId = interaction.channel_id ?? '';
            const values = interaction.data?.values ?? [];

            const deps: CraftInteractionDeps = {
              store,
              snapshots,
              nameIndex: buildNameIndex(snapshots.namesById),
              botToken: DISCORD_BOT_TOKEN,
              world: HOME_WORLD,
              dc: HOME_DC,
              region: REGION,
              craftChannelId: CRAFT_CHANNEL_ID,
              crafterRoleId: CRAFTER_ROLE_ID,
              fetchMarket: async (ids, cfg) => {
                return fetchMarketForOutputs(ids, cfg.world, cfg.dc, cfg.region);
              },
            };

            const interactionResponse = await handleCraftSelect(
              customId,
              values,
              userId,
              guildId,
              messageId,
              channelId,
              deps,
            );

            // For deferred responses (type 6 or 7), use editOriginal
            if (interactionResponse.type === 6 || interactionResponse.type === 7 || !interactionResponse.type) {
              await editOriginalResponse(
                DISCORD_APP_ID,
                interaction.token,
                interactionResponse.data ?? {},
              );
            }
          } catch (e) {
            console.error('[discord] select error:', e);
            try {
              await editOriginalResponse(
                DISCORD_APP_ID,
                interaction.token,
                { content: 'Error: ' + (e instanceof Error ? e.message : String(e)) },
              );
            } catch {
              // Best effort
            }
          }
        })(),
      );
    }
  } else if (interaction.type === 5) {
    // Modal submission
    const customId = interaction.data?.custom_id ?? '';
    const fields = interaction.data?.components ?? [];

    // Parse modal fields
    const fieldMap: Record<string, string> = {};
    for (const row of fields) {
      for (const component of row.components ?? []) {
        if (component.custom_id) {
          fieldMap[component.custom_id] = component.value ?? '';
        }
      }
    }

    res.status(200).json({ type: 5, data: {} });

    waitUntil(
      (async () => {
        try {
          const [snapshots, cache, store] = await Promise.all([
            loadSnapshots(baseUrl),
            loadMarketCache(),
            getCraftStore(),
          ]);

          const guildId = interaction.guild_id ?? '';
          const userId = interaction.member?.user?.id ?? '';
          const messageId = interaction.message?.id ?? '';
          const channelId = interaction.channel_id ?? '';

          const deps: CraftInteractionDeps = {
            store,
            snapshots,
            nameIndex: buildNameIndex(snapshots.namesById),
            botToken: DISCORD_BOT_TOKEN,
            world: HOME_WORLD,
            dc: HOME_DC,
            region: REGION,
            craftChannelId: CRAFT_CHANNEL_ID,
            crafterRoleId: CRAFTER_ROLE_ID,
            fetchMarket: async (ids, cfg) => {
              return fetchMarketForOutputs(ids, cfg.world, cfg.dc, cfg.region);
            },
          };

          let interactionResponse;

          if (customId === 'cproj:requestmodal') {
            interactionResponse = await handleCraftRequestModal(
              fieldMap,
              userId,
              guildId,
              channelId,
              deps,
            );
          } else if (customId.startsWith('cproj:') && customId.includes(':progressmodal:')) {
            interactionResponse = await handleCraftProgressModal(
              customId,
              fieldMap,
              userId,
              guildId,
              messageId,
              channelId,
              deps,
            );
          } else {
            interactionResponse = { type: 4, data: { content: 'Unknown modal', flags: 64 } };
          }

          // Send response
          if (interactionResponse.type === 4) {
            // CHANNEL_MESSAGE_WITH_SOURCE - send immediately
            await editOriginalResponse(
              DISCORD_APP_ID,
              interaction.token,
              interactionResponse.data ?? {},
            );
          } else if (interactionResponse.type === 6 || interactionResponse.type === 7) {
            // DEFERRED_UPDATE_MESSAGE or UPDATE_MESSAGE
            await editOriginalResponse(
              DISCORD_APP_ID,
              interaction.token,
              interactionResponse.data ?? {},
            );
          }
        } catch (e) {
          console.error('[discord] modal error:', e);
          try {
            await editOriginalResponse(
              DISCORD_APP_ID,
              interaction.token,
              { content: 'Error: ' + (e instanceof Error ? e.message : String(e)) },
            );
          } catch {
            // Best effort
          }
        }
      })(),
    );
  } else {
    return res.status(400).json({ error: 'Unsupported interaction type' });
  }
}

async function editOriginalResponse(
  appId: string,
  interactionToken: string,
  data: Record<string, unknown>,
): Promise<void> {
  const BASE = 'https://discord.com/api/v10';
  const url = `${BASE}/webhooks/${appId}/${interactionToken}/messages/@original`;

  const payload: Record<string, unknown> = {};
  if (data.content !== undefined) payload.content = data.content;
  if (data.embeds !== undefined) payload.embeds = data.embeds;
  if (data.components !== undefined) payload.components = data.components;
  if (data.flags !== undefined) payload.flags = data.flags;

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[discord] editOriginal failed ${res.status}:`, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.error('[discord] editOriginal fetch error:', e);
  }
}
