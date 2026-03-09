import React, { useState } from 'react';
import { Performer, PerformerStatus, Booking, Communication, AuditLog, BookingStatus } from '../types';
import { Calendar, User, Clock, ShieldAlert, MessageSquare, Inbox, Check, X, Users, Timer, LoaderCircle, MessageCircle, Radio, EyeOff, CheckCircle, Smartphone, History, MapPin, Sparkles, Settings, Edit, Save, Star, CalendarDays } from 'lucide-react';
import ChatDialog from './ChatDialog';
import AvailabilityCalendar from './AvailabilityCalendar';
import { api } from '../services/api';
import { SERVICE_AREAS } from '../constants';

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
  onUpdateProfile: (updates: Partial<Performer>) => Promise<void>;
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
  CONFIRMED: 'text-green-400',
  pending_deposit_confirmation: 'text-blue-400',
  deposit_pending: 'text-orange-400',
  DEPOSIT_PAID: 'text-purple-400',
  pending_vetting: 'text-yellow-400',
  pending_performer_acceptance: 'text-purple-400',
  en_route: 'text-blue-400',
  arrived: 'text-emerald-400',
  in_progress: 'text-indigo-400',
  completed: 'text-zinc-400',
  cancelled: 'text-zinc-500',
  rejected: 'text-red-400',
  DENIED: 'text-red-400',
  PENDING: 'text-yellow-400',
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
          <div className="flex items-center gap-2 text-zinc-300"><Calendar className="h-4 w-4 text-orange-400" /> {new Date(booking.event_date).toLocaleDateString()}</div>
          <div className="flex items-center gap-2 text-zinc-300 mt-1">
            <Clock className="h-4 w-4 text-orange-400" /> {booking.event_time}
            <span className="mx-1 text-zinc-600">|</span>
            <span className="text-zinc-400">{booking.duration_hours} hr{booking.duration_hours !== 1 ? 's' : ''}</span>
          </div>
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
              {isLoading === 'update_status' ? <LoaderCircle size={14} className="animate-spin" /> : <><Radio size={14} /> On My Way</>}
            </button>
          )}
          {booking.status === 'en_route' && (
            <button onClick={() => handleStatusUpdate('arrived')} disabled={!!isLoading} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-md flex items-center gap-1.5 transition-colors">
              {isLoading === 'update_status' ? <LoaderCircle size={14} className="animate-spin" /> : <><MapPin size={14} /> I've Arrived</>}
            </button>
          )}
          {booking.status === 'arrived' && (
            <button onClick={() => handleStatusUpdate('in_progress')} disabled={!!isLoading} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-3 rounded-md flex items-center gap-1.5 transition-colors">
              {isLoading === 'update_status' ? <LoaderCircle size={14} className="animate-spin" /> : <><Sparkles size={14} /> Start Performance</>}
            </button>
          )}
          {booking.status === 'in_progress' && (
            <button onClick={() => handleStatusUpdate('completed')} disabled={!!isLoading} className="text-xs bg-zinc-600 hover:bg-zinc-700 text-white font-bold py-1.5 px-3 rounded-md flex items-center gap-1.5 transition-colors">
              {isLoading === 'update_status' ? <LoaderCircle size={14} className="animate-spin" /> : <><CheckCircle size={14} /> Complete Job</>}
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
                  {isLoading === 'accept' ? <LoaderCircle size={14} className="animate-spin" /> : <><Check size={14} /> Accept</>}
                </button>
                <button onClick={() => handleDecision('declined')} disabled={!!isLoading} className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5 transition-colors shadow-md flex-shrink-0 w-24">
                  {isLoading === 'decline' ? <LoaderCircle size={14} className="animate-spin" /> : <><X size={14} /> Decline</>}
                </button>
              </>
            ) : (
              <button onClick={handleUpdateEta} disabled={!!isLoading || !etaValue} className="text-xs bg-orange-600 hover:bg-orange-700 text-white font-bold py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5 transition-colors shadow-md flex-shrink-0 w-24 disabled:opacity-50 disabled:cursor-not-allowed">
                {isLoading === 'update_eta' ? <LoaderCircle size={14} className="animate-spin" /> : <><Timer size={14} /> Update</>}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


const PerformerDashboard: React.FC<PerformerDashboardProps> = ({ performer, bookings, communications, auditLogs, onToggleStatus, onViewDoNotServe, onBookingDecision, onUpdateEta, onUpdateBookingStatus, onUpdateProfile }) => {
  const [etas, setEtas] = useState<Record<string, string>>({});
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<PerformerStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'profile' | 'availability'>('overview');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    tagline: performer.tagline,
    bio: performer.bio,
    service_areas: performer.service_areas
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

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
        setChatMessages((prev: Communication[]) => [...prev, data]);
      }
    } catch (err) {
      console.error("Failed to send message", err);
    }
  };

  const handleUpdateProfile = async () => {
    setIsSavingProfile(true);
    try {
      await onUpdateProfile(profileForm);
      setIsEditingProfile(false);
    } catch (err) {
      console.error("Failed to update profile:", err);
    } finally {
      setIsSavingProfile(null as any); // Reset
      setIsSavingProfile(false);
    }
  };

  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
  const pendingBookings = bookings.filter(b => b.status !== 'confirmed' && b.status !== 'rejected');

  return (
    <div id="tour-performer-dashboard" className="animate-fade-in space-y-8 pb-20">
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

      <div className="border-b border-zinc-800">
        <nav className="-mb-px flex flex-wrap gap-x-4 gap-y-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === 'overview' ? 'border-orange-500 text-orange-400' : 'border-transparent text-zinc-400 hover:text-white hover:border-zinc-500'
              }`}
          >
            <Smartphone size={16} /> Dashboard Overview
          </button>
          <button
            onClick={() => setActiveTab('availability')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === 'availability' ? 'border-orange-500 text-orange-400' : 'border-transparent text-zinc-400 hover:text-white hover:border-zinc-500'
              }`}
          >
            <CalendarDays size={16} /> Availability
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === 'profile' ? 'border-orange-500 text-orange-400' : 'border-transparent text-zinc-400 hover:text-white hover:border-zinc-500'
              }`}
          >
            <User size={16} /> Profile Settings
          </button>
        </nav>
      </div>

      {activeTab === 'availability' ? (
        <div className="animate-fade-in">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">Manage Availability</h2>
            <p className="text-zinc-400 mt-1">Block out dates you're unavailable. Clients won't be able to request these dates.</p>
          </div>
          <AvailabilityCalendar
            performerId={performer.id}
            bookings={bookings}
          />
        </div>
      ) : activeTab === 'overview' ? (
        <>
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
                        className={`flex-1 flex flex-col items-center justify-center py-3 px-2 rounded-lg transition-all duration-300 gap-1.5 border ${isActive
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
                            onEtaChange={() => { }}
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
                            {(log.createdAt as { toDate?: () => Date } | null)?.toDate
                              ? (log.createdAt as { toDate: () => Date }).toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                              : 'Just now'}
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
        </>
      ) : (
        <div className="space-y-8 animate-fade-in">
          <div className="card-base !p-8">
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-zinc-800">
              <div>
                <h2 className="text-2xl font-bold text-white">Profile Settings</h2>
                <p className="text-zinc-400">Manage how you appear to clients in the gallery.</p>
              </div>
              {!isEditingProfile ? (
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="btn-primary flex items-center gap-2 !py-2 !px-4"
                >
                  <Edit size={18} /> Edit Profile
                </button>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsEditingProfile(false);
                      setProfileForm({
                        tagline: performer.tagline,
                        bio: performer.bio,
                        service_areas: performer.service_areas
                      });
                    }}
                    className="btn-secondary !py-2 !px-4"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateProfile}
                    disabled={isSavingProfile}
                    className="btn-primary flex items-center gap-2 !py-2 !px-6"
                  >
                    {isSavingProfile ? <LoaderCircle size={18} className="animate-spin" /> : <Save size={18} />}
                    Save Changes
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="lg:col-span-1 space-y-6">
                <div className="relative group">
                  <img
                    src={performer.photo_url}
                    alt={performer.name}
                    className="w-full aspect-[3/4] object-cover rounded-2xl border border-zinc-800 shadow-2xl"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                    <p className="text-white text-sm font-semibold">Photo managed by Admin</p>
                  </div>
                </div>
                <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500 uppercase font-bold tracking-widest">Rating</span>
                    <div className="flex items-center gap-1 text-orange-400">
                      <Star className="w-4 h-4 fill-orange-400" />
                      <span className="font-bold">{performer.rating.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500 uppercase font-bold tracking-widest">Reviews</span>
                    <span className="text-white font-bold">{performer.review_count}</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 space-y-8">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Tagline</label>
                  {isEditingProfile ? (
                    <input
                      type="text"
                      value={profileForm.tagline}
                      onChange={e => setProfileForm({ ...profileForm, tagline: e.target.value })}
                      className="input-base w-full !text-lg !font-semibold"
                      placeholder="Your catchy tagline..."
                    />
                  ) : (
                    <p className="text-2xl font-bold text-white italic">"{performer.tagline}"</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Bio</label>
                  {isEditingProfile ? (
                    <textarea
                      value={profileForm.bio}
                      onChange={e => setProfileForm({ ...profileForm, bio: e.target.value })}
                      className="input-base w-full h-40 resize-none"
                      placeholder="Tell clients about yourself..."
                    />
                  ) : (
                    <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{performer.bio}</p>
                  )}
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Service Areas</label>
                  {isEditingProfile ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {SERVICE_AREAS.map(area => (
                        <label key={area} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${profileForm.service_areas.includes(area as any)
                            ? 'bg-orange-500/10 border-orange-500/50 text-orange-400'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                          }`}>
                          <input
                            type="checkbox"
                            checked={profileForm.service_areas.includes(area as any)}
                            onChange={e => {
                              const current = profileForm.service_areas;
                              if (e.target.checked) {
                                setProfileForm({ ...profileForm, service_areas: [...current, area as any] });
                              } else {
                                setProfileForm({ ...profileForm, service_areas: current.filter(a => a !== area) });
                              }
                            }}
                            className="w-5 h-5 rounded border-zinc-700 text-orange-500 focus:ring-orange-500/20 bg-zinc-800"
                          />
                          <span className="font-semibold">{area}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {performer.service_areas.map(area => (
                        <span key={area} className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-full text-sm font-semibold border border-zinc-700">
                          {area}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Services Offered</label>
                  <div className="flex flex-wrap gap-2">
                    {performer.service_ids.map(id => (
                      <span key={id} className="px-4 py-2 bg-orange-500/10 text-orange-400 rounded-full text-sm font-semibold border border-orange-500/20">
                        {id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 italic">Services can only be modified by an administrator.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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