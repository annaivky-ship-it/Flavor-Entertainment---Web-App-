import React, { useState } from 'react';
import { Flag, X, AlertTriangle, LoaderCircle } from 'lucide-react';
import { performerFlagCustomer, type FlagReason } from '../../services/verification';

interface FlagCustomerButtonProps {
  bookingId: string;
}

const REASONS: { value: FlagReason; label: string }[] = [
  { value: 'no_show', label: 'No-show' },
  { value: 'breached_no_touch', label: 'Breached no-touch policy' },
  { value: 'intoxicated_aggressive', label: 'Intoxicated / aggressive' },
  { value: 'refused_payment', label: 'Refused payment' },
  { value: 'safety_concern', label: 'Safety concern (other)' },
  { value: 'other', label: 'Other (notes required)' },
];

const FlagCustomerButton: React.FC<FlagCustomerButtonProps> = ({ bookingId }) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!reason) return;
    if (reason === 'other' && notes.trim().length < 10) {
      setError('Please describe what happened (10+ chars).');
      return;
    }
    setSubmitting(true); setError(null);
    try {
      await performerFlagCustomer({ bookingId, reason, notes: notes || undefined });
      setDone(true);
      setTimeout(() => { setOpen(false); setDone(false); setReason(null); setNotes(''); }, 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-xs rounded-md bg-red-900/30 hover:bg-red-800/40 text-red-200 border border-red-500/40 flex items-center gap-1"
      >
        <Flag className="h-3 w-3" /> Flag customer
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Flag className="h-4 w-4 text-red-400" /> Flag this customer
              </h3>
              <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {done ? (
                <p className="text-sm text-green-300">Flagged. Admin will review.</p>
              ) : (
                <>
                  <p className="text-sm text-zinc-300">
                    Flagging adds the customer's contact details (hashed) to the safety register.
                    The customer is not notified.
                  </p>

                  <div className="space-y-2">
                    {REASONS.map(r => (
                      <label key={r.value} className="flex items-center gap-3 p-2.5 bg-zinc-900 border border-zinc-800 rounded cursor-pointer hover:border-orange-500/40">
                        <input
                          type="radio"
                          name="flag-reason"
                          checked={reason === r.value}
                          onChange={() => setReason(r.value)}
                        />
                        <span className="text-sm text-zinc-200">{r.label}</span>
                      </label>
                    ))}
                  </div>

                  <textarea
                    placeholder="Notes (optional, required if 'Other')"
                    className="input-base h-20"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />

                  {error && (
                    <div className="p-2 bg-red-900/40 border border-red-500/50 rounded flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-300 mt-0.5" />
                      <p className="text-sm text-red-200">{error}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => setOpen(false)} className="flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700">
                      Cancel
                    </button>
                    <button
                      onClick={submit}
                      disabled={!reason || submitting}
                      className="flex-1 py-2 rounded-lg bg-red-900/40 hover:bg-red-800/40 text-red-200 border border-red-500/40 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {submitting && <LoaderCircle className="animate-spin h-4 w-4" />} Submit flag
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FlagCustomerButton;
