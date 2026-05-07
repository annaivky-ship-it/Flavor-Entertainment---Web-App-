import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Wallet, CheckCircle, AlertTriangle, LoaderCircle, X } from 'lucide-react';
import { db } from '../../../services/firebaseClient';
import { adminConfirmPayIdDeposit } from '../../services/verification';

interface PendingBooking {
  id: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  bookingReference?: string;
  payid_reference?: string;
  amount_deposit?: number;
  depositAmount?: number;
  amount_total_due?: number;
  created_at?: { toDate: () => Date } | null;
  expiresAt?: { toDate: () => Date } | null;
}

const PayIdConfirmQueue: React.FC = () => {
  const [bookings, setBookings] = useState<PendingBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<PendingBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ payerName: '', nameMatches: true, amountReceived: '', notes: '' });

  useEffect(() => {
    if (!db) return;
    const q = query(
      collection(db, 'bookings'),
      where('status', '==', 'deposit_pending'),
      orderBy('created_at', 'asc')
    );
    const unsub = onSnapshot(
      q,
      snap => {
        setBookings(snap.docs.map(d => ({ id: d.id, ...(d.data() as object) })) as PendingBooking[]);
        setLoading(false);
      },
      err => {
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const open = (b: PendingBooking) => {
    setActive(b);
    setForm({
      payerName: '',
      nameMatches: true,
      amountReceived: String(b.depositAmount ?? b.amount_deposit ?? ''),
      notes: '',
    });
    setError(null);
  };

  const submit = async () => {
    if (!active) return;
    if (!form.payerName.trim()) {
      setError('Enter the bank-supplied payer name from your statement.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await adminConfirmPayIdDeposit({
        bookingId: active.id,
        payerName: form.payerName.trim(),
        nameMatches: form.nameMatches,
        amountReceived: form.amountReceived ? Number(form.amountReceived) : undefined,
        notes: form.notes || undefined,
      });
      setActive(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Wallet className="h-5 w-5 text-orange-400" /> PayID Deposits Awaiting Confirmation
        </h2>
        <span className="text-sm text-zinc-400">{bookings.length} pending</span>
      </div>

      <p className="text-sm text-zinc-400">
        Open your business banking app. For each deposit you can see, click the matching booking
        below and enter the <strong>exact name</strong> shown on your statement. The platform
        records this name as a verification signal — match it carefully.
      </p>

      {error && !active && (
        <div className="p-3 bg-red-900/40 border border-red-500/50 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-300 mt-0.5" />
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      {loading && (
        <p className="text-zinc-400 flex items-center gap-2">
          <LoaderCircle className="animate-spin h-4 w-4" /> Loading…
        </p>
      )}

      {!loading && bookings.length === 0 && (
        <div className="card-base text-center py-12 text-zinc-400">No deposits awaiting confirmation.</div>
      )}

      <div className="space-y-2">
        {bookings.map(b => (
          <div key={b.id} className="card-base !p-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-500">
                Ref <span className="font-mono text-zinc-300">{b.bookingReference || b.payid_reference || b.id}</span>
              </p>
              <p className="text-base font-bold text-white truncate">{b.client_name}</p>
              <p className="text-xs text-zinc-400 truncate">
                {b.client_email} • {b.client_phone}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-orange-300">
                ${(b.depositAmount ?? b.amount_deposit ?? 0).toFixed(2)}
              </p>
              <button onClick={() => open(b)} className="btn-primary px-3 py-1.5 text-sm mt-1">
                Confirm
              </button>
            </div>
          </div>
        ))}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="font-bold text-white">Confirm PayID deposit</h3>
              <button onClick={() => setActive(null)} className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="text-sm text-zinc-400 space-y-1">
                <p>
                  Booking <span className="font-mono text-zinc-200">{active.bookingReference || active.id}</span>
                </p>
                <p>
                  Client name on booking: <strong className="text-white">{active.client_name}</strong>
                </p>
                <p>
                  Expected amount: <strong className="text-orange-300">${(active.depositAmount ?? active.amount_deposit ?? 0).toFixed(2)}</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Bank-supplied payer name</label>
                <input
                  className="input-base"
                  placeholder="Exact name from your bank statement"
                  value={form.payerName}
                  onChange={e => setForm(f => ({ ...f, payerName: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Amount received</label>
                <input
                  className="input-base"
                  type="number"
                  step="0.01"
                  value={form.amountReceived}
                  onChange={e => setForm(f => ({ ...f, amountReceived: e.target.value }))}
                />
              </div>

              <label className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-700 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.nameMatches}
                  onChange={e => setForm(f => ({ ...f, nameMatches: e.target.checked }))}
                />
                <span className="text-sm text-zinc-200">
                  Bank-supplied name matches the booking name
                  <span className="block text-xs text-zinc-500">
                    Untick if there's a mismatch — booking will go to manual review.
                  </span>
                </span>
              </label>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Notes (optional, audited)</label>
                <textarea
                  className="input-base h-16"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {error && (
                <div className="p-2 bg-red-900/40 border border-red-500/50 rounded flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-300 mt-0.5" />
                  <p className="text-sm text-red-200">{error}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-zinc-800">
                <button onClick={() => setActive(null)} className="flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700">
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="flex-1 btn-primary py-2 flex items-center justify-center gap-2"
                >
                  {submitting ? <LoaderCircle className="animate-spin h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                  Confirm payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayIdConfirmQueue;
