import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgeGate from '../components/AgeGate';

const renderAgeGate = () => {
  const onVerified = vi.fn();
  const onShowPrivacyPolicy = vi.fn();
  const onShowTermsOfService = vi.fn();
  const utils = render(
    <AgeGate
      onVerified={onVerified}
      onShowPrivacyPolicy={onShowPrivacyPolicy}
      onShowTermsOfService={onShowTermsOfService}
    />
  );
  return { onVerified, onShowPrivacyPolicy, onShowTermsOfService, ...utils };
};

describe('AgeGate', () => {
  it('renders the age verification form', () => {
    renderAgeGate();
    expect(screen.getByText('Age Verification')).toBeInTheDocument();
    expect(screen.getByText('Confirm & Enter')).toBeInTheDocument();
  });

  it('shows error when verifying without date of birth', () => {
    const { onVerified } = renderAgeGate();

    // Check the terms checkbox first
    const checkbox = screen.getByLabelText(/I agree to the/);
    fireEvent.click(checkbox);

    // Click verify without filling DOB
    fireEvent.click(screen.getByText('Confirm & Enter'));

    expect(screen.getByText('Please enter your full date of birth.')).toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('blocks underage users', () => {
    const { onVerified } = renderAgeGate();

    // Select a recent DOB (underage)
    const currentYear = new Date().getFullYear();
    const daySelect = screen.getAllByRole('combobox')[0];
    const monthSelect = screen.getAllByRole('combobox')[1];
    const yearSelect = screen.getAllByRole('combobox')[2];

    fireEvent.change(daySelect, { target: { value: '15' } });
    fireEvent.change(monthSelect, { target: { value: '6' } });
    fireEvent.change(yearSelect, { target: { value: String(currentYear - 16) } });

    // Agree to terms
    const checkbox = screen.getByLabelText(/I agree to the/);
    fireEvent.click(checkbox);

    fireEvent.click(screen.getByText('Confirm & Enter'));

    expect(screen.getByText('You must be at least 18 years old to enter this site.')).toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('allows adult users through', () => {
    const { onVerified } = renderAgeGate();

    const currentYear = new Date().getFullYear();
    const daySelect = screen.getAllByRole('combobox')[0];
    const monthSelect = screen.getAllByRole('combobox')[1];
    const yearSelect = screen.getAllByRole('combobox')[2];

    fireEvent.change(daySelect, { target: { value: '15' } });
    fireEvent.change(monthSelect, { target: { value: '1' } });
    fireEvent.change(yearSelect, { target: { value: String(currentYear - 25) } });

    const checkbox = screen.getByLabelText(/I agree to the/);
    fireEvent.click(checkbox);

    fireEvent.click(screen.getByText('Confirm & Enter'));

    expect(onVerified).toHaveBeenCalled();
  });

  it('disables button when terms not agreed', () => {
    renderAgeGate();
    const button = screen.getByText('Confirm & Enter');
    expect(button).toBeDisabled();
  });
});
