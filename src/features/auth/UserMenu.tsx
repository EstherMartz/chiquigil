import { Link } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function UserMenu() {
  const { status, user, isAdmin } = useAuth();
  if (status !== 'authed' || !user) return null;

  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.sub}/${user.avatar}.png?size=32`
    : undefined;

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/login';
  }

  return (
    <div className="flex items-center gap-2">
      {avatarUrl && <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full" />}
      <span className="text-sm">{user.username}</span>
      {isAdmin && <Link to="/admin" className="text-xs underline opacity-70 hover:opacity-100">Admin</Link>}
      <button onClick={logout} className="text-xs underline opacity-70 hover:opacity-100">Log out</button>
    </div>
  );
}
