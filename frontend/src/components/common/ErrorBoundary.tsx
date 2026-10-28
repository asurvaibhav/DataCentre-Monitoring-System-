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
        <div className="flex min-h-screen items-center justify-center bg-brand-canvas p-6 text-brand-ink">
          <section className="panel w-full max-w-lg p-6" role="alert">
            <p className="eyebrow">SYSTEM FAULT</p>
            <h1 className="mt-3 text-[25px] font-medium tracking-tight">
              The dashboard hit an unexpected error
            </h1>
            <p className="mt-3 text-xs leading-relaxed text-brand-muted">
              {this.state.error.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn btn-primary mt-5"
            >
              Reload dashboard ↗
            </button>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}
