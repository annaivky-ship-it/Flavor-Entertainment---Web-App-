import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, AlertTriangle, LoaderCircle } from 'lucide-react';
import {
  runLivenessCheck, startCamera, LivenessError, LivenessErrorCode, LivenessResult,
} from '../../lib/liveness';

interface LivenessCheckProps {
  onComplete: (result: LivenessResult) => void;
  onCancel: () => void;
}

const ERROR_COPY: Record<LivenessErrorCode, string> = {
  NoFaceDetected: 'No face detected. Please make sure your face is centered and well-lit.',
  MultipleFacesDetected: 'More than one face detected. Please be alone in the frame.',
  BlinkNotDetected: 'We did not detect a clear blink. Please try again.',
  CameraPermissionDenied: 'Camera access is required for verification. Please grant permission and reload.',
  ModelLoadFailed: 'Could not load verification models. Please check your connection and reload.',
};

export const LivenessCheck: React.FC<LivenessCheckProps> = ({ onComplete, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<'init' | 'ready' | 'running' | 'success' | 'error'>('init');
  const [progress, setProgress] = useState<string>('');
  const [errorCode, setErrorCode] = useState<LivenessErrorCode | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!videoRef.current) return;
      try {
        const stream = await startCamera(videoRef.current);
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        setPhase('ready');
      } catch (err) {
        if (err instanceof LivenessError) {
          setErrorCode(err.code);
        } else {
          setErrorCode('ModelLoadFailed');
        }
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, []);

  const handleStart = async () => {
    if (!videoRef.current) return;
    setPhase('running');
    setErrorCode(null);
    try {
      const result = await runLivenessCheck(videoRef.current, (_step, msg) => setProgress(msg));
      streamRef.current?.getTracks().forEach(t => t.stop());
      setPhase('success');
      setTimeout(() => onComplete(result), 600);
    } catch (err) {
      if (err instanceof LivenessError) {
        setErrorCode(err.code);
      } else {
        setErrorCode('NoFaceDetected');
      }
      setPhase('error');
    }
  };

  const handleRetry = () => {
    setErrorCode(null);
    setPhase('ready');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-orange-400" />
            <h2 className="font-bold text-white">Liveness Check</h2>
          </div>
          <button onClick={onCancel} className="text-sm text-zinc-400 hover:text-white">Cancel</button>
        </div>

        <div className="relative aspect-square bg-black">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          {/* Face oval guide */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="border-2 border-orange-400/70 rounded-full" style={{ width: '60%', aspectRatio: '3/4' }} />
          </div>

          {phase === 'running' && (
            <div className="absolute bottom-4 left-4 right-4 bg-black/70 text-white text-sm px-4 py-2 rounded-lg text-center">
              {progress || 'Starting…'}
            </div>
          )}

          {phase === 'success' && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-900/60 backdrop-blur-sm">
              <CheckCircle className="h-20 w-20 text-green-400" />
            </div>
          )}
        </div>

        <div className="p-5 space-y-3">
          {phase === 'init' && (
            <p className="text-sm text-zinc-400 flex items-center gap-2">
              <LoaderCircle className="animate-spin h-4 w-4" /> Requesting camera access…
            </p>
          )}
          {phase === 'ready' && (
            <>
              <p className="text-sm text-zinc-300">
                You'll be asked to look at the camera, blink slowly, and look again.
                The whole check takes about 4 seconds. <strong className="text-white">No images are uploaded</strong>.
              </p>
              <button onClick={handleStart} className="btn-primary w-full py-3">
                Start liveness check
              </button>
            </>
          )}
          {phase === 'error' && errorCode && (
            <>
              <p className="text-sm text-red-300 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{ERROR_COPY[errorCode]}</span>
              </p>
              {errorCode !== 'CameraPermissionDenied' && (
                <button onClick={handleRetry} className="btn-primary w-full py-3">
                  Try again
                </button>
              )}
            </>
          )}
          {phase === 'success' && (
            <p className="text-sm text-green-300 text-center">Verification complete.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LivenessCheck;
