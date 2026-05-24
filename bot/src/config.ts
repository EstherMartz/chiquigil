function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  guildAllowlist: new Set(
    required('GUILD_ALLOWLIST').split(',').map((s) => s.trim()).filter(Boolean),
  ),
  world: process.env.HOME_WORLD ?? 'Phantom',
  dc: process.env.HOME_DC ?? 'Chaos',
  region: process.env.REGION ?? 'Europe',
  snapshotsDir: process.env.SNAPSHOTS_DIR ?? '../public/data/snapshots',
  openrouterApiKey: optional('OPENROUTER_API_KEY'),
  chatModel: process.env.CHAT_MODEL ?? 'meta-llama/llama-3.1-70b-instruct',
};
