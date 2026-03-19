import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Suppress React error boundary console output during tests
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalError;
});

function ThrowingComponent({ error }: { error?: Error }) {
  if (error) throw error;
  return <div>No error</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error('Test crash')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test crash')).toBeInTheDocument();
  });

  it('shows a refresh button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error('crash')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Refresh Page')).toBeInTheDocument();
  });

  it('does not claim team has been notified', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error('crash')} />
      </ErrorBoundary>
    );
    expect(screen.queryByText(/team has been notified/i)).not.toBeInTheDocument();
  });
});
