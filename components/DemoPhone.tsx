import React, { useEffect, useState } from 'react';
import type { PhoneMessage } from '../types';
import { Wifi, BatteryFull, X } from 'lucide-react';

interface DemoPhoneProps {
  message: PhoneMessage;
  onClose: () => void;
}

const DemoPhone: React.FC<DemoPhoneProps> = ({ message, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setIsVisible(true);
    }
  }, [message]);

  const handleClose = () => {
    setIsVisible(false);
    // Allow animation to finish before calling parent onClose
    setTimeout(onClose, 400);
  };

  if (!message) {
    return null;
  }
  
  const handleActionClick = (onClick: () => void) => {
    onClick();
    handleClose();
  }

  return (
    <div
      className={`fixed bottom-4 right-4 w-80 h-[500px] bg-black rounded-[40px] border-[10px] border-zinc-800 shadow-2xl z-50 overflow-hidden phone-popup-transition ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
    >
      {/* Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-zinc-800 rounded-b-xl"></div>
      
      {/* Status Bar */}
      <div className="absolute top-0 left-0 right-0 h-8 px-4 flex justify-between items-center text-white text-xs z-10">
        <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <div className="flex items-center gap-1">
          <Wifi size={14} />
          <BatteryFull size={18} />
        </div>
      </div>
      
      {/* App Content */}
      <div className="mt-8 bg-zinc-900 h-[calc(100%-32px)] flex flex-col">
        {/* Header */}
        <div className="bg-zinc-800/80 backdrop-blur-sm p-3 flex items-center justify-between border-b border-zinc-700 flex-shrink-0">
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center font-bold text-white">
                {message.for.charAt(0)}
             </div>
             <div>
                <p className="font-semibold text-white text-sm">To: {message.for}</p>
                <p className="text-xs text-green-400">via Flavor Messaging</p>
             </div>
          </div>
          <button onClick={handleClose} className="text-zinc-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        
        {/* Message Area */}
        <div className="p-4 flex-grow overflow-y-auto flex flex-col justify-end">
          <div className="flex mb-2">
            <div className="bg-orange-500 text-white p-3 rounded-2xl rounded-bl-lg max-w-[90%] animate-slide-in-up">
              <div className="text-sm leading-snug">
                {message.content}
              </div>
            </div>
          </div>
          {message.actions && (
            <div className="flex flex-col gap-2 mt-4 animate-fade-in">
              {message.actions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => handleActionClick(action.onClick)}
                  className={`w-full text-center rounded-lg p-2.5 text-sm font-semibold transition-colors ${action.style === 'secondary' ? 'bg-zinc-600 text-white hover:bg-zinc-500' : 'bg-blue-500 text-white hover:bg-blue-400'}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Home Bar */}
        <div className="p-2 flex-shrink-0">
          <div className="w-32 h-1.5 bg-zinc-600 rounded-full mx-auto"></div>
        </div>
      </div>
    </div>
  );
};

export default DemoPhone;