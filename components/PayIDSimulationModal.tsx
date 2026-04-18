import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Shield, Building2, X, PartyPopper, User, Calendar, MapPin, Copy, Clock, LoaderCircle, AlertTriangle } from 'lucide-react';
import { PAY_ID_NAME, PAY_ID_EMAIL, BOOKING_PAYMENT_HOLD_MINUTES } from '../constants';

interface PayIDPaymentModalProps {
  amount: number;
  totalAmount: number;
  performerNames: string;
  eventType: string;
  eventDate: string;
  eventAddress: string;
  bookingReference: string;
  paymentStatus?: string;
  expiresAt?: string | null;
  onPaymentSuccess: () => void;
  onClose: () => void;
}

const CopyButton: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS
      const el = document.createElement('textarea');
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all"
      title={`Copy ${label}`}
    >
      <Copy size={10} />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
};

const CountdownTimer: React.FC<{ expiresAt: string | null }> = ({ expiresAt }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!expiresAt) {
      setTimeLeft(`${BOOKING_PAYMENT_HOLD_MINUTES}:00`);
      return;
    }

    const target = new Date(expiresAt).getTime();

    const update = () => {
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft('Expired');
        return;
      }

      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <div className={`flex items-center gap-1.5 text-sm font-mono font-bold ${isExpired ? 'text-red-400' : 'text-orange-400'}`}>
      <Clock size={14} />
      <span>{timeLeft}</span>
    </div>
  );
};

const PayIDSimulationModal: React.FC<PayIDPaymentModalProps> = ({
  amount,
  totalAmount,
  performerNames,
  eventType,
  eventDate,
  eventAddress,
  bookingReference,
  paymentStatus,
  expiresAt,
  onPaymentSuccess,
  onClose,
}) => {
  // If payment is confirmed (detected via real-time listener), show success
  const isConfirmed = paymentStatus === 'paid' || paymentStatus === 'deposit_paid';
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (isConfirmed && !showSuccess) {
      setShowSuccess(true);
      const timer = setTimeout(() => {
        onPaymentSuccess();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isConfirmed]);

  const SuccessContent = () => (
    <div className="flex flex-col items-center justify-center text-center h-[450px]">
      <div className="bg-green-500/20 p-4 rounded-full mb-4 animate-fade-in">
        <CheckCircle className="h-16 w-16 text-green-500" />
      </div>
      <p className="mt-4 text-zinc-100 font-bold text-2xl">Payment Confirmed!</p>
      <p className="text-zinc-400 mt-2 max-w-xs">Your deposit has been received and your booking is now confirmed.</p>
    </div>
  );

  const WaitingContent = () => (
    <>
      <div className="mb-5">
        <h3 className="text-lg font-bold text-white border-b border-zinc-800 pb-3 flex items-center gap-2">
          <Shield className="h-5 w-5 text-orange-400" />
          PayID Deposit Payment
        </h3>
        <div className="mt-4 bg-zinc-950/50 rounded-xl p-4 space-y-3 border border-zinc-800/50 text-sm">
          <div className="flex justify-between items-start">
            <span className="text-zinc-500 flex items-center gap-1.5 min-w-[100px]"><User size={14} /> Performer:</span>
            <span className="text-zinc-200 font-semibold text-right">{performerNames}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-500 flex items-center gap-1.5 min-w-[100px]"><PartyPopper size={14} /> Event:</span>
            <span className="text-zinc-200 font-semibold">{eventType}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-500 flex items-center gap-1.5 min-w-[100px]"><Calendar size={14} /> Date:</span>
            <span className="text-zinc-200 font-semibold">{new Date(eventDate).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between items-start">
            <span className="text-zinc-500 flex items-center gap-1.5 min-w-[100px]"><MapPin size={14} /> Location:</span>
            <span className="text-zinc-200 font-semibold text-right truncate max-w-[180px]">{eventAddress}</span>
          </div>
        </div>
      </div>

      {/* Booking hold timer */}
      <div className="flex items-center justify-between mb-5 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800">
        <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider">Booking Hold Expires</span>
        <CountdownTimer expiresAt={expiresAt || null} />
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-zinc-800/40 p-3 rounded-lg border border-zinc-800">
          <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Total Value</p>
          <p className="text-lg font-bold text-zinc-300">${(totalAmount || 0).toFixed(2)}</p>
        </div>
        <div className="bg-orange-500/10 p-3 rounded-lg border border-orange-500/20">
          <p className="text-[10px] text-orange-500/70 uppercase font-bold tracking-wider">Deposit Due</p>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-black text-white">${(amount || 0).toFixed(2)}</p>
            <CopyButton value={(amount || 0).toFixed(2)} label="amount" />
          </div>
        </div>
      </div>

      {/* PayID details */}
      <div className="mb-4">
        <p className="text-xs text-zinc-500 mb-2 uppercase tracking-widest font-bold">Transfer To (PayID)</p>
        <div className="bg-zinc-950 p-4 rounded-xl border border-orange-500/20 flex items-center gap-4 relative overflow-hidden group">
          <div className="absolute inset-0 bg-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="w-12 h-12 bg-orange-500 text-white rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/20">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="overflow-hidden relative z-10 flex-1">
            <p className="font-black text-white truncate uppercase tracking-tight">{PAY_ID_NAME}</p>
            <p className="text-sm font-medium text-orange-400 truncate">{PAY_ID_EMAIL}</p>
          </div>
          <CopyButton value={PAY_ID_EMAIL} label="PayID" />
        </div>
      </div>

      {/* Booking Reference */}
      <div className="mb-5">
        <p className="text-xs text-zinc-500 mb-2 uppercase tracking-widest font-bold">Payment Reference (include in your transfer)</p>
        <div className="bg-zinc-950 p-4 rounded-xl border border-orange-500/20 flex items-center justify-between">
          <p className="text-xl font-black text-white tracking-widest">{bookingReference}</p>
          <CopyButton value={bookingReference} label="reference" />
        </div>
      </div>

      {/* Instructions */}
      <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 mb-5">
        <div className="space-y-2 text-xs text-orange-400 font-medium">
          <p className="flex items-start gap-2">
            <span className="font-black text-orange-300">1.</span>
            Open your banking app and select PayID transfer
          </p>
          <p className="flex items-start gap-2">
            <span className="font-black text-orange-300">2.</span>
            Pay exactly <strong>${(amount || 0).toFixed(2)}</strong> to <strong>{PAY_ID_EMAIL}</strong>
          </p>
          <p className="flex items-start gap-2">
            <span className="font-black text-orange-300">3.</span>
            Include reference: <strong>{bookingReference}</strong>
          </p>
          <p className="flex items-start gap-2">
            <span className="font-black text-orange-300">4.</span>
            Your booking confirms automatically once payment is received
          </p>
        </div>
      </div>

      {/* Waiting indicator */}
      <div className="flex items-center justify-center gap-3 py-3 bg-zinc-900/50 rounded-lg border border-zinc-800 mb-4">
        <LoaderCircle size={16} className="animate-spin text-orange-500" />
        <span className="text-sm text-zinc-400">Waiting for payment...</span>
      </div>

      <div className="p-3 rounded-lg bg-zinc-800/30 flex items-start gap-2 border border-zinc-800">
        <Shield size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-zinc-500 leading-relaxed italic">
          Your booking will be confirmed automatically once your PayID payment is detected. No manual confirmation needed.
        </p>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="card-base !p-8 !bg-[#0f0f11] max-w-md w-full relative shadow-[0_0_50px_rgba(0,0,0,0.5)] border-zinc-800 max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-600 hover:text-white transition-colors p-2 z-10">
          <X className="h-6 w-6" />
        </button>
        {showSuccess ? <SuccessContent /> : <WaitingContent />}
      </div>
    </div>
  );
};

export default PayIDSimulationModal;
