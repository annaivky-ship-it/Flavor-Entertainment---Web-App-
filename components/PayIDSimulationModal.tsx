import React, { useState } from 'react';
import { LoaderCircle, CheckCircle, Shield, Building2, X, PartyPopper, User, Calendar, MapPin, Copy, Hash } from 'lucide-react';
import { PAY_ID_NAME, PAY_ID_EMAIL } from '../constants';

interface PayIDSimulationModalProps {
  amount: number;
  totalAmount: number;
  performerNames: string;
  eventType: string;
  eventDate: string;
  eventAddress: string;
  bookingRef: string;
  onPaymentSuccess: (receiptRef: string) => void;
  onClose: () => void;
}

const PayIDSimulationModal: React.FC<PayIDSimulationModalProps> = ({
    amount,
    totalAmount,
    performerNames,
    eventType,
    eventDate,
    eventAddress,
    bookingRef,
    onPaymentSuccess,
    onClose
}) => {
  const [status, setStatus] = useState<'idle' | 'processing' | 'success'>('idle');
  const [copied, setCopied] = useState<string | null>(null);
  const [receiptRef, setReceiptRef] = useState('');
  const [receiptError, setReceiptError] = useState('');

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handlePay = () => {
    if (!receiptRef.trim()) {
      setReceiptError('Please enter your bank transaction reference.');
      return;
    }
    if (receiptRef.trim().length < 4) {
      setReceiptError('Transaction reference must be at least 4 characters.');
      return;
    }
    setReceiptError('');
    setStatus('processing');
    setTimeout(() => {
      setStatus('success');
      setTimeout(() => {
        onPaymentSuccess(receiptRef.trim());
      }, 1500);
    }, 800);
  };

  const Content = () => {
    switch (status) {
      case 'processing':
        return (
          <div className="flex flex-col items-center justify-center text-center h-[450px]">
            <LoaderCircle className="h-16 w-16 animate-spin text-orange-500" />
            <p className="mt-4 text-zinc-300 font-semibold text-lg">Submitting Confirmation...</p>
            <p className="text-zinc-500 text-sm mt-2">Notifying admin of your PayID transfer...</p>
          </div>
        );
      case 'success':
        return (
          <div className="flex flex-col items-center justify-center text-center h-[450px]">
            <div className="bg-green-500/20 p-4 rounded-full mb-4">
                <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <p className="mt-4 text-zinc-100 font-bold text-2xl">Confirmation Sent!</p>
            <p className="text-zinc-400 mt-2 max-w-xs">Your booking status has been updated. Admin will verify the transfer shortly.</p>
            <div className="mt-4 bg-zinc-900/50 px-4 py-2 rounded-lg border border-zinc-800">
              <p className="text-xs text-zinc-500">Reference</p>
              <p className="text-lg font-mono font-bold text-orange-400">{bookingRef}</p>
            </div>
          </div>
        );
      case 'idle':
      default:
        return (
          <>
            <div className="mb-5">
                <h3 className="text-lg font-bold text-white border-b border-zinc-800 pb-3 flex items-center gap-2">
                    <Shield className="h-5 w-5 text-orange-400" />
                    Secure Deposit Payment
                </h3>

                {/* Booking Reference - prominent */}
                <div className="mt-4 bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-orange-500/70 uppercase font-bold tracking-wider">Your Booking Reference</p>
                    <p className="text-xl font-mono font-black text-white tracking-wider mt-0.5">{bookingRef}</p>
                  </div>
                  <button
                    onClick={() => handleCopy(bookingRef, 'ref')}
                    className="p-2.5 bg-orange-500/20 hover:bg-orange-500/30 rounded-lg transition-colors"
                    title="Copy reference"
                  >
                    {copied === 'ref' ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-orange-400" />}
                  </button>
                </div>

                <div className="mt-4 bg-zinc-950/50 rounded-xl p-4 space-y-3 border border-zinc-800/50 text-sm">
                    <div className="flex justify-between items-start">
                        <span className="text-zinc-500 flex items-center gap-1.5 min-w-[100px]"><User size={14}/> Performer:</span>
                        <span className="text-zinc-200 font-semibold text-right">{performerNames}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-zinc-500 flex items-center gap-1.5 min-w-[100px]"><PartyPopper size={14}/> Event:</span>
                        <span className="text-zinc-200 font-semibold">{eventType}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-zinc-500 flex items-center gap-1.5 min-w-[100px]"><Calendar size={14}/> Date:</span>
                        <span className="text-zinc-200 font-semibold">{new Date(eventDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between items-start">
                        <span className="text-zinc-500 flex items-center gap-1.5 min-w-[100px]"><MapPin size={14}/> Location:</span>
                        <span className="text-zinc-200 font-semibold text-right truncate max-w-[180px]">{eventAddress}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="bg-zinc-800/40 p-3 rounded-lg border border-zinc-800">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Total Value</p>
                    <p className="text-lg font-bold text-zinc-300">${(totalAmount || 0).toFixed(2)}</p>
                </div>
                <div className="bg-orange-500/10 p-3 rounded-lg border border-orange-500/20">
                    <p className="text-[10px] text-orange-500/70 uppercase font-bold tracking-wider">Deposit Due</p>
                    <p className="text-2xl font-black text-white">${(amount || 0).toFixed(2)}</p>
                </div>
            </div>

            <div className="mb-6">
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
                    <button
                      onClick={() => handleCopy(PAY_ID_EMAIL, 'payid')}
                      className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors relative z-10"
                      title="Copy PayID"
                    >
                      {copied === 'payid' ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-zinc-400" />}
                    </button>
                </div>

                {/* Payment instructions */}
                <div className="mt-4 p-4 rounded-xl bg-blue-950/30 border border-blue-500/20 space-y-2">
                    <p className="text-xs text-blue-300 font-semibold">Payment Instructions:</p>
                    <ol className="text-xs text-blue-200/80 space-y-1.5 list-decimal list-inside leading-relaxed">
                      <li>Open your banking app and select <strong>PayID transfer</strong></li>
                      <li>Enter the PayID email: <strong className="text-orange-400">{PAY_ID_EMAIL}</strong></li>
                      <li>Set amount to <strong className="text-white">${(amount || 0).toFixed(2)}</strong></li>
                      <li>In the <strong>description/reference</strong> field, enter: <button onClick={() => handleCopy(bookingRef, 'ref-inline')} className="inline-flex items-center gap-1 bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded font-mono font-bold hover:bg-orange-500/30 transition-colors">{bookingRef} {copied === 'ref-inline' ? <CheckCircle size={10}/> : <Copy size={10}/>}</button></li>
                      <li>Submit the transfer and click <strong>"Confirm Payment Sent"</strong> below</li>
                    </ol>
                </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-zinc-400 font-semibold mb-2 uppercase tracking-wider">
                Bank Transaction Reference
              </label>
              <input
                type="text"
                value={receiptRef}
                onChange={(e) => { setReceiptRef(e.target.value); setReceiptError(''); }}
                placeholder="Enter your bank receipt/transaction reference"
                className="w-full bg-zinc-900 text-white border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 placeholder-zinc-600 text-sm"
              />
              {receiptError && (
                <p className="text-red-400 text-xs mt-2">{receiptError}</p>
              )}
            </div>

            <button onClick={handlePay} className="btn-primary w-full py-4 text-lg font-bold flex items-center justify-center gap-3 shadow-2xl shadow-orange-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all">
              <CheckCircle className="h-5 w-5" />
              Confirm Payment Sent
            </button>

            <div className="mt-5 p-3 rounded-lg bg-zinc-800/30 flex items-start gap-2 border border-zinc-800">
                <Shield size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                  Your booking will be confirmed once the admin verifies the receipt of your PayID transfer matching reference <strong className="text-zinc-400">{bookingRef}</strong>.
                </p>
            </div>
          </>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="card-base !p-8 !bg-[#0f0f11] max-w-md w-full relative shadow-[0_0_50px_rgba(0,0,0,0.5)] border-zinc-800 max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} disabled={status === 'processing'} className="absolute top-4 right-4 text-zinc-600 hover:text-white transition-colors p-2">
            <X className="h-6 w-6" />
        </button>
        <Content />
      </div>
    </div>
  );
};

export default PayIDSimulationModal;
