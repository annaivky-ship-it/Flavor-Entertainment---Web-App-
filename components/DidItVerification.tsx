import React, { useState, useEffect } from 'react';
import { CheckCircle, LoaderCircle, AlertTriangle, X, ScanFace, Fingerprint, ShieldCheck } from 'lucide-react';

interface DidItVerificationProps {
  onSuccess: () => void;
  onCancel: () => void;
  clientName: string;
}

const DidItVerification: React.FC<DidItVerificationProps> = ({ onSuccess, onCancel, clientName }) => {
  const [step, setStep] = useState<'intro' | 'scanning' | 'processing' | 'success' | 'error'>('intro');

  useEffect(() => {
    if (step === 'scanning') {
      const timer = setTimeout(() => setStep('processing'), 2000);
      return () => clearTimeout(timer);
    }
    if (step === 'processing') {
      const timer = setTimeout(() => setStep('success'), 2500);
      return () => clearTimeout(timer);
    }
    if (step === 'success') {
      const timer = setTimeout(() => onSuccess(), 1500);
      return () => clearTimeout(timer);
    }
  }, [step, onSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#13131a] border border-[#2a2a35] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-[#b8b8c2] hover:text-white transition-colors"
          disabled={step === 'scanning' || step === 'processing' || step === 'success'}
        >
          <X size={20} />
        </button>

        <div className="p-8 text-center">
          {/* Didit logo mark */}
          <div className="mb-6 flex justify-center">
            <div className="h-16 w-16 bg-violet-500/10 rounded-2xl flex items-center justify-center border border-violet-500/20">
              <ScanFace className="h-8 w-8 text-violet-400" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">Didit Verification</h2>
          <p className="text-xs text-violet-400 font-semibold tracking-widest uppercase mb-6">Powered by Didit</p>

          {step === 'intro' && (
            <div className="animate-fade-in">
              <p className="text-[#b8b8c2] mb-8">
                Hi {clientName}, we use Didit to securely verify your identity. You will need your government-issued ID ready for a quick scan.
              </p>
              <button
                onClick={() => setStep('scanning')}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Fingerprint size={20} />
                Start Didit Verification
              </button>
              <p className="text-xs text-[#8888a0] mt-4">
                By proceeding, you agree to Didit's{' '}
                <a href="https://didit.me" target="_blank" rel="noreferrer" className="text-violet-400 underline">
                  Terms of Service and Privacy Policy
                </a>.
              </p>
            </div>
          )}

          {step === 'scanning' && (
            <div className="animate-fade-in py-8">
              <ScanFace className="h-12 w-12 text-violet-400 animate-pulse mx-auto mb-4" />
              <p className="text-lg font-medium text-white mb-2">Connecting to Didit...</p>
              <p className="text-sm text-[#b8b8c2]">Preparing secure biometric environment</p>
            </div>
          )}

          {step === 'processing' && (
            <div className="animate-fade-in py-8">
              <div className="relative h-12 w-12 mx-auto mb-4">
                <LoaderCircle className="h-12 w-12 text-violet-400 animate-spin absolute inset-0 opacity-20" />
                <Fingerprint className="h-6 w-6 text-violet-400 absolute inset-0 m-auto animate-pulse" />
              </div>
              <p className="text-lg font-medium text-white mb-2">Verifying Identity...</p>
              <p className="text-sm text-[#b8b8c2]">Didit is checking your documents securely</p>
            </div>
          )}

          {step === 'success' && (
            <div className="animate-fade-in py-8">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <p className="text-xl font-bold text-white mb-2">Verification Complete</p>
              <p className="text-sm text-[#b8b8c2]">Your identity has been successfully verified by Didit.</p>
            </div>
          )}

          {step === 'error' && (
            <div className="animate-fade-in py-8">
              <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <p className="text-xl font-bold text-white mb-2">Verification Failed</p>
              <p className="text-sm text-[#b8b8c2] mb-6">We could not verify your identity at this time. Please try again.</p>
              <button
                onClick={() => setStep('intro')}
                className="w-full bg-[#1a1a22] hover:bg-[#2a2a35] text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        <div className="bg-[#0f0f12] px-6 py-4 border-t border-[#2a2a35] flex items-center justify-center gap-2">
          <ShieldCheck className="h-4 w-4 text-violet-500" />
          <span className="text-xs text-[#8888a0] font-medium">Secured by</span>
          <span className="text-xs text-violet-400 font-bold tracking-wide">Didit</span>
        </div>
      </div>
    </div>
  );
};

export default DidItVerification;
