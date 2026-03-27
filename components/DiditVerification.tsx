import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, CheckCircle, LoaderCircle, AlertTriangle, X } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseClient';

interface DiditVerificationProps {
  verificationUrl: string;
  bookingId: string;
  onSuccess: () => void;
  onCancel: () => void;
  clientName: string;
}

const DiditVerification: React.FC<DiditVerificationProps> = ({
  verificationUrl,
  bookingId,
  onSuccess,
  onCancel,
  clientName,
}) => {
  const [step, setStep] = useState<'intro' | 'verifying' | 'success' | 'error' | 'in_review' | 'expired'>('intro');
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for KYC status changes on the booking document
  useEffect(() => {
    if (step !== 'verifying' || !db || !bookingId) return;

    const unsubscribe = onSnapshot(
      doc(db, 'bookings', bookingId),
      (snap) => {
        const data = snap.data();
        if (!data) return;
        if (data.kyc_status === 'PASS' || data.status === 'confirmed' || data.status === 'CONFIRMED') {
          setStep('success');
        } else if (data.kyc_status === 'FAIL') {
          setStep('error');
        } else if (data.kyc_status === 'IN_REVIEW') {
          setStep('in_review');
        } else if (data.kyc_status === 'EXPIRED') {
          setStep('expired');
        }
      },
      (err) => {
        console.warn('Error listening to booking KYC status:', err.message);
      }
    );

    return () => unsubscribe();
  }, [step, bookingId]);

  // Auto-proceed after success
  useEffect(() => {
    if (step === 'success') {
      const timer = setTimeout(() => onSuccess(), 2000);
      return () => clearTimeout(timer);
    }
  }, [step, onSuccess]);

  const handleStartVerification = useCallback(() => {
    setStep('verifying');
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
              <Shield className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Identity Verification</h2>
              <p className="text-xs text-zinc-500">Secured by Didit</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-zinc-400 hover:text-white transition-colors p-1"
            disabled={step === 'success'}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {step === 'intro' && (
            <div className="p-8 text-center animate-fade-in">
              <p className="text-zinc-400 mb-2">
                Hi <span className="text-white font-medium">{clientName}</span>,
              </p>
              <p className="text-zinc-400 mb-8">
                For your safety and the safety of our entertainers, we need to verify your identity.
                You'll need a government-issued ID and your device's camera.
              </p>
              <button
                onClick={handleStartVerification}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                Start Verification
              </button>
              <p className="text-xs text-zinc-500 mt-4">
                By proceeding, you agree to Didit's Terms of Service and Privacy Policy.
                Your data is encrypted and processed securely.
              </p>
            </div>
          )}

          {step === 'verifying' && (
            <div className="relative w-full" style={{ height: '70vh' }}>
              {!iframeLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-900">
                  <LoaderCircle className="h-10 w-10 text-blue-500 animate-spin" />
                  <p className="text-zinc-400 text-sm">Loading verification...</p>
                </div>
              )}
              <iframe
                ref={iframeRef}
                src={verificationUrl}
                title="Didit Identity Verification"
                className="w-full h-full border-0"
                allow="camera; microphone"
                onLoad={() => setIframeLoaded(true)}
              />
            </div>
          )}

          {step === 'success' && (
            <div className="p-8 text-center animate-fade-in">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <p className="text-xl font-bold text-white mb-2">Verification Complete</p>
              <p className="text-sm text-zinc-400">Your identity has been successfully verified. Redirecting...</p>
            </div>
          )}

          {step === 'error' && (
            <div className="p-8 text-center animate-fade-in">
              <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <p className="text-xl font-bold text-white mb-2">Verification Failed</p>
              <p className="text-sm text-zinc-400 mb-6">
                We could not verify your identity. Please contact us for assistance.
              </p>
              <button
                onClick={onCancel}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {step === 'in_review' && (
            <div className="p-8 text-center animate-fade-in">
              <Shield className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
              <p className="text-xl font-bold text-white mb-2">Under Review</p>
              <p className="text-sm text-zinc-400 mb-6">
                Your verification is being reviewed by our team. We'll update you shortly — no action needed right now.
              </p>
              <button
                onClick={onCancel}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                Continue Later
              </button>
            </div>
          )}

          {step === 'expired' && (
            <div className="p-8 text-center animate-fade-in">
              <AlertTriangle className="h-16 w-16 text-orange-500 mx-auto mb-4" />
              <p className="text-xl font-bold text-white mb-2">Session Expired</p>
              <p className="text-sm text-zinc-400 mb-6">
                Your verification session has expired. You can start a new one — your booking is still saved.
              </p>
              <button
                onClick={() => { setStep('intro'); }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors mb-3"
              >
                Retry Verification
              </button>
              <button
                onClick={onCancel}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                Continue Later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiditVerification;
