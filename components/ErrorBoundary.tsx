import React, { Component, ErrorInfo, ReactNode } from 'react';
import { captureException } from '../services/errorTracking';

interface Props {
  children?: ReactNode;
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
    captureException(error, { componentStack: errorInfo.componentStack ?? undefined });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
          <div className="card-base max-w-lg w-full text-center p-8">
            <h1 className="text-3xl font-bold text-red-500 mb-4">Something went wrong</h1>
            <p className="text-zinc-400 mb-6">An unexpected error occurred. Please try refreshing the page.</p>
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
