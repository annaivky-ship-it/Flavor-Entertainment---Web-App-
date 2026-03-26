
import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

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
  const [dob, setDob] = useState({ day: '', month: '', year: '' });
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleVerify = () => {
    if (!dob.day || !dob.month || !dob.year) {
      setError('Please enter your full date of birth.');
      return;
    }

    const day = Number(dob.day);
    const month = Number(dob.month);
    const year = Number(dob.year);

    // Validate the date is real (e.g. not Feb 30)
    const birthDate = new Date(year, month - 1, day);
    if (birthDate.getFullYear() !== year || birthDate.getMonth() !== month - 1 || birthDate.getDate() !== day) {
      setError('Please enter a valid date of birth.');
      return;
    }

    // Reject future dates
    const today = new Date();
    if (birthDate > today) {
      setError('Date of birth cannot be in the future.');
      return;
    }

    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age < 18) {
      setError('You must be at least 18 years old to enter this site.');
    } else {
      onVerified();
    }
  };

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);

  return (
    <div role="dialog" aria-modal="true" aria-label="Age verification" className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 max-w-md w-full text-white shadow-2xl shadow-black/50 animate-fade-in ring-1 ring-white/10">
        <div className="text-center mb-6 sm:mb-8">
            <div className="flex flex-col items-center cursor-pointer no-underline group mb-4 sm:mb-6">
                <div className="flex items-center">
                    <span className="font-logo-main text-4xl sm:text-5xl tracking-wider text-white">FLAV</span>
                    <span className="text-4xl sm:text-5xl mx-[-0.15em] relative" style={{top: "-0.05em"}}>🍑</span>
                    <span className="font-logo-main text-4xl sm:text-5xl tracking-wider text-white">R</span>
                </div>
                <span className="font-logo-sub text-lg sm:text-xl text-zinc-500 -mt-2 ml-1 tracking-wide">entertainers</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold mb-2 text-white">Age Verification</h2>
            <p className="text-zinc-400 text-xs sm:text-sm">Please enter your date of birth to continue.</p>
        </div>

        <div className="space-y-6 mb-8">
            <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 ml-1">Day</label>
                    <select 
                        value={dob.day} 
                        onChange={(e) => { setDob(prev => ({ ...prev, day: e.target.value })); setError(null); }}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all appearance-none"
                    >
                        <option value="">DD</option>
                        {days.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 ml-1">Month</label>
                    <select 
                        value={dob.month} 
                        onChange={(e) => { setDob(prev => ({ ...prev, month: e.target.value })); setError(null); }}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all appearance-none"
                    >
                        <option value="">MM</option>
                        {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 ml-1">Year</label>
                    <select 
                        value={dob.year} 
                        onChange={(e) => { setDob(prev => ({ ...prev, year: e.target.value })); setError(null); }}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all appearance-none"
                    >
                        <option value="">YYYY</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
            </div>

            <CustomCheckbox id="terms-check" checked={agreedTerms} onChange={(checked) => { setAgreedTerms(checked); setError(null); }}>
                <span className="text-xs leading-relaxed">
                  I agree to the{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); onShowTermsOfService(); }} className="underline text-orange-400 hover:text-orange-300">Terms</a>
                  {' & '}
                  <a href="#" onClick={(e) => { e.preventDefault(); onShowPrivacyPolicy(); }} className="underline text-orange-400 hover:text-orange-300">Privacy Policy</a>.
                </span>
            </CustomCheckbox>

            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs text-center animate-in zoom-in-95 duration-200">
                    {error}
                </div>
            )}
        </div>

        <button
          onClick={handleVerify}
          disabled={!agreedTerms}
          className="btn-primary w-full py-4 text-lg font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none transition-all"
        >
          Confirm & Enter
        </button>
        
        <p className="mt-6 text-[10px] text-zinc-500 text-center uppercase tracking-widest">
            Strictly 18+ Only
        </p>
      </div>
    </div>
  );
};

export default AgeGate;
