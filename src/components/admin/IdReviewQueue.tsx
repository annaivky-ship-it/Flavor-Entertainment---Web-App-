import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Eye, CheckCircle, X, Clock, LoaderCircle, AlertTriangle } from 'lucide-react';
import { db } from '../../../services/firebaseClient';
import { adminGetIdImageReviewUrl, adminReviewId } from '../../services/verification';

interface QueueEntry {
  id: string;
  performerId: string;
  storagePath: string;
  uploadedAt: { toDate: () => Date } | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

const IdReviewQueue: React.FC = () => {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [active, setActive] = useState<QueueEntry | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState({
    nameMatches: false, photoMatches: false, age18Plus: false, documentType: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!db) return;
    const q = query(
      collection(db, 'idReviewQueue'),
      where('status', '==', 'pending'),
      orderBy('uploadedAt', 'asc'),
    );
    const unsub = onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...(d.data() as object) })) as QueueEntry[]);
    });
    return () => unsub();
  }, []);

  // Countdown for the signed URL
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const openEntry = async (entry: QueueEntry) => {
    setActive(entry);
    setSignedUrl(null);
    setSecondsLeft(0);
    setDecision({ nameMatches: false, photoMatches: false, age18Plus: false, documentType: '', notes: '' });
    setError(null);
    setLoadingUrl(true);
    try {
      const res = await adminGetIdImageReviewUrl({ queueId: entry.id });
      setSignedUrl(res.signedUrl);
      setSecondsLeft(res.expiresInSeconds);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingUrl(false);
    }
  };

  const submitDecision = async (action: 'approve' | 'reject') => {
    if (!active) return;
    if (action === 'approve' && (!decision.nameMatches || !decision.photoMatches || !decision.age18Plus)) {
      setError('All three flags must be ticked to approve.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await adminReviewId({
        queueId: active.id,
        decision: { action, ...decision, documentType: decision.documentType || undefined },
      });
      setActive(null);
      setSignedUrl(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Eye className="h-5 w-5 text-orange-400" /> Performer ID Review
        </h2>
        <span className="text-sm text-zinc-400">{entries.length} pending</span>
      </div>

      {error && (
        <div className="p-3 bg-red-900/40 border border-red-500/50 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-300 mt-0.5" />
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="card-base text-center py-8 text-zinc-400">No IDs to review.</div>
      ) : (
        <ul className="space-y-2">
          {entries.map(e => (
            <li
              key={e.id}
              onClick={() => openEntry(e)}
              className="card-base !p-4 flex items-center justify-between cursor-pointer hover:border-orange-500/40"
            >
              <div>
                <p className="text-sm text-zinc-200 font-mono">{e.performerId}</p>
                <p className="text-xs text-zinc-500">
                  Uploaded {e.uploadedAt ? e.uploadedAt.toDate().toLocaleString() : '…'}
                </p>
              </div>
              <Clock className="h-4 w-4 text-zinc-500" />
            </li>
          ))}
        </ul>
      )}

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-3xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="font-bold text-white">Review ID — {active.performerId}</h3>
              <div className="flex items-center gap-3">
                {secondsLeft > 0 && (
                  <span className="text-xs text-orange-300 font-mono">
                    URL expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                  </span>
                )}
                <button onClick={() => setActive(null)} className="text-zinc-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              <div className="bg-black flex items-center justify-center min-h-[400px]">
                {loadingUrl ? (
                  <LoaderCircle className="animate-spin h-8 w-8 text-zinc-500" />
                ) : signedUrl ? (
                  secondsLeft > 0 ? (
                    <img src={signedUrl} alt="ID document under review" className="max-w-full max-h-[60vh]" />
                  ) : (
                    <button
                      onClick={() => openEntry(active)}
                      className="btn-primary px-4 py-2"
                    >
                      Request new URL
                    </button>
                  )
                ) : (
                  <p className="text-zinc-500">No image</p>
                )}
              </div>

              <div className="p-5 space-y-3">
                <h4 className="font-bold text-white text-sm">Verification checklist</h4>
                <Checkbox
                  checked={decision.nameMatches}
                  onChange={v => setDecision(d => ({ ...d, nameMatches: v }))}
                  label="Legal name matches application"
                />
                <Checkbox
                  checked={decision.photoMatches}
                  onChange={v => setDecision(d => ({ ...d, photoMatches: v }))}
                  label="Photo matches the performer"
                />
                <Checkbox
                  checked={decision.age18Plus}
                  onChange={v => setDecision(d => ({ ...d, age18Plus: v }))}
                  label="DOB on document is 18+"
                />
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Document type</label>
                  <select
                    value={decision.documentType}
                    onChange={e => setDecision(d => ({ ...d, documentType: e.target.value }))}
                    className="input-base"
                  >
                    <option value="">— select —</option>
                    <option value="passport">Passport</option>
                    <option value="drivers_licence">Driver's licence</option>
                    <option value="proof_of_age">Proof-of-age card</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Notes (optional)</label>
                  <textarea
                    value={decision.notes}
                    onChange={e => setDecision(d => ({ ...d, notes: e.target.value }))}
                    className="input-base h-20"
                  />
                </div>

                <div className="flex gap-2 pt-3 border-t border-zinc-800">
                  <button
                    onClick={() => submitDecision('approve')}
                    disabled={submitting}
                    className="btn-primary flex-1 py-2 flex items-center justify-center gap-2"
                  >
                    {submitting ? <LoaderCircle className="animate-spin h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                    Approve
                  </button>
                  <button
                    onClick={() => submitDecision('reject')}
                    disabled={submitting}
                    className="flex-1 py-2 rounded-lg bg-red-900/40 hover:bg-red-800/40 text-red-200 border border-red-500/40 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  After submission the image is force-deleted from storage within 30 seconds.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Checkbox: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-lg cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      className="h-5 w-5 rounded border-zinc-700 bg-zinc-900 text-orange-500"
    />
    <span className="text-sm text-zinc-200">{label}</span>
  </label>
);

export default IdReviewQueue;
