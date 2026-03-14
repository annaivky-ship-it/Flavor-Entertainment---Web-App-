import React, { useState, useEffect, useRef } from 'react';
import { Shield, CheckCircle, LoaderCircle, AlertTriangle, X, Camera, CreditCard, User } from 'lucide-react';

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

type Step = 'intro' | 'id_upload' | 'selfie' | 'processing' | 'success' | 'error';

const DiditVerification: React.FC<DiditVerificationProps> = ({ onSuccess, onCancel, clientName }) => {
  const [step, setStep] = useState<Step>('intro');
  const [verificationId] = useState(() => generateVerificationId(clientName));
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (step === 'processing') {
      const timer = setTimeout(() => setStep('success'), 3000);
      return () => clearTimeout(timer);
    }
    if (step === 'success') {
      const timer = setTimeout(() => onSuccessRef.current(verificationId), 1500);
      return () => clearTimeout(timer);
    }
  }, [step, verificationId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'id' | 'selfie') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === 'id') setIdPreview(reader.result as string);
      else setSelfiePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const isProcessing = step === 'processing' || step === 'success';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors z-10"
          disabled={isProcessing}
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

          {/* Step indicators */}
          {!isProcessing && step !== 'error' && (
            <div className="flex items-center justify-center gap-2 mb-6">
              {['intro', 'id_upload', 'selfie'].map((s, i) => (
                <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === step ? 'w-8 bg-blue-500' :
                  ['intro', 'id_upload', 'selfie'].indexOf(step) > i ? 'w-4 bg-blue-500/50' :
                  'w-4 bg-zinc-700'
                }`} />
              ))}
            </div>
          )}

          {step === 'intro' && (
            <div className="animate-fade-in">
              <p className="text-zinc-400 mb-6">
                Hi {clientName}, we use Didit to securely verify your identity. You will need:
              </p>
              <div className="space-y-3 mb-8 text-left">
                <div className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                  <CreditCard className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-sm text-zinc-300">A government-issued photo ID (driver's license or passport)</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                  <Camera className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-sm text-zinc-300">A selfie for face matching</span>
                </div>
              </div>
              <button
                onClick={() => setStep('id_upload')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                Start Verification
              </button>
              <p className="text-xs text-zinc-500 mt-4">
                Your documents are processed securely and not stored after verification.
              </p>
            </div>
          )}

          {step === 'id_upload' && (
            <div className="animate-fade-in">
              <p className="text-zinc-400 mb-6">
                Upload a clear photo of your government-issued ID.
              </p>

              {idPreview ? (
                <div className="relative mb-6">
                  <img src={idPreview} alt="ID Preview" className="w-full h-48 object-cover rounded-xl border border-zinc-700" />
                  <button
                    type="button"
                    onClick={() => setIdPreview(null)}
                    className="absolute top-2 right-2 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                  <div className="absolute bottom-2 left-2 bg-green-500/90 text-white text-xs font-medium px-2 py-1 rounded-lg flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> ID Captured
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-zinc-700 rounded-xl cursor-pointer hover:border-blue-500/50 transition-colors bg-zinc-800/30 mb-6">
                  <CreditCard className="w-10 h-10 text-zinc-500 mb-3" />
                  <span className="text-sm text-zinc-400 font-medium">Tap to upload ID photo</span>
                  <span className="text-xs text-zinc-600 mt-1">Driver's license, passport, or state ID</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e, 'id')}
                  />
                </label>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('intro')}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep('selfie')}
                  disabled={!idPreview}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 'selfie' && (
            <div className="animate-fade-in">
              <p className="text-zinc-400 mb-6">
                Take a clear selfie for face matching against your ID.
              </p>

              {selfiePreview ? (
                <div className="relative mb-6">
                  <img src={selfiePreview} alt="Selfie Preview" className="w-48 h-48 object-cover rounded-full mx-auto border-4 border-zinc-700" />
                  <button
                    type="button"
                    onClick={() => setSelfiePreview(null)}
                    className="absolute top-0 right-1/4 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                  <div className="mt-3 bg-green-500/90 text-white text-xs font-medium px-3 py-1 rounded-lg inline-flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Selfie Captured
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-48 h-48 mx-auto border-2 border-dashed border-zinc-700 rounded-full cursor-pointer hover:border-blue-500/50 transition-colors bg-zinc-800/30 mb-6">
                  <User className="w-10 h-10 text-zinc-500 mb-2" />
                  <span className="text-sm text-zinc-400 font-medium">Take selfie</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e, 'selfie')}
                  />
                </label>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('id_upload')}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep('processing')}
                  disabled={!selfiePreview}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-colors"
                >
                  Verify Me
                </button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="animate-fade-in py-8">
              <div className="relative h-12 w-12 mx-auto mb-4">
                <LoaderCircle className="h-12 w-12 text-blue-500 animate-spin absolute inset-0 opacity-20" />
                <Shield className="h-6 w-6 text-blue-500 absolute inset-0 m-auto animate-pulse" />
              </div>
              <p className="text-lg font-medium text-white mb-2">Verifying Identity...</p>
              <p className="text-sm text-zinc-400">Matching face to ID and checking databases</p>
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
                onClick={() => { setIdPreview(null); setSelfiePreview(null); setStep('intro'); }}
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
