import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ToastProvider, useToast } from '../components/Toast';

function ToastTrigger({ type, message }: { type: 'success' | 'error' | 'info' | 'warning'; message: string }) {
  const { toast } = useToast();
  return <button onClick={() => toast(type, message)}>Show Toast</button>;
}

describe('ToastProvider', () => {
  it('renders children', () => {
    render(
      <ToastProvider>
        <div>Hello</div>
      </ToastProvider>
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('shows a success toast when triggered', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastTrigger type="success" message="Payment confirmed" />
      </ToastProvider>
    );

    await user.click(screen.getByText('Show Toast'));
    expect(screen.getByText('Payment confirmed')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows an error toast', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastTrigger type="error" message="Something failed" />
      </ToastProvider>
    );

    await user.click(screen.getByText('Show Toast'));
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('shows multiple toasts', async () => {
    const user = userEvent.setup();

    function MultiTrigger() {
      const { toast } = useToast();
      return (
        <>
          <button onClick={() => toast('success', 'Toast A')}>Trigger A</button>
          <button onClick={() => toast('error', 'Toast B')}>Trigger B</button>
        </>
      );
    }

    render(
      <ToastProvider>
        <MultiTrigger />
      </ToastProvider>
    );

    await user.click(screen.getByText('Trigger A'));
    await user.click(screen.getByText('Trigger B'));
    expect(screen.getByText('Toast A')).toBeInTheDocument();
    expect(screen.getByText('Toast B')).toBeInTheDocument();
  });

  it('dismisses toast on X button click', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ToastProvider>
        <ToastTrigger type="info" message="Dismissible" />
      </ToastProvider>
    );

    await user.click(screen.getByText('Show Toast'));
    expect(screen.getByText('Dismissible')).toBeInTheDocument();

    // Click dismiss button
    const dismissButtons = screen.getAllByRole('button').filter(b => b.closest('[role="alert"]'));
    await user.click(dismissButtons[0]);

    // After exit animation
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.queryByText('Dismissible')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('throws when useToast is used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ToastTrigger type="info" message="oops" />)).toThrow(
      'useToast must be used within ToastProvider'
    );
    spy.mockRestore();
  });
});
