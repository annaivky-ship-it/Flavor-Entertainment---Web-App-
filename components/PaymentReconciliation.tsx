import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, where, limit } from 'firebase/firestore';
import { db } from '../services/firebaseClient';
import type { Booking, PaymentEvent } from '../types';
import { AlertTriangle, CheckCircle, Clock, DollarSign, XCircle, Search, RefreshCcw, Eye } from 'lucide-react';
import { calculateBookingCost } from '../utils/bookingUtils';

interface PaymentReconciliationProps {
  bookings: Booking[];
}

const statusBadge = (status: string) => {
  switch (status) {
    case 'matched':
      return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-500/20 text-green-300 border border-green-500/30">Matched</span>;
    case 'unmatched':
      return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-300 border border-red-500/30">Unmatched</span>;
    case 'amount_mismatch':
      return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">Amount Mismatch</span>;
    case 'already_paid':
      return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">Already Paid</span>;
    case 'booking_not_pending':
      return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">Not Pending</span>;
    case 'error':
      return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-300 border border-red-500/30">Error</span>;
    default:
      return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-zinc-500/20 text-zinc-300 border border-zinc-500/30">{status}</span>;
  }
};

const PaymentReconciliation: React.FC<PaymentReconciliationProps> = ({ bookings }) => {
  const [paymentEvents, setPaymentEvents] = useState<PaymentEvent[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  // Subscribe to payment_events collection
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'payment_events'), orderBy('createdAt', 'desc'), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      const events = snap.docs.map(d => ({ ...d.data(), id: d.id })) as PaymentEvent[];
      setPaymentEvents(events);
    }, (err) => {
      console.warn('Payment events subscription error:', err.message);
    });
    return () => unsub();
  }, []);

  const filteredEvents = filterStatus
    ? paymentEvents.filter(e => e.status === filterStatus)
    : paymentEvents;

  // Summary counts
  const matchedCount = paymentEvents.filter(e => e.status === 'matched').length;
  const unmatchedCount = paymentEvents.filter(e => e.status === 'unmatched').length;
  const mismatchCount = paymentEvents.filter(e => e.status === 'amount_mismatch').length;
  const alreadyPaidCount = paymentEvents.filter(e => e.status === 'already_paid').length;

  // Booking summaries
  const pendingPaymentBookings = bookings.filter(b => b.status === 'deposit_pending');
  const expiredBookings = bookings.filter(b => b.status === 'expired');
  const reviewBookings = bookings.filter(b => b.status === 'payment_review');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <button onClick={() => setFilterStatus('')} className={`card-base !p-4 text-center cursor-pointer transition-all ${!filterStatus ? 'ring-2 ring-orange-500' : ''}`}>
          <p className="text-2xl font-bold text-white">{paymentEvents.length}</p>
          <p className="text-[10px] text-zinc-500 uppercase font-bold">Total Events</p>
        </button>
        <button onClick={() => setFilterStatus('matched')} className={`card-base !p-4 text-center cursor-pointer transition-all ${filterStatus === 'matched' ? 'ring-2 ring-green-500' : ''}`}>
          <p className="text-2xl font-bold text-green-400">{matchedCount}</p>
          <p className="text-[10px] text-zinc-500 uppercase font-bold">Matched</p>
        </button>
        <button onClick={() => setFilterStatus('unmatched')} className={`card-base !p-4 text-center cursor-pointer transition-all ${filterStatus === 'unmatched' ? 'ring-2 ring-red-500' : ''}`}>
          <p className="text-2xl font-bold text-red-400">{unmatchedCount}</p>
          <p className="text-[10px] text-zinc-500 uppercase font-bold">Unmatched</p>
        </button>
        <button onClick={() => setFilterStatus('amount_mismatch')} className={`card-base !p-4 text-center cursor-pointer transition-all ${filterStatus === 'amount_mismatch' ? 'ring-2 ring-yellow-500' : ''}`}>
          <p className="text-2xl font-bold text-yellow-400">{mismatchCount}</p>
          <p className="text-[10px] text-zinc-500 uppercase font-bold">Mismatched</p>
        </button>
        <button onClick={() => setFilterStatus('already_paid')} className={`card-base !p-4 text-center cursor-pointer transition-all ${filterStatus === 'already_paid' ? 'ring-2 ring-blue-500' : ''}`}>
          <p className="text-2xl font-bold text-blue-400">{alreadyPaidCount}</p>
          <p className="text-[10px] text-zinc-500 uppercase font-bold">Duplicates</p>
        </button>
        <div className="card-base !p-4 text-center">
          <p className="text-2xl font-bold text-orange-400">{pendingPaymentBookings.length}</p>
          <p className="text-[10px] text-zinc-500 uppercase font-bold">Awaiting Pay</p>
        </div>
        <div className="card-base !p-4 text-center">
          <p className="text-2xl font-bold text-zinc-400">{expiredBookings.length}</p>
          <p className="text-[10px] text-zinc-500 uppercase font-bold">Expired</p>
        </div>
      </div>

      {/* Review Bookings Alert */}
      {reviewBookings.length > 0 && (
        <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-yellow-200">{reviewBookings.length} booking(s) need manual payment review</p>
            <div className="mt-2 space-y-1">
              {reviewBookings.map(b => (
                <p key={b.id} className="text-xs text-yellow-300/80">
                  {b.bookingReference || b.id} — {b.client_name} — Amount mismatch detected
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pending Payment Bookings */}
      {pendingPaymentBookings.length > 0 && (
        <div className="card-base !p-0">
          <h3 className="text-lg font-semibold text-white p-6 pb-3 flex items-center gap-2">
            <Clock size={18} className="text-orange-400" />
            Awaiting Payment ({pendingPaymentBookings.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-zinc-400">
              <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Deposit Due</th>
                  <th className="px-4 py-3">Expires</th>
                </tr>
              </thead>
              <tbody>
                {pendingPaymentBookings.map(b => {
                  const { depositAmount } = calculateBookingCost(b.duration_hours, b.services_requested || [], 1);
                  const expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
                  const isExpiringSoon = expiresAt && (expiresAt.getTime() - Date.now()) < 10 * 60 * 1000;
                  return (
                    <tr key={b.id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                      <td className="px-4 py-3 font-mono font-bold text-orange-400">{b.bookingReference || '—'}</td>
                      <td className="px-4 py-3 text-white">{b.client_name}</td>
                      <td className="px-4 py-3 font-bold">${(b.depositAmount || depositAmount || 0).toFixed(2)}</td>
                      <td className={`px-4 py-3 ${isExpiringSoon ? 'text-red-400 font-bold' : 'text-zinc-400'}`}>
                        {expiresAt ? expiresAt.toLocaleTimeString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment Events Table */}
      <div className="card-base !p-0">
        <div className="p-6 pb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <DollarSign size={18} className="text-orange-400" />
            Payment Events
          </h3>
          {filterStatus && (
            <button onClick={() => setFilterStatus('')} className="text-xs text-zinc-400 hover:text-white flex items-center gap-1">
              <XCircle size={12} /> Clear filter
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-zinc-400">
            <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50">
              <tr>
                <th className="px-4 py-3">Transaction ID</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length > 0 ? filteredEvents.map(event => (
                <React.Fragment key={event.id}>
                  <tr className="border-b border-zinc-800 hover:bg-zinc-800/50">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-300 max-w-[150px] truncate">{event.transactionId || '—'}</td>
                    <td className="px-4 py-3 font-mono font-bold text-orange-400">{event.bookingReference || '—'}</td>
                    <td className="px-4 py-3 font-bold text-white">${(event.amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">{statusBadge(event.status)}</td>
                    <td className="px-4 py-3 text-xs max-w-[200px] truncate" title={event.processingResult || ''}>{event.processingResult || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
                        className="text-zinc-500 hover:text-white transition-colors"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                  {expandedEvent === event.id && (
                    <tr className="border-b border-zinc-800">
                      <td colSpan={6} className="px-4 py-3">
                        <pre className="text-[10px] text-zinc-400 bg-zinc-950 p-3 rounded-lg overflow-x-auto max-h-48 overflow-y-auto">
                          {JSON.stringify(event.rawPayload, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )) : (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-zinc-500">
                    {filterStatus ? 'No events match this filter.' : 'No payment events received yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PaymentReconciliation;
