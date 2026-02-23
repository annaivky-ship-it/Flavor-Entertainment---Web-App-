import React, { useState } from 'react';
import { X, LogIn, Mail, Lock } from 'lucide-react';
import type { Performer, Role } from '../types';
import InputField from './InputField';

interface LoginProps {
  onLogin: (user: { name: string; role: Role; id?: number }) => void;
  onClose: () => void;
  performers: Performer[];
}

const Login: React.FC<LoginProps> = ({ onLogin, onClose, performers }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Admin check
    if (email.toLowerCase() === 'admin@flavorentertainers.com.au' && password === 'password') {
      onLogin({ name: 'Admin', role: 'admin' });
      return;
    }

    // Performer check (uses first name for email)
    const performer = performers.find(p => `${p.name.toLowerCase().split(' ')[0]}@flavorentertainers.com.au` === email.toLowerCase());
    if (performer && password === 'password') {
      onLogin({ name: performer.name, role: 'performer', id: performer.id });
      return;
    }
    
    setError('Invalid email or password.');
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="card-base !p-8 !bg-zinc-900 max-w-sm w-full relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors">
          <X className="h-6 w-6" />
        </button>
        <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white">Secure Portal Login</h2>
            <p className="text-zinc-400 mt-1">For Performers & Admins</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
            <InputField icon={<Mail />} type="email" name="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <InputField icon={<Lock />} type="password" name="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
            <p className="text-xs text-zinc-500 text-center !mt-2">Demo password is 'password'. Performer emails are `firstname@flavorentertainers.com.au` (e.g., `april@...`).</p>
            <button type="submit" className="btn-primary w-full text-lg flex items-center justify-center gap-2">
                <LogIn />
                Login
            </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
