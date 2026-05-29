import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary so a single component throw shows a recoverable
 * message instead of white-screening the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface in the console for debugging; no telemetry backend yet.
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto mt-16 max-w-lg rounded-lg border border-crimson/40 bg-crimson/5 p-6 text-center">
        <h2 className="mb-2 text-lg font-semibold text-crimson">Something went wrong</h2>
        <p className="mb-4 text-sm text-zinc-400">
          This page hit an unexpected error. The rest of the app is fine — try again, or
          reload if it persists.
        </p>
        <pre className="mb-4 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 text-left text-xs text-zinc-500">
          {error.message}
        </pre>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={this.reset}
            className="rounded bg-zinc-700 px-4 py-1.5 text-sm hover:bg-zinc-600"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded bg-zinc-700 px-4 py-1.5 text-sm hover:bg-zinc-600"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
