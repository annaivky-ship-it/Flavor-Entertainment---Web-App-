import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import AgeGate from '../components/AgeGate';

describe('AgeGate', () => {
  const defaultProps = {
    onVerified: vi.fn(),
    onShowPrivacyPolicy: vi.fn(),
    onShowTermsOfService: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders age verification form', () => {
    render(<AgeGate {...defaultProps} />);
    expect(screen.getByText(/age verification/i)).toBeInTheDocument();
    expect(screen.getByText(/Confirm & Enter/i)).toBeInTheDocument();
  });

  it('button is disabled when terms not agreed', () => {
    render(<AgeGate {...defaultProps} />);
    const btn = screen.getByText(/Confirm & Enter/i);
    expect(btn).toBeDisabled();
  });

  it('shows error when DOB fields are empty and terms agreed', async () => {
    const user = userEvent.setup();
    render(<AgeGate {...defaultProps} />);

    // Check the terms checkbox via its id
    const checkbox = document.getElementById('terms-check') as HTMLInputElement;
    await user.click(checkbox);

    const verifyBtn = screen.getByText(/Confirm & Enter/i);
    await user.click(verifyBtn);

    expect(screen.getByText(/enter your full date of birth/i)).toBeInTheDocument();
    expect(defaultProps.onVerified).not.toHaveBeenCalled();
  });

  it('rejects underage user', async () => {
    const user = userEvent.setup();
    render(<AgeGate {...defaultProps} />);

    // Select DOB for a 10-year-old using the select elements by their placeholder options
    const selects = document.querySelectorAll('select');
    const [daySelect, monthSelect, yearSelect] = selects;

    const currentYear = new Date().getFullYear();
    await user.selectOptions(daySelect, '15');
    await user.selectOptions(monthSelect, '6');
    await user.selectOptions(yearSelect, String(currentYear - 10));

    // Agree to terms
    const checkbox = document.getElementById('terms-check') as HTMLInputElement;
    await user.click(checkbox);

    await user.click(screen.getByText(/Confirm & Enter/i));

    expect(screen.getByText(/must be at least 18/i)).toBeInTheDocument();
    expect(defaultProps.onVerified).not.toHaveBeenCalled();
  });

  it('accepts adult user', async () => {
    const onVerified = vi.fn();
    const user = userEvent.setup();
    render(<AgeGate {...defaultProps} onVerified={onVerified} />);

    const selects = document.querySelectorAll('select');
    const [daySelect, monthSelect, yearSelect] = selects;

    const currentYear = new Date().getFullYear();
    await user.selectOptions(daySelect, '15');
    await user.selectOptions(monthSelect, '1');
    await user.selectOptions(yearSelect, String(currentYear - 25));

    const checkbox = document.getElementById('terms-check') as HTMLInputElement;
    await user.click(checkbox);

    await user.click(screen.getByText(/Confirm & Enter/i));

    expect(onVerified).toHaveBeenCalled();
  });
});
