import React, { useState } from 'react';
import { X, LogIn, Mail, Lock } from 'lucide-react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../services/firebaseClient';
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
  const [isLoading, setIsLoading] = useState(false);

  const handleAuthSuccess = async (user: any) => {
    try {
      const token = await user.getIdTokenResult();
      const role = token.claims.role as Role || 'user';
      const performerId = token.claims.performerId as number | undefined;
      
      onLogin({ 
        name: user.displayName || user.email?.split('@')[0] || 'User', 
        role, 
        id: performerId 
      });
    } catch (err) {
      console.error('Error getting custom claims:', err);
      // Fallback for development/testing if claims aren't set up yet
      if (user.email === 'admin@flavorentertainers.com.au') {
        onLogin({ name: 'Admin', role: 'admin' });
      } else {
        const performer = performers.find(p => `${p.name.toLowerCase().split(' ')[0]}@flavorentertainers.com.au` === user.email?.toLowerCase());
        if (performer) {
          onLogin({ name: performer.name, role: 'performer', id: performer.id });
        } else {
          onLogin({ name: user.displayName || 'User', role: 'user' });
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
      setError('Authentication is currently disabled. Please check configuration.');
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await handleAuthSuccess(userCredential.user);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!auth) {
      setError('Authentication is currently disabled. Please check configuration.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await handleAuthSuccess(result.user);
    } catch (err: any) {
      console.error('Google login error:', err);
      setError(err.message || 'Failed to sign in with Google');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="card-base !p-8 !bg-zinc-900 max-w-sm w-full relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors">
          <X className="h-6 w-6" />
        </button>
        <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white">Secure Portal Login</h2>
            <p className="text-zinc-400 mt-1">For Performers, Admins & Clients</p>
        </div>
        
        <button 
          onClick={handleGoogleLogin} 
          disabled={isLoading}
          className="w-full bg-white text-zinc-900 font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 hover:bg-zinc-100 transition-colors mb-6 disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {isLoading ? 'Signing in...' : 'Sign in with Google'}
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-800"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-zinc-900 text-zinc-500">Or continue with email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
            <InputField icon={<Mail />} type="email" name="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <InputField icon={<Lock />} type="password" name="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
            <p className="text-xs text-zinc-500 text-center !mt-2">Demo password is 'password'. Performer emails are `firstname@flavorentertainers.com.au` (e.g., `april@...`).</p>
            <button type="submit" disabled={isLoading} className="btn-primary w-full text-lg flex items-center justify-center gap-2 disabled:opacity-50">
                <LogIn />
                Login
            </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
