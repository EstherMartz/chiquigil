const BASE = 'https://discord.com/api/v10';

function headers(botToken: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bot ${botToken}` };
}

export async function editOriginal(appId: string, interactionToken: string, content: string): Promise<void> {
  const url = `${BASE}/webhooks/${appId}/${interactionToken}/messages/@original`;
  const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
  if (!res.ok) console.error(`[discord] editOriginal failed ${res.status}:`, await res.text().catch(() => ''));
}

export async function sendToChannel(botToken: string, channelId: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/channels/${channelId}/messages`, { method: 'POST', headers: headers(botToken), body: JSON.stringify(payload) });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`[discord] sendToChannel ${channelId} → ${res.status}:`, detail.slice(0, 800));
    return null;
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export async function editMessage(botToken: string, channelId: string, messageId: string, payload: Record<string, unknown>): Promise<void> {
  await fetch(`${BASE}/channels/${channelId}/messages/${messageId}`, { method: 'PATCH', headers: headers(botToken), body: JSON.stringify(payload) });
}

export async function deleteMessages(botToken: string, channelId: string, messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  if (messageIds.length === 1) {
    await fetch(`${BASE}/channels/${channelId}/messages/${messageIds[0]}`, { method: 'DELETE', headers: headers(botToken) });
    return;
  }
  await fetch(`${BASE}/channels/${channelId}/messages/bulk-delete`, { method: 'POST', headers: headers(botToken), body: JSON.stringify({ messages: messageIds }) });
}

export async function createThread(botToken: string, channelId: string, messageId: string, name: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/channels/${channelId}/messages/${messageId}/threads`, { method: 'POST', headers: headers(botToken), body: JSON.stringify({ name, auto_archive_duration: 10080 }) });
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

export async function fetchMessages(botToken: string, channelId: string, limit: number): Promise<Array<{ id: string }>> {
  const res = await fetch(`${BASE}/channels/${channelId}/messages?limit=${limit}`, { headers: headers(botToken) });
  if (!res.ok) return [];
  return res.json() as Promise<Array<{ id: string }>>;
}
