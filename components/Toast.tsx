import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

const iconMap = {
  success: CheckCircle,
  error: AlertTriangle,
  info: Info,
  warning: AlertTriangle,
};

const styleMap = {
  success: 'border-green-500/50 bg-green-950/90 text-green-200',
  error: 'border-red-500/50 bg-red-950/90 text-red-200',
  info: 'border-blue-500/50 bg-blue-950/90 text-blue-200',
  warning: 'border-orange-500/50 bg-orange-950/90 text-orange-200',
};

const iconColorMap = {
  success: 'text-green-400',
  error: 'text-red-400',
  info: 'text-blue-400',
  warning: 'text-orange-400',
};

const progressColorMap = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  warning: 'bg-orange-500',
};

const DURATION = 4000;

const ToastCard: React.FC<{ item: ToastItem; onDismiss: (id: string) => void }> = ({ item, onDismiss }) => {
  const Icon = iconMap[item.type];
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.style.transition = `width ${DURATION}ms linear`;
      requestAnimationFrame(() => {
        if (progressRef.current) progressRef.current.style.width = '0%';
      });
    }
  }, []);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`pointer-events-auto border rounded-xl shadow-2xl shadow-black/50 backdrop-blur-sm overflow-hidden transition-all duration-300 ${styleMap[item.type]} ${item.exiting ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0'}`}
      style={{ animation: item.exiting ? undefined : 'slideInRight 0.3s ease-out' }}
    >
      <div className="flex items-start gap-3 px-4 py-3 min-w-[280px] max-w-[380px]">
        <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${iconColorMap[item.type]}`} />
        <p className="text-sm font-medium flex-1 leading-relaxed">{item.message}</p>
        <button
          onClick={() => onDismiss(item.id)}
          className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity p-0.5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={progressRef} className={`h-0.5 ${progressColorMap[item.type]}`} style={{ width: '100%' }} />
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const styleInjected = useRef(false);

  useEffect(() => {
    if (styleInjected.current) return;
    styleInjected.current = true;
    const style = document.createElement('style');
    style.textContent = `@keyframes slideInRight { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }`;
    document.head.appendChild(style);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
  }, []);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => dismissToast(id), DURATION);
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ toast, dismissToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(item => (
          <ToastCard key={item.id} item={item} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
