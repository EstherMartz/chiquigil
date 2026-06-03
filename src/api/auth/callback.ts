import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  verifyState, signSession, serializeSessionCookie, allowedGuildsFor, oauthRedirectUri,
} from '../_auth';
import { decideAccess } from '../_access';
import { getStore } from '../_store';

function redirect(res: VercelResponse, location: string) {
  res.setHeader('Location', location);
  return res.status(302).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const code = req.query?.code as string | undefined;
  const stateToken = req.query?.state as string | undefined;
  if (!code || !stateToken) return redirect(res, '/login?error=expired');

  const returnTo = await verifyState(stateToken);
  if (returnTo === null) return redirect(res, '/login?error=expired');

  // 1. Exchange the code for an access token.
  let accessToken: string;
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID ?? '',
        client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
        grant_type: 'authorization_code',
        code,
        redirect_uri: oauthRedirectUri(req),
      }),
    });
    if (!tokenRes.ok) return redirect(res, '/login?error=discord');
    const tok = (await tokenRes.json()) as { access_token?: string };
    if (!tok.access_token) return redirect(res, '/login?error=discord');
    accessToken = tok.access_token;
  } catch {
    return redirect(res, '/login?error=discord');
  }

  // 2. Fetch identity + guilds.
  try {
    const auth = { headers: { Authorization: `Bearer ${accessToken}` } };
    const [meRes, guildsRes] = [
      await fetch('https://discord.com/api/users/@me', auth),
      await fetch('https://discord.com/api/users/@me/guilds', auth),
    ];
    if (!meRes.ok || !guildsRes.ok) return redirect(res, '/login?error=discord');
    const me = (await meRes.json()) as { id: string; username?: string; global_name?: string | null; avatar?: string | null };
    const guilds = (await guildsRes.json()) as Array<{ id: string }>;

    // 3. Authorize: combine guild membership with any per-user override.
    const allowed = allowedGuildsFor(guilds.map((g) => g.id));
    const store = await getStore();
    const record = await store.getAppUser(me.id);
    if (!decideAccess({ guildAllowed: allowed.length > 0, access: record?.access ?? null })) {
      return redirect(res, '/login?error=not_authorized');
    }

    // 4. Record / refresh the login.
    await store.upsertAppUser({
      discordId: me.id,
      username: me.global_name ?? me.username ?? me.id,
      avatar: me.avatar ?? null,
      guilds: allowed,
    });

    // 5. Mint the session cookie.
    const token = await signSession({
      sub: me.id,
      username: me.global_name ?? me.username ?? me.id,
      avatar: me.avatar ?? null,
      guilds: allowed,
    });
    res.setHeader('Set-Cookie', serializeSessionCookie(token));
    return redirect(res, returnTo || '/');
  } catch {
    return redirect(res, '/login?error=discord');
  }
}

export const config = { api: { bodyParser: false } };
