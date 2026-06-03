import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, isAdmin } = useAuth();

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center text-sm opacity-60">Loading…</div>;
  }
  if (status === 'anon') {
    return <Navigate to="/login" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
