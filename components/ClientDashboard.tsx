import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Booking, Communication } from '../types';
import { Calendar, Clock, User, MessageCircle, MapPin, Wallet, Search, LogOut, Briefcase, LoaderCircle, AlertTriangle, CheckCircle, Archive, History, Info, Settings, Timer, Radio, X } from 'lucide-react';
import ChatDialog from './ChatDialog';
import { api } from '../services/api';
import { calculateBookingCost } from '../utils/bookingUtils';
import InputField from './InputField';

interface ClientDashboardProps {
  bookings: Booking[];
  onBrowsePerformers: () => void;
  onShowSettings: () => void;
}

const statusConfig: Record<Booking['status'], {
  color: string;
  borderColor: string;
  Icon: React.ElementType;
  title: string;
  description: string;
}> = {
  pending_performer_acceptance: { color: 'text-purple-400', borderColor: 'border-purple-500', Icon: LoaderCircle, title: "Awaiting Performer", description: "We're waiting for the performer to accept your request." },
  pending_vetting: { color: 'text-yellow-400', borderColor: 'border-yellow-500', Icon: LoaderCircle, title: "Pending Admin Review", description: "The performer accepted! Our admin team is now reviewing your application." },
  deposit_pending: { color: 'text-[#e6398a]', borderColor: 'border-[#e6398a]', Icon: Wallet, title: "Action Required: Pay Deposit", description: "Your booking is approved! Please pay the deposit to confirm your spot." },
  pending_deposit_confirmation: { color: 'text-blue-400', borderColor: 'border-blue-500', Icon: LoaderCircle, title: "Confirming Deposit", description: "We've received your payment confirmation and our team is verifying it." },
  confirmed: { color: 'text-green-400', borderColor: 'border-green-500', Icon: CheckCircle, title: "Booking Confirmed!", description: "You're all set! The performer is booked for your event." },
  en_route: { color: 'text-blue-400', borderColor: 'border-blue-500', Icon: Timer, title: "Performer En Route", description: "The performer is on their way to your location!" },
  arrived: { color: 'text-emerald-400', borderColor: 'border-emerald-500', Icon: MapPin, title: "Performer Arrived", description: "The performer has arrived at the venue." },
  in_progress: { color: 'text-indigo-400', borderColor: 'border-indigo-500', Icon: Radio, title: "In Progress", description: "The performance is currently taking place." },
  completed: { color: 'text-[#b8b8c2]', borderColor: 'border-[#8888a0]', Icon: Archive, title: "Completed", description: "This booking has been successfully completed." },
  cancelled: { color: 'text-[#8888a0]', borderColor: 'border-[#2a2a35]', Icon: X, title: "Cancelled", description: "This booking has been cancelled." },
  rejected: { color: 'text-red-400', borderColor: 'border-red-500', Icon: AlertTriangle, title: "Booking Rejected", description: "Unfortunately, this booking could not be completed at this time." },
};

const ClientDashboard: React.FC<ClientDashboardProps> = ({ bookings, onBrowsePerformers, onShowSettings }) => {
  const [clientEmail, setClientEmail] = useState<string | null>(() => sessionStorage.getItem('clientEmail'));
  const [emailInput, setEmailInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [activeChatBooking, setActiveChatBooking] = useState<Booking | null>(null);
  const [chatMessages, setChatMessages] = useState<Communication[]>([]);
  const [chatError, setChatError] = useState('');
  const lookupTimeoutRef = useRef<number | null>(null);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!emailInput) {
      setError('Please enter an email address.');
      return;
    }
    setIsLoading(true);

    if (lookupTimeoutRef.current) {
        clearTimeout(lookupTimeoutRef.current);
    }

    lookupTimeoutRef.current = window.setTimeout(() => {
      const foundBookings = bookings.some(b => b.client_email.toLowerCase() === emailInput.toLowerCase());
      if (foundBookings) {
        sessionStorage.setItem('clientEmail', emailInput);
        setClientEmail(emailInput);
      } else {
        setError('No bookings found for this email address.');
      }
      setIsLoading(false);
    }, 500);
  };

  useEffect(() => {
    // Cleanup timeout on component unmount
    return () => {
        if (lookupTimeoutRef.current) {
            clearTimeout(lookupTimeoutRef.current);
        }
    }
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem('clientEmail');
    setClientEmail(null);
    setEmailInput('');
  };

  const handleOpenChat = async (booking: Booking) => {
      setActiveChatBooking(booking);
      setChatError('');
      try {
          const { data } = await api.getBookingMessages(booking.id);
          setChatMessages(data || []);
      } catch (err) {
          console.error("Failed to load chat messages", err);
          setChatError('Failed to load messages. Please try again.');
      }
  };

  const handleSendMessage = async (messageText: string) => {
      if (!activeChatBooking) return;
      setChatError('');

      try {
          const { data, error } = await api.sendBookingMessage(
              activeChatBooking.id,
              messageText,
              activeChatBooking.client_name, // Sender
              activeChatBooking.performer?.name || 'Performer' // Recipient
          );

          if (error) throw error;
          if (data) {
              setChatMessages(prev => [...prev, data]);
          }
      } catch (err) {
          console.error("Failed to send message", err);
          setChatError('Failed to send message. Please try again.');
      }
  };

  const bookingGroups = useMemo(() => {
      if (!clientEmail) return null;
      
      const clientBookings = bookings.filter(b => b.client_email.toLowerCase() === clientEmail.toLowerCase());
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const groups = clientBookings.reduce((groups, booking) => {
        const [y, m, d] = booking.event_date.split('-').map(Number);
        const eventDate = new Date(y, m - 1, d);
        
        if (['pending_performer_acceptance', 'pending_vetting', 'deposit_pending', 'pending_deposit_confirmation'].includes(booking.status)) {
            groups.actionRequired.push(booking);
        } else if (booking.status === 'confirmed' && eventDate >= today) {
            groups.upcoming.push(booking);
        } else {
            groups.past.push(booking);
        }
        return groups;

      }, { actionRequired: [] as Booking[], upcoming: [] as Booking[], past: [] as Booking[] });

      // Sort past bookings by date descending
      groups.past.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());
      
      return groups;
  }, [clientEmail, bookings]);
    
  if (!clientEmail) {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="card-base !p-8 max-w-md w-full">
            <h1 className="text-3xl font-bold text-white">My Bookings</h1>
            <p className="text-[#b8b8c2] mt-2 mb-6">Enter your email to view your booking history and status.</p>
            <form onSubmit={handleLookup} className="space-y-4">
                <InputField icon={<User />} type="email" name="email" placeholder="Your booking email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} required error={error} />
                <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
                    {isLoading ? <LoaderCircle className="h-5 w-5 animate-spin"/> : <Search className="h-5 w-5"/>}
                    Find My Bookings
                </button>
            </form>
            <div className="my-6 flex items-center text-[#8888a0] text-sm">
                <span className="flex-grow border-t border-[#2a2a35]"></span>
                <span className="flex-shrink mx-4">OR</span>
                <span className="flex-grow border-t border-[#2a2a35]"></span>
            </div>
             <button onClick={onBrowsePerformers} className="w-full bg-[#1a1a22] hover:bg-[#2a2a35] text-white font-semibold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                <Briefcase className="h-5 w-5" />
                Browse Performers & Services
            </button>
        </div>
      </div>
    );
  }

  const BookingGroup: React.FC<{title: string; bookings: Booking[]; icon: React.ElementType;}> = ({title, bookings, icon: Icon}) => {
    if (bookings.length === 0) return null;
    return (
        <div>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3"><Icon className="text-[#e6398a]" /> {title}</h2>
            <div className="grid gap-6">
                {bookings.map(booking => {
                    const { totalCost } = calculateBookingCost(booking.duration_hours, booking.services_requested || [], 1);
                    const config = statusConfig[booking.status];
                    return (
                      <div key={booking.id} className={`card-base !p-0 overflow-hidden flex flex-col md:flex-row border-l-4 ${config.borderColor}`}>
                         <div className="p-6 flex-grow">
                             <h3 className="text-2xl font-bold text-white">{booking.event_type}</h3>
                             <p className="text-sm text-[#b8b8c2] mb-4">with <strong className="text-[#e6398a]">{booking.performer?.name}</strong></p>

                              <div className={`p-3 rounded-lg flex items-start gap-3 mb-4 bg-[#13131a]/50`}>
                                <config.Icon className={`h-6 w-6 mt-1 flex-shrink-0 ${config.color} ${config.Icon === LoaderCircle ? 'animate-spin' : ''}`} />
                                <div>
                                    <p className={`font-semibold ${config.color}`}>{config.title}</p>
                                    <p className="text-sm text-[#b8b8c2]">{config.description}</p>
                                </div>
                              </div>

                             <div className="text-[#b8b8c2] grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm mt-2 border-t border-[#2a2a35] pt-4">
                                <div className="flex items-center gap-2"><Calendar size={16} className="text-[#e6398a]/80"/> {new Date(booking.event_date).toLocaleDateString()} at {booking.event_time}</div>
                                <div className="flex items-center gap-2"><Clock size={16} className="text-[#e6398a]/80"/> {booking.duration_hours} hour{booking.duration_hours > 1 ? 's' : ''}</div>
                                {booking.performer_eta_minutes && booking.performer_eta_minutes > 0 && (
                                  <div className="flex items-center gap-2 text-[#e6398a] font-semibold animate-pulse">
                                    <Timer size={16} className="text-[#e6398a]"/> ETA: ~{booking.performer_eta_minutes} mins
                                  </div>
                                )}
                                <div className="flex items-center gap-2 col-span-full"><MapPin size={16} className="text-[#e6398a]/80"/> {booking.event_address}</div>
                             </div>
                         </div>
                         <div className="bg-[#13131a]/50 p-6 flex flex-col justify-between items-center md:items-end md:border-l border-[#2a2a35] md:min-w-[220px]">
                            <div className="text-center md:text-right mb-4 w-full">
                               <p className="text-[#b8b8c2] text-sm flex items-center md:justify-end gap-1"><Wallet size={14}/> Total Cost</p>
                               <p className="text-3xl font-bold text-white">${(totalCost || 0).toFixed(2)}</p> 
                            </div>
                            {booking.status !== 'rejected' && (
                                <button onClick={() => handleOpenChat(booking)} className="btn-primary w-full flex items-center justify-center gap-2 text-sm px-4 py-2 mt-auto">
                                    <MessageCircle size={16} /> Message Performer
                                </button>
                            )}
                         </div>
                      </div>
                    );
                })}
            </div>
        </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-12">
       <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white">My Bookings</h1>
          <p className="text-sm sm:text-base text-[#b8b8c2]">Viewing bookings for: <strong className="text-white">{clientEmail}</strong></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <button onClick={onShowSettings} className="flex-1 sm:flex-none bg-[#1a1a22] hover:bg-[#2a2a35] text-white flex items-center justify-center gap-2 text-xs sm:text-sm px-4 py-2 rounded-lg transition-colors">
                <Settings className="h-4 w-4" />
                Settings
            </button>
            <button onClick={handleLogout} className="flex-1 sm:flex-none bg-[#1a1a22] hover:bg-[#2a2a35] text-white flex items-center justify-center gap-2 text-xs sm:text-sm px-4 py-2 rounded-lg transition-colors whitespace-nowrap">
                <LogOut className="h-4 w-4" />
                Change email
            </button>
        </div>
      </div>
      
      {bookingGroups && (bookingGroups.actionRequired.length > 0 || bookingGroups.upcoming.length > 0 || bookingGroups.past.length > 0) ? (
        <div className="space-y-12">
            <BookingGroup title="Action Required" bookings={bookingGroups.actionRequired} icon={AlertTriangle} />
            <BookingGroup title="Upcoming Confirmed" bookings={bookingGroups.upcoming} icon={CheckCircle} />
            
            {bookingGroups.past.length > 0 && (
              <div className="animate-fade-in">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                  <History className="text-[#b8b8c2]" /> Booking History
                </h2>
                <div className="card-base !p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#13131a]/80 border-b border-[#2a2a35]">
                          <th className="px-6 py-4 text-sm font-semibold text-[#b8b8c2]">Date</th>
                          <th className="px-6 py-4 text-sm font-semibold text-[#b8b8c2]">Event Type</th>
                          <th className="px-6 py-4 text-sm font-semibold text-[#b8b8c2]">Performer</th>
                          <th className="px-6 py-4 text-sm font-semibold text-[#b8b8c2]">Status</th>
                          <th className="px-6 py-4 text-sm font-semibold text-[#b8b8c2] text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2a2a35]/50">
                        {bookingGroups.past.map(booking => {
                          const { totalCost } = calculateBookingCost(booking.duration_hours, booking.services_requested || [], 1);
                          const config = statusConfig[booking.status];
                          return (
                            <tr key={booking.id} className="hover:bg-[#1a1a22]/30 transition-colors">
                              <td className="px-6 py-4 text-sm text-[#b8b8c2] whitespace-nowrap">
                                {new Date(booking.event_date).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-4 text-sm font-medium text-white">
                                {booking.event_type}
                              </td>
                              <td className="px-6 py-4 text-sm text-[#b8b8c2]">
                                {booking.performer?.name || 'N/A'}
                              </td>
                              <td className="px-6 py-4 text-sm">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.borderColor} ${config.color} bg-[#13131a]/50`}>
                                  <config.Icon size={12} className={config.Icon === LoaderCircle ? 'animate-spin' : ''} />
                                  {config.title}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-sm font-bold text-white text-right">
                                ${(totalCost || 0).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
        </div>
      ) : (
        <div className="text-center py-20 bg-[#13131a]/50 rounded-xl border border-[#2a2a35]">
            <h2 className="text-2xl font-semibold text-white">No Bookings Found</h2>
            <p className="text-[#8888a0] my-4 max-w-md mx-auto">It looks like there are no bookings associated with this email address yet. Ready to find the perfect entertainment?</p>
             <button onClick={onBrowsePerformers} className="btn-primary flex items-center justify-center gap-2 mx-auto mt-6">
                <Briefcase className="h-5 w-5" />
                Book a Performer
            </button>
        </div>
      )}

      {activeChatBooking && (
          <>
          {chatError && (
            <div className="fixed top-4 right-4 z-[60] bg-red-900/90 text-red-200 px-4 py-3 rounded-lg text-sm flex items-center gap-2 shadow-lg" role="alert">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {chatError}
              <button onClick={() => setChatError('')} className="ml-2 text-red-300 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
          )}
          <ChatDialog
              isOpen={!!activeChatBooking}
              onClose={() => { setActiveChatBooking(null); setChatError(''); }}
              booking={activeChatBooking}
              currentUser={{ name: activeChatBooking.client_name } as any}
              messages={chatMessages}
              onSendMessage={handleSendMessage}
          />
          </>
      )}
    </div>
  );
};

export default ClientDashboard;