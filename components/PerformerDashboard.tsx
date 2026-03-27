import React, { useState } from 'react';
import { Performer, PerformerStatus, Booking, Communication, AuditLog, BookingStatus } from '../types';
import { Calendar, User, Clock, ShieldAlert, MessageSquare, Inbox, Check, X, Users, Timer, LoaderCircle, MessageCircle, Radio, EyeOff, CheckCircle, Smartphone, History, MapPin, Sparkles } from 'lucide-react';
import ChatDialog from './ChatDialog';
import { api } from '../services/api';

interface PerformerDashboardProps {
  performer: Performer;
  bookings: Booking[];
  communications: Communication[];
  auditLogs: AuditLog[];
  onToggleStatus: (status: PerformerStatus) => Promise<void>;
  onViewDoNotServe: () => void;
  onBookingDecision: (bookingId: string, decision: 'accepted' | 'declined', eta?: number) => Promise<void>;
  onUpdateEta: (bookingId: string, eta: number) => Promise<void>;
  onUpdateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  onSetAvailableNow?: (available: boolean, availableUntil?: string) => Promise<void>;
  onUpdateAvailability?: (updates: Partial<import('../types').PerformerAvailability>) => Promise<void>;
}

const statusConfig: Record<PerformerStatus, { color: string; label: string; icon: React.ElementType; bgColor: string; activeColor: string; description: string; }> = {
    available: { 
      color: 'text-green-400', 
      label: 'Available', 
      icon: CheckCircle, 
      bgColor: 'bg-green-500/10', 
      activeColor: 'bg-green-500 text-white',
      description: 'You are visible in the "Available Now" gallery and can receive instant requests.'
    },
    busy: { 
      color: 'text-yellow-400', 
      label: 'Busy', 
      icon: Radio, 
      bgColor: 'bg-yellow-500/10', 
      activeColor: 'bg-yellow-500 text-zinc-900',
      description: 'You are currently on a booking. Clients can still see you but know you are occupied.'
    },
    offline: { 
      color: 'text-zinc-400', 
      label: 'Offline', 
      icon: EyeOff, 
      bgColor: 'bg-zinc-500/10', 
      activeColor: 'bg-zinc-500 text-white',
      description: 'You are hidden from the "Available Now" gallery and won\'t receive instant alerts.'
    },
    pending_verification: {
      color: 'text-yellow-400',
      label: 'Pending Verification',
      icon: ShieldAlert,
      bgColor: 'bg-yellow-500/10',
      activeColor: 'bg-yellow-500 text-zinc-900',
      description: 'Your account is pending verification by an administrator.'
    },
    rejected: {
      color: 'text-red-400',
      label: 'Rejected',
      icon: X,
      bgColor: 'bg-red-500/10',
      activeColor: 'bg-red-500 text-white',
      description: 'Your account has been rejected.'
    }
};

const bookingStatusClasses: Record<Booking['status'], string> = {
  confirmed: 'text-green-400',
  pending_deposit_confirmation: 'text-blue-400',
  deposit_pending: 'text-orange-400',
  pending_vetting: 'text-yellow-400',
  pending_performer_acceptance: 'text-purple-400',
  en_route: 'text-blue-400',
  arrived: 'text-emerald-400',
  in_progress: 'text-indigo-400',
  completed: 'text-zinc-400',
  cancelled: 'text-zinc-500',
  rejected: 'text-red-400'
}

interface BookingCardProps {
  booking: Booking;
  onDecision: (bookingId: string, decision: 'accepted' | 'declined', eta?: number) => Promise<void>;
  etaValue: string;
  onEtaChange: (bookingId: string, value: string) => void;
  onOpenChat: (booking: Booking) => void;
  onUpdateEta?: (bookingId: string, eta: number) => Promise<void>;
  onUpdateStatus?: (bookingId: string, status: BookingStatus) => Promise<void>;
}

const BookingCard: React.FC<BookingCardProps> = ({ booking, onDecision, etaValue, onEtaChange, onOpenChat, onUpdateEta, onUpdateStatus }) => {
  const [isLoading, setIsLoading] = useState<'accept' | 'decline' | 'update_eta' | 'update_status' | null>(null);

  const handleDecision = async (decision: 'accepted' | 'declined') => {
    setIsLoading(decision === 'accepted' ? 'accept' : 'decline');
    try {
      await onDecision(booking.id, decision, Number(etaValue) || undefined);
    } catch (error) {
      console.error("Failed to process booking decision", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleUpdateEta = async () => {
    if (!onUpdateEta || !etaValue) return;
    setIsLoading('update_eta');
    try {
      await onUpdateEta(booking.id, Number(etaValue));
    } catch (error) {
      console.error("Failed to update ETA", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleStatusUpdate = async (status: BookingStatus) => {
    if (!onUpdateStatus) return;
    setIsLoading('update_status');
    try {
      await onUpdateStatus(booking.id, status);
    } catch (error) {
      console.error("Failed to update status", error);
    } finally {
      setIsLoading(null);
    }
  };

  const isPending = booking.status !== 'confirmed' && booking.status !== 'rejected' && !['en_route', 'arrived', 'in_progress', 'completed', 'cancelled'].includes(booking.status);

  return (
    <div className="bg-zinc-900/70 p-4 rounded-lg border border-zinc-700/50 hover:border-zinc-600 transition-colors">
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-2">
            <div>
                <p className="font-bold text-lg text-white">{booking.event_type}</p>
                <p className={`text-sm font-semibold capitalize ${bookingStatusClasses[booking.status]}`}>{booking.status.replace(/_/g, ' ')}</p>
            </div>
            <div className="text-left sm:text-right text-sm">
               <div className="flex items-center gap-2 text-zinc-300"><Calendar className="h-4 w-4 text-orange-400"/> {new Date(booking.event_date).toLocaleDateString()}</div>
               <div className="flex items-center gap-2 text-zinc-300 mt-1"><Clock className="h-4 w-4 text-orange-400"/> {booking.event_time}</div>
            </div>
        </div>
         <div className="mt-3 pt-3 border-t border-zinc-700 flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-400 text-sm">
           <span className="flex items-center gap-2"><User className="h-4 w-4 text-orange-400" /> Client: {booking.client_name}</span>
           <span className="flex items-center gap-2"><Users className="h-4 w-4 text-orange-400" /> Guests: {booking.number_of_guests}</span>
        </div>
        
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
             <button 
                onClick={() => onOpenChat(booking)}
                className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-600 hover:border-zinc-500 font-semibold py-1.5 px-3 rounded flex items-center gap-2 transition-colors"
             >
                <MessageCircle size={14} />
                Message Client
             </button>

             <div className="flex items-center gap-2">
                {booking.status === 'confirmed' && (
                  <button onClick={() => handleStatusUpdate('en_route')} disabled={!!isLoading} className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded-md flex items-center gap-1.5 transition-colors">
                    {isLoading === 'update_status' ? <LoaderCircle size={14} className="animate-spin" /> : <><Radio size={14}/> On My Way</>}
                  </button>
                )}
                {booking.status === 'en_route' && (
                  <button onClick={() => handleStatusUpdate('arrived')} disabled={!!isLoading} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-md flex items-center gap-1.5 transition-colors">
                    {isLoading === 'update_status' ? <LoaderCircle size={14} className="animate-spin" /> : <><MapPin size={14}/> I've Arrived</>}
                  </button>
                )}
                {booking.status === 'arrived' && (
                  <button onClick={() => handleStatusUpdate('in_progress')} disabled={!!isLoading} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-3 rounded-md flex items-center gap-1.5 transition-colors">
                    {isLoading === 'update_status' ? <LoaderCircle size={14} className="animate-spin" /> : <><Sparkles size={14}/> Start Performance</>}
                  </button>
                )}
                {booking.status === 'in_progress' && (
                  <button onClick={() => handleStatusUpdate('completed')} disabled={!!isLoading} className="text-xs bg-zinc-600 hover:bg-zinc-700 text-white font-bold py-1.5 px-3 rounded-md flex items-center gap-1.5 transition-colors">
                    {isLoading === 'update_status' ? <LoaderCircle size={14} className="animate-spin" /> : <><CheckCircle size={14}/> Complete Job</>}
                  </button>
                )}
             </div>
        </div>

         {isPending && (
            <div className="mt-4 pt-4 border-t border-zinc-700/50 flex flex-col sm:flex-row items-center gap-3">
                <p className="text-xs font-semibold text-zinc-300 mr-2 flex-shrink-0">
                    {booking.status === 'pending_performer_acceptance' ? 'Action Required:' : 'Update ETA:'}
                </p>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                   <div className="relative flex-grow group">
                      <Timer className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none group-focus-within:text-orange-400 transition-colors" />
                      <input
                        type="number"
                        placeholder="ETA (mins)"
                        title="Estimated time of arrival in minutes"
                        value={etaValue}
                        onChange={(e) => onEtaChange(booking.id, e.target.value)}
                        className="bg-zinc-800 border border-zinc-600 text-white text-xs rounded-md focus:ring-1 focus:ring-orange-500 focus:border-orange-500 block w-full pl-8 pr-2 py-1.5 transition-all"
                        disabled={!!isLoading}
                      />
                   </div>
                   {booking.status === 'pending_performer_acceptance' ? (
                       <>
                           <button onClick={() => handleDecision('accepted')} disabled={!!isLoading} className="text-xs bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5 transition-colors shadow-md flex-shrink-0 w-24">
                              {isLoading === 'accept' ? <LoaderCircle size={14} className="animate-spin" /> : <><Check size={14}/> Accept</>}
                           </button>
                           <button onClick={() => handleDecision('declined')} disabled={!!isLoading} className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5 transition-colors shadow-md flex-shrink-0 w-24">
                              {isLoading === 'decline' ? <LoaderCircle size={14} className="animate-spin" /> : <><X size={14}/> Decline</>}
                           </button>
                       </>
                   ) : (
                       <button onClick={handleUpdateEta} disabled={!!isLoading || !etaValue} className="text-xs bg-orange-600 hover:bg-orange-700 text-white font-bold py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5 transition-colors shadow-md flex-shrink-0 w-24 disabled:opacity-50 disabled:cursor-not-allowed">
                          {isLoading === 'update_eta' ? <LoaderCircle size={14} className="animate-spin" /> : <><Timer size={14}/> Update</>}
                       </button>
                   )}
                </div>
            </div>
        )}
    </div>
  );
};


const PerformerDashboard: React.FC<PerformerDashboardProps> = ({ performer, bookings, communications, auditLogs, onToggleStatus, onViewDoNotServe, onBookingDecision, onUpdateEta, onUpdateBookingStatus, onSetAvailableNow, onUpdateAvailability }) => {
  const [etas, setEtas] = useState<Record<string, string>>({});
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<PerformerStatus | null>(null);
  const [availableUntilTime, setAvailableUntilTime] = useState('23:00');
  const [isTogglingAvailability, setIsTogglingAvailability] = useState(false);
  
  // Chat State
  const [activeChatBooking, setActiveChatBooking] = useState<Booking | null>(null);
  const [chatMessages, setChatMessages] = useState<Communication[]>([]);

  const systemCommunications = communications.filter(c => c.type !== 'direct_message');

  const handleEtaChange = (bookingId: string, value: string) => {
    setEtas(prev => ({ ...prev, [bookingId]: value }));
  };
  
  const handleStatusChange = async (newStatus: PerformerStatus) => {
    if (newStatus === performer.status) return;
    setIsUpdatingStatus(newStatus);
    try {
      await onToggleStatus(newStatus);
    } catch (err) {
      console.error("Status update failed:", err);
    } finally {
      setIsUpdatingStatus(null);
    }
  };
  
  const handleOpenChat = async (booking: Booking) => {
      setActiveChatBooking(booking);
      try {
          const { data } = await api.getBookingMessages(booking.id);
          setChatMessages(data || []);
      } catch (err) {
          console.error("Failed to load chat messages", err);
      }
  };
  
  const handleSendMessage = async (messageText: string) => {
      if (!activeChatBooking) return;
      
      try {
          const { data, error } = await api.sendBookingMessage(
              activeChatBooking.id,
              messageText,
              performer.name,
              activeChatBooking.client_name
          );
          
          if (error) throw error;
          if (data) {
              setChatMessages(prev => [...prev, data]);
          }
      } catch (err) {
          console.error("Failed to send message", err);
      }
  };

  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
  const pendingBookings = bookings.filter(b => b.status !== 'confirmed' && b.status !== 'rejected');

  return (
    <div className="animate-fade-in space-y-8 pb-20">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Performer Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-xl text-orange-400">Welcome, {performer.name}</p>
             <span className="h-1.5 w-1.5 rounded-full bg-zinc-600"></span>
             <p className="text-sm text-zinc-500">ID: #{performer.id}</p>
          </div>
        </div>
        <button 
          onClick={onViewDoNotServe}
          className="bg-red-600/90 hover:bg-red-600 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors duration-300 flex items-center justify-center gap-2 shadow-lg shadow-red-500/10 hover:shadow-red-500/20"
        >
          <ShieldAlert className="h-5 w-5" />
          'Do Not Serve' List
        </button>
      </div>
      
      {/* Availability Controls */}
                <div className="card-base !p-6 border-zinc-800/50 space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-white">Your Availability</h2>
                            <p className="text-sm text-zinc-400 mt-1">Control when clients can see and book you</p>
                        </div>
                        <div className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                            performer.availability?.is_available_now
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}>
                            {performer.availability?.is_available_now ? '● Online' : '○ Offline'}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Available Now Toggle */}
                        <div className={`p-5 rounded-xl border-2 transition-all cursor-pointer ${
                            performer.availability?.is_available_now
                                ? 'bg-green-500/10 border-green-500'
                                : 'bg-zinc-900 border-zinc-700 hover:border-zinc-600'
                        }`} onClick={async () => {
                            if (isTogglingAvailability || !onSetAvailableNow) return;
                            setIsTogglingAvailability(true);
                            try {
                                const newState = !performer.availability?.is_available_now;
                                // Build available_until as today + selected time in AWST
                                let until: string | undefined;
                                if (newState && availableUntilTime) {
                                    const now = new Date();
                                    const [h, m] = availableUntilTime.split(':').map(Number);
                                    const untilDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
                                    if (untilDate <= now) untilDate.setDate(untilDate.getDate() + 1);
                                    until = untilDate.toISOString();
                                }
                                await onSetAvailableNow(newState, until);
                            } finally {
                                setIsTogglingAvailability(false);
                            }
                        }}>
                            <div className="flex items-center gap-3 mb-2">
                                {isTogglingAvailability ? (
                                    <LoaderCircle className="h-6 w-6 animate-spin text-orange-400" />
                                ) : performer.availability?.is_available_now ? (
                                    <CheckCircle className="h-6 w-6 text-green-400" />
                                ) : (
                                    <EyeOff className="h-6 w-6 text-zinc-500" />
                                )}
                                <span className="font-bold text-white text-lg">
                                    {performer.availability?.is_available_now ? 'Available Now' : 'Go Available'}
                                </span>
                            </div>
                            <p className="text-xs text-zinc-400">
                                {performer.availability?.is_available_now
                                    ? 'You are visible in the gallery and can receive ASAP bookings'
                                    : 'Click to go online and appear in the Available Now gallery'}
                            </p>
                        </div>

                        {/* Available Until Selector */}
                        <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-700">
                            <div className="flex items-center gap-3 mb-3">
                                <Clock className="h-5 w-5 text-orange-400" />
                                <span className="font-semibold text-white">Auto-Off Time</span>
                            </div>
                            <select
                                value={availableUntilTime}
                                onChange={(e) => setAvailableUntilTime(e.target.value)}
                                className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white"
                            >
                                {['21:00','22:00','23:00','00:00','01:00','02:00','03:00','04:00'].map(t => (
                                    <option key={t} value={t}>{t === '00:00' ? '12:00 AM' : Number(t.split(':')[0]) > 12 ? `${Number(t.split(':')[0]) - 12}:00 PM` : `${Number(t.split(':')[0])}:00 AM`}</option>
                                ))}
                            </select>
                            <p className="text-xs text-zinc-500 mt-2">Availability auto-expires at this time</p>
                        </div>
                    </div>

                    {/* Scheduled Availability Toggle */}
                    <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={performer.availability?.is_available_scheduled || false}
                                onChange={async (e) => {
                                    if (onUpdateAvailability) {
                                        await onUpdateAvailability({ is_available_scheduled: e.target.checked });
                                    }
                                }}
                                className="h-5 w-5 rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500"
                            />
                            <div>
                                <span className="font-semibold text-white">Taking Future Bookings</span>
                                <p className="text-xs text-zinc-400">Allow clients to schedule you for upcoming events</p>
                            </div>
                        </label>
                    </div>
                </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="card-base !p-6 lg:col-span-1 flex flex-col h-full">
          <div>
            <div className="flex items-center gap-2 mb-2">
               <Smartphone className="h-5 w-5 text-orange-400" />
               <h2 className="text-2xl font-semibold text-white">Availability Status</h2>
            </div>
            <p className="text-sm text-zinc-400 mb-6">Clients see your live status in the gallery.</p>
            
            <div className="flex p-1.5 bg-zinc-950 rounded-xl border border-zinc-800 gap-1.5">
              {(['available', 'busy', 'offline'] as PerformerStatus[]).map((status) => {
                const Config = statusConfig[status];
                const isActive = performer.status === status;
                const isUpdating = isUpdatingStatus === status;
                
                return (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    disabled={!!isUpdatingStatus}
                    className={`flex-1 flex flex-col items-center justify-center py-3 px-2 rounded-lg transition-all duration-300 gap-1.5 border ${
                      isActive 
                        ? `${Config.activeColor} border-transparent shadow-lg shadow-black/50 scale-[1.02]` 
                        : `bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50`
                    }`}
                  >
                    {isUpdating ? (
                      <LoaderCircle size={18} className="animate-spin" />
                    ) : (
                      <Config.icon size={18} />
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-wider">{Config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          
          <div className={`mt-6 p-4 rounded-xl border transition-all duration-500 ${statusConfig[performer.status].bgColor} ${statusConfig[performer.status].color} flex flex-col gap-2`}>
             <div className="flex items-center gap-3">
               <div className="p-2 rounded-full bg-black/20">
                 {React.createElement(statusConfig[performer.status].icon, { size: 18 })}
               </div>
               <div>
                 <p className="text-xs opacity-70 font-semibold uppercase tracking-tight">Active Mode</p>
                 <p className="font-bold text-lg">{statusConfig[performer.status].label}</p>
               </div>
             </div>
             <p className="text-xs opacity-80 leading-relaxed italic border-t border-white/10 pt-2 mt-1">
               {statusConfig[performer.status].description}
             </p>
          </div>
        </div>

         <div className="card-base !p-6 lg:col-span-2">
            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-3"><MessageSquare /> Communications</h2>
             {systemCommunications.length > 0 ? (
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2 -mr-2">
                  {systemCommunications.map(comm => (
                    <div key={comm.id} className="bg-zinc-900/70 p-3 rounded-md text-sm border border-zinc-700/50">
                        <p className="text-zinc-200">{comm.message}</p>
                        <p className="text-xs text-zinc-500 mt-1">From: <span className="text-orange-400 font-semibold">{comm.sender}</span> &bull; {new Date(comm.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
             ) : (
                <div className="text-center py-8 text-zinc-500">
                   <Inbox className="h-12 w-12 mx-auto mb-2 text-zinc-600" />
                   <p>No new system notifications.</p>
                </div>
             )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="card-base !p-6">
             <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar className="h-6 w-6 text-orange-400" />
                Your Bookings
             </h2>
             
             <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-semibold text-orange-400 mb-4 border-b border-zinc-800 pb-2 flex justify-between items-center">
                    <span>Pending Actions</span>
                    <span className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded text-xs">{pendingBookings.length}</span>
                  </h3>
                  {pendingBookings.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {pendingBookings.map(booking => (
                            <BookingCard 
                              key={booking.id} 
                              booking={booking} 
                              onDecision={onBookingDecision} 
                              etaValue={etas[booking.id] !== undefined ? etas[booking.id] : (booking.performer_eta_minutes?.toString() || '')} 
                              onEtaChange={handleEtaChange} 
                              onOpenChat={handleOpenChat} 
                              onUpdateEta={onUpdateEta}
                              onUpdateStatus={onUpdateBookingStatus}
                            />
                          ))}
                      </div>
                  ) : (
                      <div className="bg-zinc-950/30 border border-dashed border-zinc-800 rounded-lg py-8 text-center">
                        <p className="text-zinc-500 text-sm">No pending booking requests at this time.</p>
                      </div>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-green-400 mb-4 border-b border-zinc-800 pb-2 flex justify-between items-center">
                    <span>Confirmed Bookings</span>
                    <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-xs">{confirmedBookings.length}</span>
                  </h3>
                  {confirmedBookings.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {confirmedBookings.map(booking => (
                           <BookingCard 
                            key={booking.id} 
                            booking={booking} 
                            onDecision={onBookingDecision} 
                            etaValue={''} 
                            onEtaChange={() => {}} 
                            onOpenChat={handleOpenChat} 
                            onUpdateEta={onUpdateEta}
                            onUpdateStatus={onUpdateBookingStatus}
                           />
                         ))}
                      </div>
                  ) : (
                      <div className="bg-zinc-950/30 border border-dashed border-zinc-800 rounded-lg py-8 text-center">
                        <p className="text-zinc-500 text-sm">You have no confirmed upcoming bookings.</p>
                      </div>
                  )}
                </div>
             </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="card-base !p-6 h-full">
            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                <History className="h-6 w-6 text-orange-400" />
                Recent Activity
             </h2>
             <p className="text-xs text-zinc-500 mb-6">Real-time audit log of your platform actions.</p>
             <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {auditLogs.length > 0 ? (
                  auditLogs.map(log => (
                    <div key={log.id} className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50 flex flex-col gap-2 hover:border-zinc-700 transition-colors group">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">{log.action.replace(/_/g, ' ')}</span>
                        <span className="text-[10px] text-zinc-600 group-hover:text-zinc-400 transition-colors">
                          {/* Fix: Use createdAt instead of timestamp to match the interface. */}
                          {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-snug">
                        {log.action === 'PERFORMER_STATUS_CHANGE' ? (
                          <>Changed status from <span className="text-zinc-500 font-semibold">{log.details.oldStatus}</span> to <span className="text-white font-bold">{log.details.newStatus}</span></>
                        ) : (
                          <span>Performed administrative action.</span>
                        )}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                     <Clock className="h-10 w-10 text-zinc-800 mx-auto mb-2" />
                     <p className="text-sm text-zinc-600">No recent activity found.</p>
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>
      
      {activeChatBooking && (
          <ChatDialog
              isOpen={!!activeChatBooking}
              onClose={() => setActiveChatBooking(null)}
              booking={activeChatBooking}
              currentUser={performer}
              messages={chatMessages}
              onSendMessage={handleSendMessage}
          />
      )}
    </div>
  );
};

export default PerformerDashboard;