import React, { useState } from 'react';
import { Performer, PerformerStatus, Booking, Communication, AuditLog, BookingStatus, ServiceArea } from '../types';
import { Calendar, User, Clock, ShieldAlert, MessageSquare, Inbox, Check, X, Users, Timer, LoaderCircle, MessageCircle, Radio, EyeOff, CheckCircle, Smartphone, History, MapPin, Sparkles, Save, Edit3 } from 'lucide-react';
import ChatDialog from './ChatDialog';
import { api } from '../services/api';

const ALL_SERVICE_AREAS: ServiceArea[] = ['Perth North', 'Perth South', 'Southwest', 'Northwest'];

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
  onUpdatePerformer?: (performerId: number, updates: Partial<Performer>) => Promise<void>;
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
    if (decision === 'declined') {
      const confirmed = window.confirm(
        `Are you sure you want to decline this booking from ${booking.client_name}?`
      );
      if (!confirmed) return;
    }
    setIsLoading(decision === 'accepted' ? 'accept' : 'decline');
    try {
      const rawEta = Number(etaValue);
      const clampedEta = rawEta ? Math.min(180, Math.max(1, rawEta)) : undefined;
      await onDecision(booking.id, decision, clampedEta);
    } catch (error) {
      console.error("Failed to process booking decision", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleUpdateEta = async () => {
    if (!onUpdateEta || !etaValue) return;
    const clampedEta = Math.min(180, Math.max(1, Number(etaValue)));
    setIsLoading('update_eta');
    try {
      await onUpdateEta(booking.id, clampedEta);
    } catch (error) {
      console.error("Failed to update ETA", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleStatusUpdate = async (status: BookingStatus) => {
    if (!onUpdateStatus) return;

    if (status === 'en_route') {
      const confirmed = window.confirm(
        `Are you sure you want to mark yourself as en route to ${booking.event_type} for ${booking.client_name}?`
      );
      if (!confirmed) return;
    } else if (status === 'in_progress') {
      const confirmed = window.confirm(
        `Start the performance for ${booking.event_type}? Confirm you have arrived and are ready to begin.`
      );
      if (!confirmed) return;
    } else if (status === 'completed') {
      const confirmed = window.confirm(
        `Mark this booking as completed? This cannot be undone.`
      );
      if (!confirmed) return;
    }

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
  const showEtaInput = isPending || booking.status === 'confirmed' || booking.status === 'en_route';

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
           {booking.event_address && (
             <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-orange-400" /> {booking.event_address}</span>
           )}
           {booking.performer_eta_minutes && (
             <span className="flex items-center gap-2 text-orange-400 font-medium"><Timer className="h-4 w-4" /> ETA: {booking.performer_eta_minutes} mins</span>
           )}
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
                  <button onClick={() => { if (etaValue) onUpdateEta?.(booking.id, Number(etaValue)); handleStatusUpdate('en_route'); }} disabled={!!isLoading} className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded-md flex items-center gap-1.5 transition-colors">
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

         {showEtaInput && (
            <div className="mt-4 pt-4 border-t border-zinc-700/50 flex flex-col sm:flex-row items-center gap-3">
                <p className="text-xs font-semibold text-zinc-300 mr-2 flex-shrink-0">
                    {booking.status === 'pending_performer_acceptance' ? 'Action Required:' : booking.status === 'confirmed' ? 'Set ETA before heading out:' : 'Update ETA:'}
                </p>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                   <div className="relative flex-grow group">
                      <Timer className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none group-focus-within:text-orange-400 transition-colors" />
                      <input
                        type="number"
                        placeholder="ETA (mins)"
                        title="Estimated time of arrival in minutes (1-180)"
                        value={etaValue}
                        onChange={(e) => onEtaChange(booking.id, e.target.value)}
                        min={1}
                        max={180}
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


const PerformerDashboard: React.FC<PerformerDashboardProps> = ({ performer, bookings, communications, auditLogs, onToggleStatus, onViewDoNotServe, onBookingDecision, onUpdateEta, onUpdateBookingStatus, onUpdatePerformer }) => {
  const [etas, setEtas] = useState<Record<string, string>>({});
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<PerformerStatus | null>(null);

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editServiceAreas, setEditServiceAreas] = useState<ServiceArea[]>(performer.service_areas);
  const [editBio, setEditBio] = useState(performer.bio);
  const [editTagline, setEditTagline] = useState(performer.tagline);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Chat State
  const [activeChatBooking, setActiveChatBooking] = useState<Booking | null>(null);
  const [chatMessages, setChatMessages] = useState<Communication[]>([]);

  const systemCommunications = communications.filter(c => c.type !== 'direct_message');

  const handleEtaChange = (bookingId: string, value: string) => {
    // Clamp ETA to valid range (1-180 minutes)
    if (value === '') {
      setEtas(prev => ({ ...prev, [bookingId]: value }));
      return;
    }
    const numValue = Number(value);
    const clampedValue = Math.min(180, Math.max(1, numValue));
    setEtas(prev => ({ ...prev, [bookingId]: String(clampedValue) }));
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

  const activeStatuses: BookingStatus[] = ['en_route', 'arrived', 'in_progress'];
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
  const activeBookings = bookings.filter(b => activeStatuses.includes(b.status));
  const pendingBookings = bookings.filter(b =>
    b.status !== 'confirmed' &&
    b.status !== 'rejected' &&
    !activeStatuses.includes(b.status) &&
    !['completed', 'cancelled'].includes(b.status)
  );

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
                {/* Active Bookings — en_route, arrived, in_progress */}
                <div>
                  <h3 className="text-lg font-semibold text-indigo-400 mb-4 border-b border-zinc-800 pb-2 flex justify-between items-center">
                    <span className="flex items-center gap-2"><Radio size={16} /> Active Now</span>
                    <span className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded text-xs">{activeBookings.length}</span>
                  </h3>
                  {activeBookings.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {activeBookings.map(booking => (
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
                      <div className="bg-indigo-950/20 border border-dashed border-indigo-900/50 rounded-lg py-6 text-center">
                        <p className="text-indigo-600 text-sm">No bookings currently in progress.</p>
                      </div>
                  )}
                </div>

                {/* Confirmed Bookings */}
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
                        <p className="text-zinc-500 text-sm">You have no confirmed upcoming bookings.</p>
                      </div>
                  )}
                </div>

                {/* Pending Actions */}
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
                          {typeof log.createdAt === 'string' ? new Date(log.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : log.createdAt && 'seconds' in log.createdAt ? new Date(log.createdAt.seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-snug">
                        {log.action === 'PERFORMER_STATUS_CHANGE' ? (
                          <>Changed status from <span className="text-zinc-500 font-semibold">{String(log.details.oldStatus ?? '')}</span> to <span className="text-white font-bold">{String(log.details.newStatus ?? '')}</span></>
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
      
      {/* My Profile Section */}
      <div className="card-base !p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
            <User className="h-6 w-6 text-orange-400" />
            My Profile
          </h2>
          {!isEditingProfile ? (
            <button
              onClick={() => {
                setEditServiceAreas([...performer.service_areas]);
                setEditBio(performer.bio);
                setEditTagline(performer.tagline);
                setIsEditingProfile(true);
              }}
              className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-600 font-semibold py-2 px-4 rounded-xl flex items-center gap-2 transition-colors"
            >
              <Edit3 size={14} />
              Edit Profile
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditingProfile(false)}
                className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-600 font-semibold py-2 px-4 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!onUpdatePerformer) return;
                  setIsSavingProfile(true);
                  try {
                    await onUpdatePerformer(performer.id, {
                      service_areas: editServiceAreas,
                      bio: editBio,
                      tagline: editTagline,
                    });
                    setIsEditingProfile(false);
                  } catch (err) {
                    console.error('Failed to save profile:', err);
                  } finally {
                    setIsSavingProfile(false);
                  }
                }}
                disabled={isSavingProfile || editServiceAreas.length === 0}
                className="text-sm bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {isSavingProfile ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
                Save Changes
              </button>
            </div>
          )}
        </div>

        {isEditingProfile ? (
          <div className="space-y-6 animate-fade-in">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-zinc-400">Tagline</label>
                <span className={`text-xs tabular-nums ${editTagline.length >= 80 ? 'text-red-400' : editTagline.length >= 60 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                  {editTagline.length}/80 characters
                </span>
              </div>
              <input
                type="text"
                value={editTagline}
                onChange={(e) => setEditTagline(e.target.value)}
                className="input-base"
                placeholder="Your professional tagline"
                maxLength={80}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-zinc-400">Bio</label>
                <span className={`text-xs tabular-nums ${editBio.length >= 500 ? 'text-red-400' : editBio.length >= 400 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                  {editBio.length}/500 characters
                </span>
              </div>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="input-base h-28 resize-none"
                placeholder="Tell clients about yourself..."
                maxLength={500}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-3">Service Areas</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {ALL_SERVICE_AREAS.map(area => {
                  const isSelected = editServiceAreas.includes(area);
                  return (
                    <button
                      key={area}
                      type="button"
                      onClick={() => {
                        setEditServiceAreas(prev =>
                          isSelected
                            ? prev.filter(a => a !== area)
                            : [...prev, area]
                        );
                      }}
                      className={`p-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-2 justify-center ${
                        isSelected
                          ? 'bg-orange-500/10 border-orange-500 text-orange-400'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                      }`}
                    >
                      <MapPin size={14} />
                      {area}
                      {isSelected && <CheckCircle size={14} />}
                    </button>
                  );
                })}
              </div>
              {editServiceAreas.length === 0 && (
                <p className="text-xs text-red-400 mt-2">Select at least one service area.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1">Tagline</p>
              <p className="text-zinc-200">{performer.tagline}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1">Bio</p>
              <p className="text-zinc-300 text-sm leading-relaxed line-clamp-3">{performer.bio}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">Service Areas</p>
              <div className="flex flex-wrap gap-2">
                {performer.service_areas.map(area => (
                  <span key={area} className="inline-flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/30 text-orange-300 px-3 py-1.5 rounded-lg text-sm font-medium">
                    <MapPin size={12} />
                    {area}
                  </span>
                ))}
                {performer.service_areas.length === 0 && (
                  <p className="text-zinc-500 text-sm italic">No service areas set. Click "Edit Profile" to add areas.</p>
                )}
              </div>
            </div>
          </div>
        )}
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