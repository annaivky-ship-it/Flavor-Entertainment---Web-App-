
import React, { useState } from 'react';
import { ShieldCheck, FileText, Check } from 'lucide-react';

interface AgeGateProps {
  onVerified: () => void;
  onShowPrivacyPolicy: () => void;
  onShowTermsOfService: () => void;
}

interface CustomCheckboxProps {
  id: string;
  checked: boolean;
  onChange: (c: boolean) => void;
  children: React.ReactNode;
}

// Fix: Explicitly type CustomCheckbox to avoid "missing children" errors in some TypeScript environments.
const CustomCheckbox: React.FC<CustomCheckboxProps> = ({ id, checked, onChange, children }) => (
   <label htmlFor={id} className="flex items-center p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg cursor-pointer hover:bg-zinc-700/70 hover:border-zinc-600 transition-all duration-200">
      <div className="relative h-6 w-6 flex-shrink-0">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="appearance-none h-6 w-6 rounded-md border-2 border-zinc-600 bg-zinc-900 checked:bg-orange-500 checked:border-orange-500 transition-all" />
        {checked && <Check className="h-4 w-4 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white pointer-events-none" />}
      </div>
      <span className="ml-4 text-zinc-200">{children}</span>
  </label>
);

const AgeGate: React.FC<AgeGateProps> = ({ onVerified, onShowPrivacyPolicy, onShowTermsOfService }) => {
  const [agreedAge, setAgreedAge] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);

  const canEnter = agreedAge && agreedTerms;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-lg z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full text-white shadow-2xl shadow-black/50 animate-fade-in">
        <div className="text-center">
            <div className="flex flex-col items-center cursor-pointer no-underline group mb-4">
                <div className="flex items-center">
                    <span className="font-logo-main text-4xl tracking-wider text-white">FLAV</span>
                    <span className="text-4xl mx-[-0.15em] relative" style={{top: "-0.05em"}}>🍑</span>
                    <span className="font-logo-main text-4xl tracking-wider text-white">R</span>
                </div>
                <span className="font-logo-sub text-lg text-zinc-500 -mt-2 ml-1 tracking-wide">entertainers</span>
            </div>
            <h2 className="text-2xl font-semibold mb-2 text-orange-400">Age Verification Required</h2>
            <p className="text-zinc-400 mb-8">You must be 18+ to enter. Please confirm and agree to our terms.</p>
        </div>

        <div className="space-y-4 mb-8">
            {/* Fix: Wrap state setter in an arrow function to ensure correct type matching for onChange prop. */}
            <CustomCheckbox id="age-check" checked={agreedAge} onChange={(checked) => setAgreedAge(checked)}>
                I confirm I am 18 years or older.
            </CustomCheckbox>
            {/* Fix: Wrap state setter in an arrow function to ensure correct type matching for onChange prop. */}
            <CustomCheckbox id="terms-check" checked={agreedTerms} onChange={(checked) => setAgreedTerms(checked)}>
                <span>
                  I agree to the{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); onShowTermsOfService(); }} className="underline text-orange-400 hover:text-orange-300">Terms</a>
                  {' & '}
                  <a href="#" onClick={(e) => { e.preventDefault(); onShowPrivacyPolicy(); }} className="underline text-orange-400 hover:text-orange-300">Privacy Policy</a>.
                </span>
            </CustomCheckbox>
        </div>

        <button
          onClick={onVerified}
          disabled={!canEnter}
          className="btn-primary w-full text-lg"
        >
          Enter Site
        </button>
      </div>
    </div>
  );
};

export default AgeGate;
