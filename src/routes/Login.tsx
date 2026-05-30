import { useLocation } from 'react-router-dom';

const ERRORS: Record<string, string> = {
  not_authorized: 'That Discord account is not in an allow-listed server. Ask an admin to add your server.',
  expired: 'Your sign-in attempt expired. Please try again.',
  discord: 'Discord sign-in failed. Please try again.',
};

export default function Login() {
  const params = new URLSearchParams(useLocation().search);
  const error = params.get('error');
  const ret = params.get('return') ?? '/';
  const loginHref = `/api/auth/login?return=${encodeURIComponent(ret)}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-2xl font-semibold">qiqirn.tools</h1>
      <p className="max-w-sm text-sm opacity-70">Sign in with Discord to access the tools. Access is limited to members of allow-listed servers.</p>
      {error && <p className="max-w-sm rounded-md bg-red-500/10 px-4 py-2 text-sm text-red-400">{ERRORS[error] ?? 'Sign-in failed.'}</p>}
      <a
        href={loginHref}
        className="rounded-md bg-[#5865F2] px-5 py-2.5 font-medium text-white hover:bg-[#4752c4]"
      >
        Sign in with Discord
      </a>
    </div>
  );
}
