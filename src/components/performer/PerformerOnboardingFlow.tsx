import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  CheckCircle, LoaderCircle, Phone, Mail, User, Camera, CreditCard,
  Image as ImageIcon, Shield, FileSignature, Award, AlertTriangle,
} from 'lucide-react';
import { db, auth } from '../../../services/firebaseClient';
import {
  performerApply, performerRequestIdUploadUrl, performerNotifyIdUploaded,
  performerSubmitLiveness, performerAddBankAccount, performerInitiatePennyDrop,
  performerConfirmPennyDrop, performerSubmitPortfolio,
  performerAcknowledgeSafetyBriefing, performerSignContract,
  type PerformerStatus,
} from '../../services/verification';
import LivenessCheck from '../verification/LivenessCheck';

interface PerformerDoc {
  status?: PerformerStatus;
  stageName?: string;
}

const STEP_ORDER: PerformerStatus[] = [
  'awaiting_id', 'awaiting_id_review', 'awaiting_liveness', 'awaiting_banking',
  'awaiting_penny_drop', 'awaiting_portfolio', 'awaiting_safety',
  'awaiting_contract', 'awaiting_activation', 'active',
];

const PerformerOnboardingFlow: React.FC = () => {
  const [doc_, setDoc] = useState<PerformerDoc | null>(null);
  const [loaded, setLoaded] = useState(false);
  const uid = auth?.currentUser?.uid || null;

  useEffect(() => {
    if (!db || !uid) return;
    const ref = doc(db, 'performers', uid);
    const unsub = onSnapshot(ref, snap => {
      setDoc(snap.exists() ? (snap.data() as PerformerDoc) : null);
      setLoaded(true);
    });
    return () => unsub();
  }, [uid]);

  if (!uid) {
    return <p className="p-8 text-center text-zinc-400">Please sign in to apply.</p>;
  }
  if (!loaded) {
    return <p className="p-8 text-center text-zinc-400 flex items-center justify-center gap-2"><LoaderCircle className="animate-spin h-4 w-4" /> Loading…</p>;
  }

  const status: PerformerStatus = doc_?.status || ('not_applied' as any);

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold text-white">Performer Onboarding</h1>

      <ProgressList currentStatus={status} />

      {(status as string) === 'not_applied' && <ApplyStep />}
      {status === 'awaiting_id' && <IdUploadStep />}
      {status === 'awaiting_id_review' && <AwaitingReviewStep />}
      {status === 'awaiting_liveness' && <LivenessStep />}
      {status === 'awaiting_banking' && <BankingStep />}
      {status === 'awaiting_penny_drop' && <PennyDropStep />}
      {status === 'awaiting_portfolio' && <PortfolioStep />}
      {status === 'awaiting_safety' && <SafetyStep />}
      {status === 'awaiting_contract' && <ContractStep />}
      {status === 'awaiting_activation' && <AwaitingActivationStep />}
      {status === 'active' && <ActiveStep />}
      {status === 'rejected' && <RejectedStep />}
    </div>
  );
};

// --- Progress indicator ---

const ProgressList: React.FC<{ currentStatus: PerformerStatus }> = ({ currentStatus }) => {
  const currentIdx = STEP_ORDER.indexOf(currentStatus);
  const labels: { key: PerformerStatus; label: string; icon: React.ElementType }[] = [
    { key: 'awaiting_id', label: 'Upload ID', icon: User },
    { key: 'awaiting_liveness', label: 'Liveness', icon: Camera },
    { key: 'awaiting_banking', label: 'Banking', icon: CreditCard },
    { key: 'awaiting_portfolio', label: 'Portfolio', icon: ImageIcon },
    { key: 'awaiting_safety', label: 'Safety briefing', icon: Shield },
    { key: 'awaiting_contract', label: 'Contract', icon: FileSignature },
    { key: 'active', label: 'Active', icon: Award },
  ];
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {labels.map(item => {
        const itemIdx = STEP_ORDER.indexOf(item.key);
        const done = itemIdx < currentIdx;
        const current = itemIdx === currentIdx;
        return (
          <li
            key={item.key}
            className={`px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${
              done ? 'bg-green-900/30 border-green-500/40 text-green-300' :
              current ? 'bg-orange-900/30 border-orange-500/40 text-orange-300' :
              'bg-zinc-800 border-zinc-700 text-zinc-500'
            }`}
          >
            <item.icon className="h-3 w-3" />
            {item.label}
            {done && <CheckCircle className="h-3 w-3" />}
          </li>
        );
      })}
    </ol>
  );
};

// --- Steps ---

const ApplyStep: React.FC = () => {
  const [stageName, setStageName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [phoneE164, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      await performerApply({ stageName, legalName, contactPhoneE164: phoneE164, contactEmail: email });
    } catch (err) { setError((err as Error).message); }
    finally { setSubmitting(false); }
  };

  return (
    <Card title="Apply">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input icon={<User />} label="Stage name" value={stageName} onChange={setStageName} required />
        <Input icon={<User />} label="Legal name" value={legalName} onChange={setLegalName} />
        <Input icon={<Phone />} label="Mobile (E.164)" value={phoneE164} onChange={setPhone} placeholder="+61400000000" required />
        <Input icon={<Mail />} label="Email" value={email} onChange={setEmail} type="email" required />
        {error && <Err msg={error} />}
        <button disabled={submitting} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
          {submitting && <LoaderCircle className="animate-spin h-4 w-4" />} Submit application
        </button>
      </form>
    </Card>
  );
};

const IdUploadStep: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) { setError('Choose an image first'); return; }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('JPEG or PNG only'); return;
    }
    setSubmitting(true); setError(null);
    try {
      const { uploadUrl, storagePath } = await performerRequestIdUploadUrl({
        contentType: file.type as 'image/jpeg' | 'image/png',
      });
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
      await performerNotifyIdUploaded({ storagePath });
    } catch (err) { setError((err as Error).message); }
    finally { setSubmitting(false); }
  };

  return (
    <Card title="Upload your ID">
      <p className="text-sm text-zinc-400 mb-3">
        We need a clear photo of your government ID for a one-time admin review.
        After review, the image is permanently deleted from our storage —
        we keep no copy of your document.
      </p>
      <input
        type="file"
        accept="image/jpeg,image/png"
        onChange={e => setFile(e.target.files?.[0] || null)}
        className="block w-full text-sm text-zinc-300 file:btn-primary file:px-4 file:py-2 file:mr-3 file:rounded-md file:border-0"
      />
      {error && <Err msg={error} />}
      <button onClick={handleUpload} disabled={submitting || !file} className="btn-primary w-full py-3 mt-3 flex items-center justify-center gap-2">
        {submitting && <LoaderCircle className="animate-spin h-4 w-4" />} Upload ID
      </button>
    </Card>
  );
};

const AwaitingReviewStep: React.FC = () => (
  <Card title="ID under review">
    <p className="text-sm text-zinc-300">
      Our admin team is reviewing your ID. You'll be notified by SMS as soon as
      it clears (usually within a few hours during business hours).
    </p>
  </Card>
);

const LivenessStep: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (running) {
    return <LivenessCheck
      onComplete={async (result) => {
        try {
          await performerSubmitLiveness({
            embedding: result.embedding,
            livenessScore: result.livenessScore,
            ageEstimate: result.ageEstimate,
          });
        } catch (err) {
          setError((err as Error).message);
        }
        setRunning(false);
      }}
      onCancel={() => setRunning(false)}
    />;
  }

  return (
    <Card title="Liveness check">
      <p className="text-sm text-zinc-300 mb-3">
        Your ID has been approved. Now we need a brief on-device liveness check
        to confirm you're the person on the ID. Takes ~5 seconds.
      </p>
      {error && <Err msg={error} />}
      <button onClick={() => setRunning(true)} className="btn-primary w-full py-3">
        Start liveness check
      </button>
    </Card>
  );
};

const BankingStep: React.FC = () => {
  const [bsb, setBsb] = useState('');
  const [acct, setAcct] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      await performerAddBankAccount({ bsb, accountNumber: acct, accountName: name });
    } catch (err) { setError((err as Error).message); }
    finally { setSubmitting(false); }
  };

  return (
    <Card title="Banking details">
      <p className="text-xs text-zinc-500 mb-3">
        Account details are tokenised by our payments provider (Monoova). We never
        store your raw BSB or account number — only an encrypted token reference.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Input icon={<CreditCard />} label="BSB" value={bsb} onChange={setBsb} placeholder="123-456" required />
        <Input icon={<CreditCard />} label="Account number" value={acct} onChange={setAcct} required />
        <Input icon={<User />} label="Account name" value={name} onChange={setName} required />
        {error && <Err msg={error} />}
        <button disabled={submitting} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
          {submitting && <LoaderCircle className="animate-spin h-4 w-4" />} Add account
        </button>
      </form>
    </Card>
  );
};

const PennyDropStep: React.FC = () => {
  const [hint, setHint] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiate = async () => {
    setSubmitting(true); setError(null);
    try {
      const r = await performerInitiatePennyDrop({});
      setHint(r.hint);
    } catch (err) { setError((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const confirm = async () => {
    if (code.length !== 6) { setError('Code is 6 characters'); return; }
    setSubmitting(true); setError(null);
    try {
      await performerConfirmPennyDrop({ code });
    } catch (err) { setError((err as Error).message); }
    finally { setSubmitting(false); }
  };

  return (
    <Card title="Verify your account (penny drop)">
      <p className="text-sm text-zinc-400 mb-3">
        We'll send $0.01 to your account with a unique 6-character code in the reference.
        Open your banking app, find the deposit, and enter the code below.
      </p>
      {!hint ? (
        <button onClick={initiate} disabled={submitting} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
          {submitting && <LoaderCircle className="animate-spin h-4 w-4" />} Send $0.01 with code
        </button>
      ) : (
        <>
          <div className="p-3 mb-3 bg-blue-900/30 border border-blue-500/40 rounded text-sm text-blue-200">{hint}</div>
          <input
            className="input-base text-center text-xl font-mono uppercase"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABC123"
          />
          <button onClick={confirm} disabled={submitting || code.length !== 6} className="btn-primary w-full py-3 mt-3 flex items-center justify-center gap-2">
            {submitting && <LoaderCircle className="animate-spin h-4 w-4" />} Confirm
          </button>
        </>
      )}
      {error && <Err msg={error} />}
    </Card>
  );
};

const PortfolioStep: React.FC = () => {
  const [photos, setPhotos] = useState('');
  const [video, setVideo] = useState('');
  const [services, setServices] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true); setError(null);
    try {
      await performerSubmitPortfolio({
        photos: photos.split('\n').map(s => s.trim()).filter(Boolean),
        videoIntroUrl: video || undefined,
        services: services.split(',').map(s => s.trim()).filter(Boolean),
      });
    } catch (err) { setError((err as Error).message); }
    finally { setSubmitting(false); }
  };

  return (
    <Card title="Portfolio">
      <p className="text-xs text-zinc-500 mb-3">
        Add at least one portfolio photo URL and the services you offer.
      </p>
      <div className="space-y-3">
        <textarea
          placeholder="One photo URL per line"
          className="input-base h-28"
          value={photos}
          onChange={e => setPhotos(e.target.value)}
        />
        <input
          placeholder="Video intro URL (optional)"
          className="input-base"
          value={video}
          onChange={e => setVideo(e.target.value)}
        />
        <input
          placeholder="Services (comma-separated, e.g. waitress-topless, show-pearl)"
          className="input-base"
          value={services}
          onChange={e => setServices(e.target.value)}
        />
        {error && <Err msg={error} />}
        <button onClick={submit} disabled={submitting} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
          {submitting && <LoaderCircle className="animate-spin h-4 w-4" />} Submit portfolio
        </button>
      </div>
    </Card>
  );
};

const SafetyStep: React.FC = () => {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!agreed) { setError('Please confirm you have read the briefing'); return; }
    setSubmitting(true); setError(null);
    try {
      await performerAcknowledgeSafetyBriefing({ acknowledged: true });
    } catch (err) { setError((err as Error).message); }
    finally { setSubmitting(false); }
  };

  return (
    <Card title="Safety briefing">
      <div className="text-sm text-zinc-300 space-y-2 mb-4 max-h-60 overflow-y-auto pr-2">
        <p>
          <strong>Read the full safety briefing in <code>docs/safety-briefing.md</code>.</strong>
        </p>
        <ul className="list-disc list-inside space-y-1 text-zinc-400">
          <li>You may flag any client at any time using the in-booking flag button.</li>
          <li>No-touch policy is mandatory unless explicitly negotiated; breaches result in immediate DNS placement.</li>
          <li>You can end any booking early without penalty if you feel unsafe.</li>
          <li>Admin support is available 24/7 via the dashboard "Help" button.</li>
        </ul>
      </div>
      <label className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-700 rounded cursor-pointer">
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
        <span className="text-sm text-zinc-200">I have read and understood the safety briefing.</span>
      </label>
      {error && <Err msg={error} />}
      <button onClick={submit} disabled={submitting || !agreed} className="btn-primary w-full py-3 mt-3 flex items-center justify-center gap-2">
        {submitting && <LoaderCircle className="animate-spin h-4 w-4" />} I acknowledge
      </button>
    </Card>
  );
};

const ContractStep: React.FC = () => {
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true); setError(null);
    try {
      await performerSignContract({ signature });
    } catch (err) { setError((err as Error).message); }
    finally { setSubmitting(false); }
  };

  return (
    <Card title="Contractor agreement">
      <p className="text-sm text-zinc-400 mb-3">
        Type your full legal name as a digital signature for the standard contractor agreement.
      </p>
      <input
        className="input-base"
        value={signature}
        onChange={e => setSignature(e.target.value)}
        placeholder="Your full legal name"
      />
      {error && <Err msg={error} />}
      <button onClick={submit} disabled={submitting || signature.length < 2} className="btn-primary w-full py-3 mt-3 flex items-center justify-center gap-2">
        {submitting && <LoaderCircle className="animate-spin h-4 w-4" />} Sign
      </button>
    </Card>
  );
};

const AwaitingActivationStep: React.FC = () => (
  <Card title="Waiting for activation">
    <p className="text-sm text-zinc-300">
      You're all set. An admin will activate your profile shortly. You'll get an SMS the moment your profile goes live.
    </p>
  </Card>
);

const ActiveStep: React.FC = () => (
  <Card title="Live!">
    <p className="text-sm text-green-300 flex items-center gap-2">
      <CheckCircle className="h-4 w-4" /> Your profile is active and visible to clients.
    </p>
  </Card>
);

const RejectedStep: React.FC = () => (
  <Card title="Application not accepted">
    <p className="text-sm text-zinc-300">
      Your application was not accepted at this time. Please contact admin if you believe this is an error.
    </p>
  </Card>
);

// --- Bits ---

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="card-base !p-5">
    <h3 className="font-bold text-white mb-3">{title}</h3>
    {children}
  </div>
);

const Input: React.FC<{
  icon: React.ReactNode; label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean;
}> = ({ icon, label, value, onChange, type = 'text', placeholder, required }) => (
  <div>
    <label className="block text-xs text-zinc-400 mb-1">{label}{required && ' *'}</label>
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="input-base !pl-10"
      />
    </div>
  </div>
);

const Err: React.FC<{ msg: string }> = ({ msg }) => (
  <div className="p-2 bg-red-900/40 border border-red-500/50 rounded flex items-start gap-2">
    <AlertTriangle className="h-4 w-4 text-red-300 mt-0.5" />
    <p className="text-sm text-red-200">{msg}</p>
  </div>
);

export default PerformerOnboardingFlow;
