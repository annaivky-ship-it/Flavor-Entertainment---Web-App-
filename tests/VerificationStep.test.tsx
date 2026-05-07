import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VerificationStep from '../src/components/verification/VerificationStep';

// Mock the verification service module BEFORE the component imports it
const mockSendOtp = vi.fn();
const mockVerifyOtp = vi.fn();
const mockGetStatus = vi.fn();
const mockSubmitLiveness = vi.fn();

vi.mock('../src/services/verification', () => ({
  sendSmsOtp: (data: any) => mockSendOtp(data),
  verifySmsOtp: (data: any) => mockVerifyOtp(data),
  submitLivenessCheck: (data: any) => mockSubmitLiveness(data),
  getCustomerVerificationStatus: (data: any) => mockGetStatus(data),
}));

// Stub the LivenessCheck component so we don't need real cameras/face-api.js in tests
vi.mock('../src/components/verification/LivenessCheck', () => ({
  default: ({ onComplete }: { onComplete: (r: any) => void }) => (
    <button onClick={() => onComplete({ embedding: Array(128).fill(0.1), livenessScore: 0.9, ageEstimate: 30 })}>
      mock-liveness-complete
    </button>
  ),
}));

beforeEach(() => {
  mockSendOtp.mockReset();
  mockVerifyOtp.mockReset();
  mockGetStatus.mockReset();
  mockSubmitLiveness.mockReset();
});

describe('VerificationStep', () => {
  it('skips OTP for trusted customers and signals payment-only', async () => {
    mockGetStatus.mockResolvedValue({
      trustTier: 'trusted',
      requiredSignals: { smsOtp: false, liveness: false, payIdMatch: true },
      signalsCleared: { smsOtp: false, liveness: false, payIdMatch: false },
      verificationStatus: 'pending',
    });
    const onCleared = vi.fn();
    render(<VerificationStep bookingId="b1" phoneE164="+61400000000" onAllSignalsCleared={onCleared} />);

    await waitFor(() => expect(onCleared).toHaveBeenCalled());
    expect(mockSendOtp).not.toHaveBeenCalled();
    expect(screen.getByText(/Verification cleared/i)).toBeInTheDocument();
  });

  it('shows the SMS-OTP send step for unverified customers', async () => {
    mockGetStatus.mockResolvedValue({
      trustTier: 'unverified',
      requiredSignals: { smsOtp: true, liveness: false, payIdMatch: true },
      signalsCleared: { smsOtp: false, liveness: false, payIdMatch: false },
      verificationStatus: 'pending',
    });

    render(<VerificationStep bookingId="b1" phoneE164="+61400000000" onAllSignalsCleared={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Send code/i)).toBeInTheDocument());
    expect(screen.getByText(/\+61400000000/)).toBeInTheDocument();
  });

  it('sends OTP, then shows verify step, then succeeds', async () => {
    mockGetStatus.mockResolvedValue({
      trustTier: 'unverified',
      requiredSignals: { smsOtp: true, liveness: false, payIdMatch: true },
      signalsCleared: { smsOtp: false, liveness: false, payIdMatch: false },
      verificationStatus: 'pending',
    });
    mockSendOtp.mockResolvedValue({ success: true, expiresInSeconds: 600 });
    mockVerifyOtp.mockResolvedValue({ success: true });

    const onCleared = vi.fn();
    render(<VerificationStep bookingId="b1" phoneE164="+61400000000" onAllSignalsCleared={onCleared} />);
    await waitFor(() => screen.getByText(/Send code/i));
    fireEvent.click(screen.getByText(/Send code/i));

    await waitFor(() => screen.getByPlaceholderText('000000'));
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify'));

    await waitFor(() => expect(onCleared).toHaveBeenCalled());
    expect(mockVerifyOtp).toHaveBeenCalledWith({ bookingId: 'b1', code: '123456' });
  });

  it('renders rate-limit error in friendly form', async () => {
    mockGetStatus.mockResolvedValue({
      trustTier: 'unverified',
      requiredSignals: { smsOtp: true, liveness: false, payIdMatch: true },
      signalsCleared: { smsOtp: false, liveness: false, payIdMatch: false },
      verificationStatus: 'pending',
    });
    mockSendOtp.mockRejectedValue(new Error('Too many code requests. Try again in 15 minutes.'));

    render(<VerificationStep bookingId="b1" phoneE164="+61400000000" onAllSignalsCleared={vi.fn()} />);
    await waitFor(() => screen.getByText(/Send code/i));
    fireEvent.click(screen.getByText(/Send code/i));

    await waitFor(() => screen.getByText(/Too many attempts. Please wait 15 minutes/i));
  });

  it('progresses to liveness when premium tier requires it', async () => {
    mockGetStatus.mockResolvedValue({
      trustTier: 'unverified',
      requiredSignals: { smsOtp: true, liveness: true, payIdMatch: true },
      signalsCleared: { smsOtp: true, liveness: false, payIdMatch: false },
      verificationStatus: 'pending',
    });
    mockSubmitLiveness.mockResolvedValue({ success: true });

    const onCleared = vi.fn();
    render(<VerificationStep bookingId="b1" phoneE164="+61400000000" onAllSignalsCleared={onCleared} />);

    await waitFor(() => screen.getByText('mock-liveness-complete'));
    fireEvent.click(screen.getByText('mock-liveness-complete'));

    await waitFor(() => expect(onCleared).toHaveBeenCalled());
    expect(mockSubmitLiveness).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'b1', livenessScore: 0.9, ageEstimate: 30 }),
    );
  });
});
