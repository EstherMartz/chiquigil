import type { VercelRequest, VercelResponse } from '@vercel/node';
import { signState, oauthRedirectUri } from '../_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const returnTo = (req.query?.return as string | undefined) ?? '/';
  const state = await signState(returnTo);

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? '',
    redirect_uri: oauthRedirectUri(req),
    response_type: 'code',
    scope: 'identify guilds',
    state,
    prompt: 'none',
  });

  res.setHeader('Location', `https://discord.com/oauth2/authorize?${params.toString()}`);
  return res.status(302).end();
}

export const config = { api: { bodyParser: false } };
