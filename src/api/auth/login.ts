import type { VercelRequest, VercelResponse } from '@vercel/node';
import { signState } from '../_auth';

function redirectUri(req: VercelRequest): string {
  if (process.env.OAUTH_REDIRECT_URI) return process.env.OAUTH_REDIRECT_URI;
  const host = req.headers?.host ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  return `${proto}://${host}/api/auth/callback`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const returnTo = (req.query?.return as string | undefined) ?? '/';
  const state = await signState(returnTo);

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? '',
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'identify guilds',
    state,
    prompt: 'none',
  });

  res.setHeader('Location', `https://discord.com/oauth2/authorize?${params.toString()}`);
  return res.status(302).end();
}

export const config = { api: { bodyParser: false } };
