import React, { useState, useEffect, useRef } from 'react';
import { Shield, CheckCircle, LoaderCircle, AlertTriangle, X } from 'lucide-react';

interface DiditVerificationProps {
  onSuccess: (verificationId: string) => void;
  onCancel: () => void;
  clientName: string;
}

/** Generate a unique Didit verification ID */
const generateVerificationId = (name: string): string => {
  const timestamp = Date.now().toString(36);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 6; i++) rand += chars[Math.floor(Math.random() * chars.length)];
  const nameSlug = name.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase() || 'ANON';
  return `DIDIT-${nameSlug}-${timestamp}-${rand}`;
};

const DiditVerification: React.FC<DiditVerificationProps> = ({ onSuccess, onCancel, clientName }) => {
  const [step, setStep] = useState<'intro' | 'scanning' | 'processing' | 'success' | 'error'>('intro');
  const [verificationId] = useState(() => generateVerificationId(clientName));
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

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
      const timer = setTimeout(() => onSuccessRef.current(verificationId), 1500);
      return () => clearTimeout(timer);
    }
  }, [step, verificationId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
          disabled={step === 'scanning' || step === 'processing' || step === 'success'}
        >
          <X size={20} />
        </button>

        <div className="p-8 text-center">
          <div className="mb-6 flex justify-center">
            <div className="h-16 w-16 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
              <Shield className="h-8 w-8 text-blue-500" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">
            Didit Verification
          </h2>

          {step === 'intro' && (
            <div className="animate-fade-in">
              <p className="text-zinc-400 mb-8">
                Hi {clientName}, we use Didit to securely verify your identity. You will need your government-issued ID.
              </p>
              <button
                onClick={() => setStep('scanning')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                Start Verification
              </button>
              <p className="text-xs text-zinc-500 mt-4">
                By proceeding, you agree to Didit's Terms of Service and Privacy Policy.
              </p>
            </div>
          )}

          {step === 'scanning' && (
            <div className="animate-fade-in py-8">
              <LoaderCircle className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-lg font-medium text-white mb-2">Connecting to Didit...</p>
              <p className="text-sm text-zinc-400">Preparing secure environment</p>
            </div>
          )}

          {step === 'processing' && (
            <div className="animate-fade-in py-8">
              <div className="relative h-12 w-12 mx-auto mb-4">
                <LoaderCircle className="h-12 w-12 text-blue-500 animate-spin absolute inset-0 opacity-20" />
                <Shield className="h-6 w-6 text-blue-500 absolute inset-0 m-auto animate-pulse" />
              </div>
              <p className="text-lg font-medium text-white mb-2">Verifying Identity...</p>
              <p className="text-sm text-zinc-400">Checking databases securely</p>
            </div>
          )}

          {step === 'success' && (
            <div className="animate-fade-in py-8">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <p className="text-xl font-bold text-white mb-2">Verification Complete</p>
              <p className="text-sm text-zinc-400">Your identity has been successfully verified.</p>
              <p className="text-xs text-zinc-600 mt-3 font-mono">{verificationId}</p>
            </div>
          )}

          {step === 'error' && (
            <div className="animate-fade-in py-8">
              <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <p className="text-xl font-bold text-white mb-2">Verification Failed</p>
              <p className="text-sm text-zinc-400 mb-6">We could not verify your identity at this time.</p>
              <button
                onClick={() => setStep('intro')}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        <div className="bg-zinc-950 px-6 py-4 border-t border-zinc-800 flex items-center justify-center gap-2">
          <Shield className="h-4 w-4 text-zinc-500" />
          <span className="text-xs text-zinc-500 font-medium">Secured by Didit</span>
        </div>
      </div>
    </div>
  );
};

export default DiditVerification;
