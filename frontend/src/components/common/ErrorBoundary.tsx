// Error boundary so a single bad payload never blanks the whole dashboard.

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AO-02 UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-brand-dark p-6 text-white">
          <div className="w-full max-w-lg rounded-xl border border-brand-critical/40 bg-brand-critical/5 p-6">
            <h1 className="text-lg font-semibold text-brand-critical">
              The dashboard hit an unexpected error
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {this.state.error.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg border border-brand-accent/40 bg-brand-accent/10 px-4 py-2 text-sm font-medium text-brand-accent hover:bg-brand-accent/20"
            >
              Reload dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
