import { useEffect, useState } from 'react';
import type { AppUser, AccessLevel } from '../bot/craftTypes';

const LEVELS: AccessLevel[] = ['default', 'allow', 'block'];

function fmtDate(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toISOString().slice(0, 10);
}

export default function Admin() {
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/admin/users', { credentials: 'same-origin' })
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) setUsers(((await r.json()) as { users: AppUser[] }).users);
        else setError(true);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  async function setAccess(discordId: string, access: AccessLevel) {
    const prev = users;
    setUsers((u) => u?.map((x) => (x.discordId === discordId ? { ...x, access } : x)) ?? u);
    try {
      const r = await fetch('/api/auth/admin/access', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId, access }),
      });
      if (!r.ok) throw new Error('failed');
    } catch {
      setUsers(prev ?? null);
    }
  }

  if (error) return <div className="border border-border-base bg-bg-card p-8 text-center text-crimson text-sm">Could not load the roster.</div>;
  if (!users) return <div className="text-sm opacity-60">Loading…</div>;

  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] text-text-low">{users.length} user(s) on record</div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase text-text-dim border-b border-border-base">
              <th className="text-left px-3 py-2">User</th>
              <th className="text-left px-3 py-2">Discord ID</th>
              <th className="text-left px-3 py-2">Guilds</th>
              <th className="text-left px-3 py-2">First seen</th>
              <th className="text-left px-3 py-2">Last seen</th>
              <th className="text-left px-3 py-2">Access</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.discordId} className="border-b border-border-base last:border-b-0">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    {u.avatar && (
                      <img src={`https://cdn.discordapp.com/avatars/${u.discordId}/${u.avatar}.png?size=32`} alt="" className="h-5 w-5 rounded-full" />
                    )}
                    {u.username}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-text-low">{u.discordId}</td>
                <td className="px-3 py-2 font-mono text-xs text-text-low">{u.guilds.join(', ') || '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-text-low">{fmtDate(u.firstSeen)}</td>
                <td className="px-3 py-2 font-mono text-xs text-text-low">{fmtDate(u.lastSeen)}</td>
                <td className="px-3 py-2">
                  <div className="inline-flex border border-border-base" role="group" aria-label={`Access for ${u.username}`}>
                    {LEVELS.map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setAccess(u.discordId, lvl)}
                        className={`font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 border-r border-border-base last:border-r-0 transition-colors ${
                          u.access === lvl ? 'bg-bg-card-hi text-gold' : 'text-text-dim hover:text-aether'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
