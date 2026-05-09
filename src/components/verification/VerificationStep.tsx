import React, { useEffect, useState } from 'react';
import { Phone, ShieldCheck, CheckCircle, AlertTriangle, LoaderCircle } from 'lucide-react';
import LivenessCheck from './LivenessCheck';
import {
  sendSmsOtp, verifySmsOtp, submitLivenessCheck, getCustomerVerificationStatus,
} from '../../services/verification';
import type { LivenessResult } from '../../lib/liveness';

interface VerificationStepProps {
  bookingId: string;
  phoneE164: string;
  onAllSignalsCleared: () => void;     // Called after smsOtp + (optional) liveness
  onCancel?: () => void;
}

type Phase = 'loading' | 'otp_send' | 'otp_verify' | 'liveness' | 'awaiting_payment' | 'cleared' | 'error';

export const VerificationStep: React.FC<VerificationStepProps> = ({
  bookingId, phoneE164, onAllSignalsCleared, onCancel,
}) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [requiredSignals, setRequiredSignals] = useState<{ smsOtp: boolean; liveness: boolean; payIdMatch: boolean } | null>(null);
  const [smsCleared, setSmsCleared] = useState(false);
  const [livenessCleared, setLivenessCleared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const status = await getCustomerVerificationStatus({ bookingId });
        setRequiredSignals(status.requiredSignals);
        setSmsCleared(status.signalsCleared.smsOtp);
        setLivenessCleared(status.signalsCleared.liveness);

        if (!status.requiredSignals.smsOtp) {
          // Trusted tier — just await PayID.
          setPhase('awaiting_payment');
          onAllSignalsCleared();
          return;
        }
        if (!status.signalsCleared.smsOtp) {
          setPhase('otp_send');
        } else if (status.requiredSignals.liveness && !status.signalsCleared.liveness) {
          setPhase('liveness');
        } else {
          setPhase('awaiting_payment');
          onAllSignalsCleared();
        }
      } catch (err) {
        setError((err as Error).message);
        setPhase('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const handleSendOtp = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await sendSmsOtp({ bookingId, phoneE164 });
      setPhase('otp_verify');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!/^\d{6}$/.test(otpCode)) {
      setError('Please enter the 6-digit code.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await verifySmsOtp({ bookingId, code: otpCode });
      setSmsCleared(true);
      if (requiredSignals?.liveness && !livenessCleared) {
        setPhase('liveness');
      } else {
        setPhase('awaiting_payment');
        onAllSignalsCleared();
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLivenessComplete = async (result: LivenessResult) => {
    setSubmitting(true);
    setError(null);
    try {
      await submitLivenessCheck({
        bookingId,
        embedding: result.embedding,
        livenessScore: result.livenessScore,
        ageEstimate: result.ageEstimate,
      });
      setLivenessCleared(true);
      setPhase('awaiting_payment');
      onAllSignalsCleared();
    } catch (err) {
      setError(friendlyError(err));
      setPhase('otp_verify'); // back-step
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-orange-400" />
        <h2 className="text-xl font-bold text-white">Quick Verification</h2>
      </div>

      <SignalIndicators
        requiredSignals={requiredSignals}
        smsCleared={smsCleared}
        livenessCleared={livenessCleared}
      />

      {error && (
        <div className="p-3 bg-red-900/40 border border-red-500/50 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-300 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      {phase === 'loading' && (
        <p className="text-zinc-400 flex items-center gap-2">
          <LoaderCircle className="animate-spin h-4 w-4" /> Checking what's needed for this booking…
        </p>
      )}

      {phase === 'otp_send' && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-300">
            We'll send a 6-digit code to <span className="font-mono text-white">{phoneE164}</span>.
          </p>
          <button
            onClick={handleSendOtp}
            disabled={submitting}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            {submitting ? <LoaderCircle className="animate-spin h-4 w-4" /> : <Phone className="h-4 w-4" />}
            Send code
          </button>
        </div>
      )}

      {phase === 'otp_verify' && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-300">Enter the 6-digit code we sent you.</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otpCode}
            onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="input-base text-center text-2xl tracking-[0.4em] font-mono"
            placeholder="000000"
          />
          <button
            onClick={handleVerifyOtp}
            disabled={submitting || otpCode.length !== 6}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            {submitting ? <LoaderCircle className="animate-spin h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
            Verify
          </button>
          <button
            type="button"
            onClick={handleSendOtp}
            disabled={submitting}
            className="text-sm text-zinc-400 hover:text-white"
          >
            Resend code
          </button>
        </div>
      )}

      {phase === 'liveness' && (
        <LivenessCheck
          onComplete={handleLivenessComplete}
          onCancel={() => onCancel?.()}
        />
      )}

      {phase === 'awaiting_payment' && (
        <div className="p-4 bg-green-900/30 border border-green-500/40 rounded-lg flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-400 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-white">Verification cleared.</p>
            <p className="text-xs text-green-200 mt-1">
              Your booking will be auto-confirmed once your PayID deposit is received and the
              account name matches.
            </p>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <button onClick={onCancel} className="btn-primary w-full py-3">Close</button>
      )}
    </div>
  );
};

function SignalIndicators({
  requiredSignals, smsCleared, livenessCleared,
}: {
  requiredSignals: { smsOtp: boolean; liveness: boolean; payIdMatch: boolean } | null;
  smsCleared: boolean;
  livenessCleared: boolean;
}) {
  if (!requiredSignals) return null;
  const items = [
    { label: 'SMS code', show: requiredSignals.smsOtp, done: smsCleared },
    { label: 'Liveness', show: requiredSignals.liveness, done: livenessCleared },
    { label: 'PayID match', show: requiredSignals.payIdMatch, done: false },
  ].filter(i => i.show);
  return (
    <div className="flex gap-2 flex-wrap">
      {items.map(item => (
        <span
          key={item.label}
          className={`px-3 py-1 rounded-full text-xs font-medium border ${
            item.done
              ? 'bg-green-900/30 border-green-500/50 text-green-300'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400'
          }`}
        >
          {item.done ? '✓ ' : '○ '}{item.label}
        </span>
      ))}
    </div>
  );
}

function friendlyError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: unknown }).message);
    if (msg.toLowerCase().includes('too many')) {
      return 'Too many attempts. Please wait 15 minutes and try again.';
    }
    if (msg.toLowerCase().includes('invalid or expired')) {
      return 'That code is invalid or has expired. Send a new one.';
    }
    return msg;
  }
  return 'Something went wrong. Please try again.';
}

export default VerificationStep;
