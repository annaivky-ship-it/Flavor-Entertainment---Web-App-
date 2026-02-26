import React, { useState, useCallback } from 'react';
import {
  LoaderCircle, CheckCircle, Shield, Building2, X, PartyPopper,
  User, Calendar, MapPin, DollarSign, UploadCloud, Copy, AlertTriangle,
  FileText, ChevronRight
} from 'lucide-react';
import { PAY_ID_NAME, PAY_ID_EMAIL } from '../constants';

interface PayIDPaymentModalProps {
  amount: number;
  totalAmount: number;
  performerNames: string;
  eventType: string;
  eventDate: string;
  eventAddress: string;
  paymentReference: string;
  onPaymentSuccess: (receiptFile: File) => Promise<void>;
  onClose: () => void;
}

type ModalStep = 'instructions' | 'upload' | 'submitting' | 'success';

const PayIDPaymentModal: React.FC<PayIDPaymentModalProps> = ({
  amount,
  totalAmount,
  performerNames,
  eventType,
  eventDate,
  eventAddress,
  paymentReference,
  onPaymentSuccess,
  onClose,
}) => {
  const [step, setStep] = useState<ModalStep>('instructions');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [copied, setCopied] = useState<'payid' | 'ref' | null>(null);

  const handleCopy = (text: string, field: 'payid' | 'ref') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError('');
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      setFileError('Please upload a JPG, PNG, WEBP, or PDF file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError('File must be under 10 MB.');
      return;
    }
    setReceiptFile(file);
  }, []);

  const handleSubmit = async () => {
    if (!receiptFile) {
      setFileError('Please upload your payment receipt before submitting.');
      return;
    }
    setSubmitError('');
    setStep('submitting');
    try {
      await onPaymentSuccess(receiptFile);
      setStep('success');
    } catch (err: any) {
      setSubmitError(err?.message || 'Something went wrong. Please try again.');
      setStep('upload');
    }
  };

  const isCloseable = step !== 'submitting';

  const BookingSummary = () => (
    <div className="bg-zinc-950/50 rounded-xl p-4 space-y-3 border border-zinc-800/50 text-sm mb-6">
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
  );

  const AmountSummary = () => (
    <div className="grid grid-cols-2 gap-4 mb-6">
      <div className="bg-zinc-800/40 p-3 rounded-lg border border-zinc-800">
        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Total Value</p>
        <p className="text-lg font-bold text-zinc-300">${totalAmount.toFixed(2)}</p>
      </div>
      <div className="bg-orange-500/10 p-3 rounded-lg border border-orange-500/20">
        <p className="text-[10px] text-orange-500/70 uppercase font-bold tracking-wider">Deposit Due Now</p>
        <p className="text-2xl font-black text-white">${amount.toFixed(2)}</p>
      </div>
    </div>
  );

  const renderInstructions = () => (
    <>
      <h3 className="text-lg font-bold text-white border-b border-zinc-800 pb-3 flex items-center gap-2 mb-6">
        <Shield className="h-5 w-5 text-orange-400" />
        Secure Deposit Payment
      </h3>

      <BookingSummary />
      <AmountSummary />

      {/* PayID destination */}
      <div className="mb-4">
        <p className="text-xs text-zinc-500 mb-2 uppercase tracking-widest font-bold">Step 1 — Transfer To (PayID)</p>
        <div className="bg-zinc-950 p-4 rounded-xl border border-orange-500/20 flex items-center gap-4">
          <div className="w-12 h-12 bg-orange-500 text-white rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/20">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="font-black text-white uppercase tracking-tight">{PAY_ID_NAME}</p>
            <p className="text-sm font-medium text-orange-400">{PAY_ID_EMAIL}</p>
          </div>
          <button
            onClick={() => handleCopy(PAY_ID_EMAIL, 'payid')}
            className="text-zinc-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-zinc-800 flex-shrink-0"
            title="Copy PayID"
          >
            {copied === 'payid' ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} />}
          </button>
        </div>
      </div>

      {/* Payment reference */}
      <div className="mb-6">
        <p className="text-xs text-zinc-500 mb-2 uppercase tracking-widest font-bold">Step 2 — Include This Reference</p>
        <div className="bg-zinc-950 p-3 rounded-xl border border-orange-500/20 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Payment description / reference</p>
            <p className="text-orange-300 font-mono font-bold tracking-wide">{paymentReference}</p>
          </div>
          <button
            onClick={() => handleCopy(paymentReference, 'ref')}
            className="text-zinc-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-zinc-800 flex-shrink-0"
            title="Copy reference"
          >
            {copied === 'ref' ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} />}
          </button>
        </div>
        <p className="text-[11px] text-orange-400/80 mt-2 flex items-start gap-1.5">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          You must include this reference in your transfer description so we can match your payment.
        </p>
      </div>

      <button
        onClick={() => setStep('upload')}
        className="btn-primary w-full py-4 text-lg font-bold flex items-center justify-center gap-3 shadow-2xl shadow-orange-500/40"
      >
        I've Sent the Transfer
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="mt-4 p-3 rounded-lg bg-zinc-800/30 flex items-start gap-2 border border-zinc-800">
        <Shield size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-zinc-500 leading-relaxed italic">
          Your booking will be confirmed once admin verifies receipt of your PayID transfer. This normally takes 1–2 business hours.
        </p>
      </div>
    </>
  );

  const renderUpload = () => (
    <>
      <h3 className="text-lg font-bold text-white border-b border-zinc-800 pb-3 flex items-center gap-2 mb-6">
        <FileText className="h-5 w-5 text-orange-400" />
        Upload Payment Receipt
      </h3>

      <div className="mb-4 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
        <p className="text-sm text-orange-300 font-medium">
          Please upload a screenshot or PDF of your bank transfer confirmation.
        </p>
        <p className="text-xs text-orange-400/70 mt-1">
          This helps our admin verify your payment quickly. Your receipt is stored securely.
        </p>
      </div>

      {/* File drop zone */}
      <div className="mb-6">
        <label
          htmlFor="receipt-upload"
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 transition-all duration-300 cursor-pointer ${
            receiptFile
              ? 'border-green-500 bg-green-900/10'
              : fileError
              ? 'border-red-500 bg-red-900/10'
              : 'border-zinc-700 bg-zinc-900/50 hover:border-orange-500 hover:bg-zinc-800/50'
          }`}
        >
          {receiptFile ? (
            <div className="text-center">
              <CheckCircle className="mx-auto h-10 w-10 text-green-500 mb-2" />
              <p className="text-sm font-bold text-white truncate max-w-[220px]">{receiptFile.name}</p>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setReceiptFile(null); }}
                className="text-xs text-zinc-500 hover:text-red-400 mt-2 underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="text-center">
              <UploadCloud className={`mx-auto h-10 w-10 mb-3 ${fileError ? 'text-red-400' : 'text-zinc-500'}`} />
              <p className="text-sm font-semibold text-orange-400 hover:text-orange-300">Click to upload receipt</p>
              <p className="text-xs text-zinc-500 mt-1">JPG, PNG, PDF — max 10 MB</p>
            </div>
          )}
          <input
            id="receipt-upload"
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFileChange}
          />
        </label>
        {fileError && (
          <p className="text-xs mt-2 text-red-400 font-medium flex items-center gap-1">
            <AlertTriangle size={12} /> {fileError}
          </p>
        )}
      </div>

      {submitError && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/50 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-300">{submitError}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => setStep('instructions')}
          className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={!receiptFile}
          className="flex-1 btn-primary py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-xl shadow-orange-500/30"
        >
          <CheckCircle className="h-5 w-5" />
          Confirm Submission
        </button>
      </div>

      <p className="text-[10px] text-zinc-600 text-center mt-4">
        Reference: <span className="font-mono text-zinc-500">{paymentReference}</span>
      </p>
    </>
  );

  const renderSubmitting = () => (
    <div className="flex flex-col items-center justify-center text-center h-[400px]">
      <LoaderCircle className="h-16 w-16 animate-spin text-orange-500" />
      <p className="mt-4 text-zinc-300 font-semibold text-lg">Uploading Receipt...</p>
      <p className="text-zinc-500 text-sm mt-2">Securely storing your payment confirmation...</p>
    </div>
  );

  const renderSuccess = () => (
    <div className="flex flex-col items-center justify-center text-center h-[400px]">
      <div className="bg-green-500/20 p-4 rounded-full mb-4">
        <CheckCircle className="h-16 w-16 text-green-500" />
      </div>
      <p className="mt-2 text-zinc-100 font-bold text-2xl">Receipt Submitted!</p>
      <p className="text-zinc-400 mt-2 max-w-xs leading-relaxed">
        Your payment receipt has been uploaded. Admin will verify your transfer and confirm your booking shortly.
      </p>
      <div className="mt-4 p-3 rounded-lg bg-zinc-800/30 border border-zinc-800 text-left w-full">
        <p className="text-xs text-zinc-500">
          Reference: <span className="font-mono text-orange-400">{paymentReference}</span>
        </p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="card-base !p-8 !bg-[#0f0f11] max-w-md w-full relative shadow-[0_0_50px_rgba(0,0,0,0.5)] border-zinc-800 max-h-[90vh] overflow-y-auto">
        {isCloseable && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-zinc-600 hover:text-white transition-colors p-2 z-10"
          >
            <X className="h-6 w-6" />
          </button>
        )}

        {step === 'instructions' && renderInstructions()}
        {step === 'upload' && renderUpload()}
        {step === 'submitting' && renderSubmitting()}
        {step === 'success' && renderSuccess()}
      </div>
    </div>
  );
};

export default PayIDPaymentModal;
