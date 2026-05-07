import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where, doc, getDoc } from 'firebase/firestore';
import { Clock, CheckCircle, ShieldX, AlertTriangle, LoaderCircle } from 'lucide-react';
import { db } from '../../../services/firebaseClient';
import { adminApproveBooking, adminDeclineBooking } from '../../services/verification';

interface QueueEntry {
  id: string;
  bookingId: string;
  customerId: string | null;
  reasons: string[];
  status: 'pending' | 'approved' | 'declined';
  queuedAt: { toDate: () => Date } | null;
}

interface BookingPreview {
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  amount_total_due?: number;
  risk_score?: number;
  risk_level?: string;
}

const ReviewQueue: React.FC = () => {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [previews, setPreviews] = useState<Record<string, BookingPreview>>({});
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    const q = query(
      collection(db, 'manualReviewQueue'),
      where('status', '==', 'pending'),
      orderBy('queuedAt', 'asc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) })) as QueueEntry[];
        setEntries(list);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Lazily fetch booking previews
  useEffect(() => {
    const firestore = db;
    if (!firestore) return;
    entries.forEach(async (entry) => {
      if (previews[entry.bookingId]) return;
      try {
        const snap = await getDoc(doc(firestore, 'bookings', entry.bookingId));
        if (snap.exists()) {
          setPreviews(p => ({ ...p, [entry.bookingId]: snap.data() as BookingPreview }));
        }
      } catch { /* ignore */ }
    });
  }, [entries, previews]);

  const handleApprove = async (bookingId: string) => {
    setActingOn(bookingId);
    setError(null);
    try {
      await adminApproveBooking({ bookingId });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActingOn(null);
    }
  };

  const handleDecline = async (bookingId: string, addToDns: boolean) => {
    if (addToDns && !confirm('Decline AND add this customer to the Do-Not-Serve list? This is a privacy action with audit logging.')) {
      return;
    }
    setActingOn(bookingId);
    setError(null);
    try {
      await adminDeclineBooking({ bookingId, addToDns, dnsReason: 'Declined at manual review' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActingOn(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Clock className="h-5 w-5 text-orange-400" /> Manual Review Queue
        </h2>
        <span className="text-sm text-zinc-400">{entries.length} pending</span>
      </div>

      {error && (
        <div className="p-3 bg-red-900/40 border border-red-500/50 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-300 mt-0.5" />
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      {loading && <p className="text-zinc-400 flex items-center gap-2"><LoaderCircle className="animate-spin h-4 w-4" /> Loading…</p>}

      {!loading && entries.length === 0 && (
        <div className="card-base text-center py-12 text-zinc-400">
          No bookings awaiting review.
        </div>
      )}

      <div className="space-y-3">
        {entries.map(entry => {
          const preview = previews[entry.bookingId];
          const isActing = actingOn === entry.bookingId;
          return (
            <div key={entry.id} className="card-base !p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-zinc-500">Booking <span className="font-mono">{entry.bookingId}</span></p>
                  <p className="text-lg font-bold text-white mt-0.5">
                    {preview?.client_name || '(loading…)'}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {preview?.client_email} • {preview?.client_phone}
                  </p>
                </div>
                <div className="text-right">
                  {preview?.risk_score !== undefined && (
                    <span className={`px-2 py-1 rounded text-xs font-bold border ${
                      preview.risk_level === 'BLOCK' ? 'bg-red-900/30 border-red-500/40 text-red-300' :
                      preview.risk_level === 'REVIEW' ? 'bg-amber-900/30 border-amber-500/40 text-amber-300' :
                      'bg-green-900/30 border-green-500/40 text-green-300'
                    }`}>
                      Risk {preview.risk_score}
                    </span>
                  )}
                  {preview?.amount_total_due !== undefined && (
                    <p className="text-sm text-zinc-300 mt-1">${preview.amount_total_due.toFixed(2)}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {entry.reasons.map(r => (
                  <span key={r} className="px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {r.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
                <button
                  onClick={() => handleApprove(entry.bookingId)}
                  disabled={isActing}
                  className="btn-primary px-4 py-2 flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  {isActing ? <LoaderCircle className="animate-spin h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                  Approve
                </button>
                <button
                  onClick={() => handleDecline(entry.bookingId, false)}
                  disabled={isActing}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm disabled:opacity-50"
                >
                  Decline
                </button>
                <button
                  onClick={() => handleDecline(entry.bookingId, true)}
                  disabled={isActing}
                  className="px-4 py-2 rounded-lg bg-red-900/40 hover:bg-red-800/40 text-red-200 border border-red-500/40 text-sm disabled:opacity-50 flex items-center gap-1"
                >
                  <ShieldX className="h-4 w-4" />
                  Decline + DNS
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ReviewQueue;
