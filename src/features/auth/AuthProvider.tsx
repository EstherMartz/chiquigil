import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface AuthUser {
  sub: string;
  username: string;
  avatar: string | null;
  guilds: string[];
}

type Status = 'loading' | 'authed' | 'anon';

interface AuthState {
  status: Status;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthState>({ status: 'loading', user: null });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) {
          const data = (await r.json()) as { user: AuthUser };
          setState({ status: 'authed', user: data.user });
        } else {
          setState({ status: 'anon', user: null });
        }
      })
      .catch(() => { if (!cancelled) setState({ status: 'anon', user: null }); });
    return () => { cancelled = true; };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

/** Test/utility provider that injects a fixed auth state. */
export function __TestAuthProvider({ value, children }: { value: AuthState; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
