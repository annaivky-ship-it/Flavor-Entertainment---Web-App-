import React, { useState } from 'react';
import { LoaderCircle, CheckCircle, Shield, Building2, X, PartyPopper, User, Calendar, MapPin, DollarSign } from 'lucide-react';
import { PAY_ID_NAME, PAY_ID_EMAIL } from '../constants';

interface PayIDSimulationModalProps {
  amount: number;
  totalAmount: number;
  performerNames: string;
  eventType: string;
  eventDate: string;
  eventAddress: string;
  onPaymentSuccess: () => void;
  onClose: () => void;
}

const PayIDSimulationModal: React.FC<PayIDSimulationModalProps> = ({ 
    amount, 
    totalAmount, 
    performerNames, 
    eventType,
    eventDate,
    eventAddress,
    onPaymentSuccess, 
    onClose 
}) => {
  const [status, setStatus] = useState<'idle' | 'processing' | 'success'>('idle');

  const handlePay = () => {
    setStatus('processing');
    setTimeout(() => {
      setStatus('success');
      setTimeout(() => {
        onPaymentSuccess();
      }, 1500); // Show success message before closing
    }, 2000); // Simulate processing time
  };

  const Content = () => {
    switch (status) {
      case 'processing':
        return (
          <div className="flex flex-col items-center justify-center text-center h-[450px]">
            <LoaderCircle className="h-16 w-16 animate-spin text-orange-500" />
            <p className="mt-4 text-zinc-300 font-semibold text-lg">Processing Secure Payment...</p>
            <p className="text-zinc-500 text-sm mt-2">Communicating with your bank via PayID network...</p>
          </div>
        );
      case 'success':
        return (
          <div className="flex flex-col items-center justify-center text-center h-[450px]">
            <div className="bg-green-500/20 p-4 rounded-full mb-4">
                <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <p className="mt-4 text-zinc-100 font-bold text-2xl">Deposit Confirmed!</p>
            <p className="text-zinc-400 mt-2 max-w-xs">Your booking status has been updated. We are notifying the team.</p>
          </div>
        );
      case 'idle':
      default:
        return (
          <>
            <div className="mb-6">
                <h3 className="text-lg font-bold text-white border-b border-zinc-800 pb-3 flex items-center gap-2">
                    <Shield className="h-5 w-5 text-orange-400" />
                    Secure Deposit Payment
                </h3>
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

            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-zinc-800/40 p-3 rounded-lg border border-zinc-800">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Total Value</p>
                    <p className="text-lg font-bold text-zinc-300">${totalAmount.toFixed(2)}</p>
                </div>
                <div className="bg-orange-500/10 p-3 rounded-lg border border-orange-500/20">
                    <p className="text-[10px] text-orange-500/70 uppercase font-bold tracking-wider">Deposit Due</p>
                    <p className="text-2xl font-black text-white">${amount.toFixed(2)}</p>
                </div>
            </div>

            <div className="mb-8">
                <p className="text-xs text-zinc-500 mb-2 uppercase tracking-widest font-bold">Transfer To (PayID)</p>
                <div className="bg-zinc-950 p-4 rounded-xl border border-orange-500/20 flex items-center gap-4 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="w-12 h-12 bg-orange-500 text-white rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/20">
                        <Building2 className="h-6 w-6" />
                    </div>
                    <div className="overflow-hidden relative z-10">
                        <p className="font-black text-white truncate uppercase tracking-tight">{PAY_ID_NAME}</p>
                        <p className="text-sm font-medium text-orange-400 truncate">{PAY_ID_EMAIL}</p>
                    </div>
                </div>
            </div>

            <button onClick={handlePay} className="btn-primary w-full py-4 text-lg font-bold flex items-center justify-center gap-3 shadow-2xl shadow-orange-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all">
              <CheckCircle className="h-5 w-5" />
              Confirm & Pay
            </button>
            
            <div className="mt-6 p-3 rounded-lg bg-zinc-800/30 flex items-start gap-2 border border-zinc-800">
                <Shield size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                  This is a simulated transaction for platform demonstration purposes. Funds are not moved. By clicking you authorize the mock transfer.
                </p>
            </div>
          </>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="card-base !p-8 !bg-[#0f0f11] max-w-md w-full relative shadow-[0_0_50px_rgba(0,0,0,0.5)] border-zinc-800">
        <button onClick={onClose} disabled={status === 'processing'} className="absolute top-4 right-4 text-zinc-600 hover:text-white transition-colors p-2">
            <X className="h-6 w-6" />
        </button>
        <Content />
      </div>
    </div>
  );
};

export default PayIDSimulationModal;