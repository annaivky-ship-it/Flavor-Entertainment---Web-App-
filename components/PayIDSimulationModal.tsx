import React, { useState, useRef } from 'react';
import { LoaderCircle, CheckCircle, Shield, Building2, X, PartyPopper, User, Calendar, MapPin, Upload, FileImage } from 'lucide-react';
import { PAY_ID_NAME, PAY_ID_EMAIL } from '../constants';

interface PayIDSimulationModalProps {
  amount: number;
  totalAmount: number;
  performerNames: string;
  eventType: string;
  eventDate: string;
  eventAddress: string;
  bookingId: string;
  onPaymentSuccess: (receiptFile: File) => void;
  onClose: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const PayIDSimulationModal: React.FC<PayIDSimulationModalProps> = ({
    amount,
    totalAmount,
    performerNames,
    eventType,
    eventDate,
    eventAddress,
    bookingId,
    onPaymentSuccess,
    onClose
}) => {
  const [status, setStatus] = useState<'idle' | 'processing' | 'success'>('idle');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);

    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError('Please upload a JPG, PNG, WebP image or PDF.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError('File must be under 10MB.');
      return;
    }

    setReceiptFile(file);
  };

  const handleConfirmPayment = () => {
    if (!receiptFile) {
      setFileError('Please upload your payment receipt before confirming.');
      return;
    }

    setStatus('processing');
    // Pass the receipt file to parent for upload to Firebase Storage
    onPaymentSuccess(receiptFile);
    setTimeout(() => {
      setStatus('success');
    }, 1500);
  };

  const Content = () => {
    switch (status) {
      case 'processing':
        return (
          <div className="flex flex-col items-center justify-center text-center h-[450px]">
            <LoaderCircle className="h-16 w-16 animate-spin text-orange-500" />
            <p className="mt-4 text-zinc-300 font-semibold text-lg">Uploading Receipt...</p>
            <p className="text-zinc-500 text-sm mt-2">Notifying admin of your PayID transfer...</p>
          </div>
        );
      case 'success':
        return (
          <div className="flex flex-col items-center justify-center text-center h-[450px]">
            <div className="bg-green-500/20 p-4 rounded-full mb-4">
                <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <p className="mt-4 text-zinc-100 font-bold text-2xl">Receipt Uploaded!</p>
            <p className="text-zinc-400 mt-2 max-w-xs">Your booking status has been updated. Admin will verify the transfer shortly.</p>
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
                    <p className="text-lg font-bold text-zinc-300">${(totalAmount || 0).toFixed(2)}</p>
                </div>
                <div className="bg-orange-500/10 p-3 rounded-lg border border-orange-500/20">
                    <p className="text-[10px] text-orange-500/70 uppercase font-bold tracking-wider">Deposit Due</p>
                    <p className="text-2xl font-black text-white">${(amount || 0).toFixed(2)}</p>
                </div>
            </div>

            <div className="mb-6">
                <p className="text-xs text-zinc-500 mb-2 uppercase tracking-widest font-bold">Step 1: Transfer To (PayID)</p>
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
                <div className="mt-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <p className="text-xs text-orange-400 font-medium">Transfer <strong>${(amount || 0).toFixed(2)}</strong> to the PayID above using your banking app. Use booking reference: <strong>{bookingId.slice(0, 8).toUpperCase()}</strong></p>
                </div>
            </div>

            <div className="mb-6">
                <p className="text-xs text-zinc-500 mb-2 uppercase tracking-widest font-bold">Step 2: Upload Payment Receipt</p>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full p-4 rounded-xl border-2 border-dashed transition-all flex flex-col items-center gap-2 ${
                        receiptFile
                            ? 'border-green-500/40 bg-green-500/5'
                            : 'border-zinc-700 bg-zinc-900/50 hover:border-orange-500/40 hover:bg-zinc-900'
                    }`}
                >
                    {receiptFile ? (
                        <>
                            <FileImage className="h-8 w-8 text-green-400" />
                            <p className="text-sm text-green-400 font-semibold">{receiptFile.name}</p>
                            <p className="text-xs text-zinc-500">Click to change</p>
                        </>
                    ) : (
                        <>
                            <Upload className="h-8 w-8 text-zinc-500" />
                            <p className="text-sm text-zinc-400">Upload screenshot or PDF of your payment</p>
                            <p className="text-xs text-zinc-600">JPG, PNG, WebP or PDF (max 10MB)</p>
                        </>
                    )}
                </button>
                {fileError && (
                    <p className="text-xs text-red-400 mt-2">{fileError}</p>
                )}
            </div>

            <button
                onClick={handleConfirmPayment}
                disabled={!receiptFile}
                className={`w-full py-4 text-lg font-bold flex items-center justify-center gap-3 rounded-xl transition-all ${
                    receiptFile
                        ? 'btn-primary shadow-2xl shadow-orange-500/40 hover:scale-[1.02] active:scale-[0.98]'
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
            >
              <CheckCircle className="h-5 w-5" />
              Confirm Payment Sent
            </button>

            <div className="mt-6 p-3 rounded-lg bg-zinc-800/30 flex items-start gap-2 border border-zinc-800">
                <Shield size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                  Your booking will be confirmed once the admin verifies the receipt of your PayID transfer.
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
