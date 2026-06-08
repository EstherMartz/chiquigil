import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Sidebar } from '../../components/layout/Sidebar';
import { Spinner } from '../../components/Spinner';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    // Render the real shell (sidebar + content frame) during the one-time auth
    // check so a direct URL load doesn't flash a bare "Loading…" on an empty
    // dark page — the layout appears immediately, just with a spinner where the
    // page content will land. Sidebar has no auth dependencies.
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 min-w-0 pt-16 md:pt-8 px-4 flex items-start justify-center">
          <div className="mt-24"><Spinner /></div>
        </main>
      </div>
    );
  }
  if (status === 'anon') {
    const ret = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?return=${ret}`} replace />;
  }
  return <>{children}</>;
}
