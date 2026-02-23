import React, { useState, useEffect, useRef } from 'react';
import { X, Send, LoaderCircle, User, Check, CheckCheck } from 'lucide-react';
import type { Communication, Booking } from '../types';

interface ChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking;
  currentUser: { name: string };
  messages: Communication[];
  onSendMessage: (message: string) => Promise<void>;
}

const ChatDialog: React.FC<ChatDialogProps> = ({ isOpen, onClose, booking, currentUser, messages, onSendMessage }) => {
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setIsSending(true);
    try {
      await onSendMessage(newMessage);
      setNewMessage('');
    } finally {
      setIsSending(false);
    }
  };

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    
    return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="card-base !p-0 !bg-[#0c0c0e] max-w-md w-full flex flex-col h-[650px] max-h-[90vh] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden border-zinc-800">
        {/* Header */}
        <div className="flex-shrink-0 p-4 flex justify-between items-center border-b border-zinc-800 bg-zinc-900/40 backdrop-blur-md relative z-10">
          <div className="flex items-center gap-3">
             <div className="relative">
                <div className="bg-zinc-800 p-2.5 rounded-full border border-zinc-700 shadow-inner">
                    <User className="h-5 w-5 text-zinc-400" />
                </div>
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#0c0c0e] rounded-full"></div>
             </div>
             <div>
                <h2 className="text-lg font-bold text-white leading-tight">
                    {currentUser.name === 'Admin' 
                        ? `${booking.client_name} & ${booking.performer?.name || 'Performer'}`
                        : (booking.client_name === currentUser.name ? booking.performer?.name : booking.client_name)
                    }
                </h2>
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-zinc-500">
                    <span className="text-orange-500/80">{booking.event_type}</span>
                    <span>&bull;</span>
                    <span>{new Date(booking.event_date).toLocaleDateString()}</span>
                </div>
             </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-2 hover:bg-zinc-800 rounded-lg">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-grow p-4 overflow-y-auto bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900/20 via-[#0c0c0e] to-[#0c0c0e] space-y-4 custom-scrollbar">
           {messages.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-center p-8 animate-fade-in">
                   <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mb-4 border border-zinc-800 shadow-xl">
                      <Send className="h-6 w-6 text-zinc-700 -rotate-12" />
                   </div>
                   <p className="font-semibold text-zinc-400">Start the conversation</p>
                   <p className="text-xs mt-2 text-zinc-600 max-w-[200px]">Send a message to discuss event details and preferences.</p>
               </div>
           ) : (
               messages.map((msg, index) => {
                   const isMe = msg.sender === currentUser.name;
                   const showDateSeparator = index === 0 || 
                       new Date(messages[index-1].created_at).toDateString() !== new Date(msg.created_at).toDateString();
                   
                   return (
                       <React.Fragment key={msg.id}>
                           {showDateSeparator && (
                               <div className="flex justify-center my-6">
                                   <span className="bg-zinc-900/80 text-zinc-500 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-zinc-800/50 shadow-sm">
                                       {formatMessageDate(msg.created_at)}
                                   </span>
                               </div>
                           )}
                           <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} group animate-slide-in-up`}>
                               <div className={`max-w-[85%] relative flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                   <div className={`px-4 py-2.5 rounded-2xl shadow-lg relative ${
                                       isMe 
                                       ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-tr-none' 
                                       : 'bg-zinc-800/80 text-zinc-200 rounded-tl-none border border-zinc-700/50 backdrop-blur-sm'
                                   }`}>
                                       {/* Message Tail */}
                                       <div className={`absolute top-0 w-3 h-3 ${
                                           isMe 
                                           ? 'right-[-6px] text-orange-500' 
                                           : 'left-[-6px] text-zinc-800/80'
                                       }`}>
                                           <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                                               {isMe ? (
                                                   <path d="M0 0 L10 0 L0 10 Z" />
                                               ) : (
                                                   <path d="M10 0 L0 0 L10 10 Z" />
                                               )}
                                           </svg>
                                       </div>

                                       <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                                       
                                       <div className={`flex items-center gap-1.5 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                           <span className={`text-[9px] font-medium ${isMe ? 'text-orange-100/70' : 'text-zinc-500'}`}>
                                               {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}).toLowerCase()}
                                           </span>
                                           {isMe && <CheckCheck size={10} className="text-orange-200/60" />}
                                       </div>
                                   </div>
                               </div>
                           </div>
                       </React.Fragment>
                   )
               })
           )}
           <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 p-4 bg-zinc-900/80 border-t border-zinc-800 backdrop-blur-md">
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <div className="flex-grow relative">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e as any);
                    }
                  }}
                  placeholder="Type a message..."
                  rows={1}
                  className="w-full bg-zinc-800/50 text-white border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 placeholder-zinc-500 text-sm resize-none overflow-hidden min-h-[46px] max-h-[120px] transition-all"
                  style={{ height: 'auto' }}
                  onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${target.scrollHeight}px`;
                  }}
                />
            </div>
            <button 
              type="submit" 
              disabled={isSending || !newMessage.trim()}
              className="bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-all duration-300 flex-shrink-0 shadow-lg shadow-orange-500/10 active:scale-95"
            >
              {isSending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 ml-0.5" />}
            </button>
          </form>
          <p className="text-[10px] text-center text-zinc-600 mt-2 font-medium">Shift + Enter for new line</p>
        </div>
      </div>
    </div>
  );
};

export default ChatDialog;