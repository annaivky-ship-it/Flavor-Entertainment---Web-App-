import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  /** Custom fallback UI shown instead of the default full-page error screen */
  fallback?: ReactNode;
  /** Label used in the inline error card (e.g. "Bookings", "Dashboard") */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Stripped from production builds by vite esbuild.drop
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      // Inline card for section-level boundaries (lazy routes)
      if (this.props.label) {
        return (
          <div className="flex items-center justify-center py-20 px-4">
            <div className="card-base max-w-md w-full text-center p-8">
              <p className="text-red-400 font-semibold mb-2">Failed to load {this.props.label}</p>
              <p className="text-zinc-500 text-sm mb-4">
                {this.state.error?.message ?? 'An unexpected error occurred.'}
              </p>
              <button
                className="btn-primary !px-6"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try again
              </button>
            </div>
          </div>
        );
      }

      // Full-page fallback
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
          <div className="card-base max-w-lg w-full text-center p-8">
            <h1 className="text-3xl font-bold text-red-500 mb-4">Something went wrong</h1>
            <p className="text-zinc-400 mb-6">An unexpected error occurred. Our team has been notified.</p>
            {this.state.error && (
              <pre className="text-left bg-zinc-900 p-4 rounded-lg text-sm text-red-400 overflow-auto mb-6">
                {this.state.error.message}
              </pre>
            )}
            <button
              className="btn-primary"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
