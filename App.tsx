import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { Briefcase, ChevronDown, Radio, LoaderCircle, CalendarCheck, Clock, Users, X, MapPin, BookOpen, LogIn, LogOut, Sparkles, Database } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import Header from './components/Header';
import Footer from './components/Footer';
import PerformerCard from './components/EntertainerCard';
import AgeGate from './components/AgeGate';
import Login from './components/Login';
import RoleSwitcher from './components/RoleSwitcher';

// Lazy-loaded components (large bundles loaded on demand)
const PerformerProfile = React.lazy(() => import('./components/EntertainerProfile'));
const BookingProcess = React.lazy(() => import('./components/BookingProcess'));
import type { BookingFormState } from './components/BookingProcess';
const PerformerDashboard = React.lazy(() => import('./components/PerformerDashboard'));
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'));
const ClientDashboard = React.lazy(() => import('./components/ClientDashboard'));
const DoNotServe = React.lazy(() => import('./components/DoNotServe'));
const PrivacyPolicy = React.lazy(() => import('./components/PrivacyPolicy'));
const TermsOfService = React.lazy(() => import('./components/TermsOfService'));
const ServicesGallery = React.lazy(() => import('./components/ServicesGallery'));
const DemoPhone = React.lazy(() => import('./components/DemoPhone'));
const UserSettings = React.lazy(() => import('./components/UserSettings'));
const PresentationVideo = React.lazy(() => import('./components/PresentationVideo'));
const FAQ = React.lazy(() => import('./components/FAQ'));
const PerformerOnboarding = React.lazy(() => import('./components/PerformerOnboarding'));
const WalkthroughOverlay = React.lazy(() => import('./components/WalkthroughOverlay'));
import { api, resetDemoData, isDemoMode } from './services/api';
import type { Performer, Booking, Role, PerformerStatus, BookingStatus, DoNotServeEntry, DoNotServeStatus, Communication, PhoneMessage, ServiceArea, AuditLog } from './types';
import { allServices } from './data/mockData';
import { calculateBookingCost } from './utils/bookingUtils';


type GalleryView = 'available_now' | 'future_bookings' | 'services';
type AuthedUser = { name: string; role: Role; id?: number; } | null;



const App: React.FC = () => {
  const [ageVerified, setAgeVerified] = useState(() => {
    return localStorage.getItem('ageVerified') === 'true';
  });
  const [view, setView] = useState<GalleryView | 'profile' | 'booking' | 'performer_dashboard' | 'admin_dashboard' | 'do_not_serve' | 'client_dashboard' | 'settings' | 'faq' | 'performer_onboarding'>('available_now');
  const [bookingOrigin, setBookingOrigin] = useState<GalleryView>('available_now');
  const [viewedPerformer, setViewedPerformer] = useState<Performer | null>(null);
  const [selectedForBooking, setSelectedForBooking] = useState<Performer[]>([]);

  const [authedUser, setAuthedUser] = useState<AuthedUser>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const [settings, setSettings] = useState({ bookingUpdates: true, confirmations: true });

  const [performers, setPerformers] = useState<Performer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [doNotServeList, setDoNotServeList] = useState<DoNotServeEntry[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phoneMessage, setPhoneMessage] = useState<PhoneMessage>(null);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceIdFilter, setServiceIdFilter] = useState<string | null>(null);
  const [serviceAreaFilter, setServiceAreaFilter] = useState<ServiceArea | ''>('');

  const [categoryFilter, setCategoryFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<PerformerStatus | ''>('');
  const [showDemoBanner, setShowDemoBanner] = useState(isDemoMode);
  const [showWalkthrough, setShowWalkthrough] = useState(() => {
    // Auto-show walkthrough on first visit
    return localStorage.getItem('walkthroughShown') !== 'true';
  });
  const [notifications, setNotifications] = useState<{ id: string; message: string; type: 'info' | 'success' | 'warning' }[]>([]);

  const prevBookingsRef = React.useRef<Booking[]>([]);

  const addNotification = useCallback((message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(allServices.map(s => s.category)));
  }, []);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleReturnToGallery = () => {
    setView(bookingOrigin);
    setViewedPerformer(null);
  };

  const handleTogglePerformerSelection = (performer: Performer) => {
    setSelectedForBooking(prev => {
      const isSelected = prev.some(p => p.id === performer.id);
      if (isSelected) {
        return prev.filter(p => p.id !== performer.id);
      } else {
        return [...prev, performer];
      }
    });
  };

  const serviceAreas: ServiceArea[] = ['Perth North', 'Perth South', 'Southwest', 'Northwest'];
  const role = authedUser?.role || 'user';

  const showPhoneMessage = useCallback((msg: PhoneMessage) => {
    setPhoneMessage(msg);
    setTimeout(() => {
      setPhoneMessage(null);
    }, 7000);
  }, []);

  const handleShowPrivacyPolicy = () => {
    window.scrollTo(0, 0);
    setShowPrivacyPolicy(true);
  };

  const handleShowTermsOfService = () => {
    window.scrollTo(0, 0);
    setShowTermsOfService(true);
  };

  const addCommunication = useCallback(async (commData: Omit<Communication, 'id' | 'created_at' | 'read'>) => {
    const tempId = `temp-${Date.now()}`;
    const newComm: Communication = { ...commData, id: tempId, created_at: new Date().toISOString(), read: false };
    setCommunications(prev => [newComm, ...prev]);

    try {
      const { data, error: apiError } = await api.addCommunication(commData);
      if (apiError) throw apiError;
      setCommunications(prev => prev.map(c => c.id === tempId ? data![0] : c));
    } catch (err) {
      console.error("Failed to add communication:", err);
      setCommunications(prev => prev.filter(c => c.id !== tempId));
    }
  }, []);


  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { performers: pData, bookings: bData, doNotServeList: dData, communications: cData, auditLogs: aData } = await api.getInitialData();

      if (pData.error) throw new Error(`Performers Error: ${pData.error.message}`);
      setPerformers(pData.data as Performer[] || []);

      if (bData.error) throw new Error(`Bookings Error: ${bData.error.message}`);
      setBookings(bData.data as Booking[] || []);

      if (dData.error) throw new Error(`DNS List Error: ${dData.error.message}`);
      setDoNotServeList(dData.data as DoNotServeEntry[] || []);

      if (cData.error) throw new Error(`Communications Error: ${cData.error.message}`);
      setCommunications(cData.data as Communication[] || []);

      if (aData.error) throw new Error(`Audit Logs Error: ${aData.error.message}`);
      setAuditLogs(aData.data as AuditLog[] || []);

    } catch (err: any) {
      setError(`Backend initialization error: ${err.message}.`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribeBookings = api.subscribeToBookings((newBookings) => {
      // Check for status changes to notify
      if (prevBookingsRef.current.length > 0) {
        newBookings.forEach(newB => {
          const oldB = prevBookingsRef.current.find(b => b.id === newB.id);
          if (oldB && oldB.status !== newB.status) {
            // Status changed!
            const statusLabels: Record<BookingStatus, string> = {
              pending_performer_acceptance: 'Pending Acceptance',
              pending_vetting: 'Pending Vetting',
              deposit_pending: 'Deposit Pending',
              pending_deposit_confirmation: 'Confirming Deposit',
              confirmed: 'Confirmed',
              en_route: 'Performer En Route',
              arrived: 'Performer Arrived',
              in_progress: 'In Progress',
              completed: 'Completed',
              cancelled: 'Cancelled',
              rejected: 'Rejected'
            };

            const message = `Booking #${newB.id.slice(0, 8)} status updated to ${statusLabels[newB.status] || newB.status}`;
            addNotification(message, newB.status === 'confirmed' ? 'success' : 'info');

            // Also show phone message for demo feel
            showPhoneMessage({
              for: authedUser?.role === 'performer' ? 'Performer' : authedUser?.role === 'admin' ? 'Admin' : 'Client',
              content: (
                <div className="space-y-1">
                  <p className="font-bold text-zinc-900">Booking Update</p>
                  <p className="text-sm text-zinc-600">{message}</p>
                </div>
              )
            });
          }
        });
      }
      prevBookingsRef.current = newBookings;
      setBookings(newBookings);
    });

    const unsubscribeComms = api.subscribeToCommunications((newComms) => {
      setCommunications(newComms);
    });

    const unsubscribePerformers = api.subscribeToPerformers((newPerformers) => {
      setPerformers(newPerformers);
    });

    const unsubscribeDNS = api.subscribeToDoNotServe((newEntries) => {
      setDoNotServeList(newEntries);
    });

    const unsubscribeAudit = api.subscribeToAuditLogs((newLogs) => {
      setAuditLogs(newLogs);
    });

    return () => {
      unsubscribeBookings();
      unsubscribeComms();
      unsubscribePerformers();
      unsubscribeDNS();
      unsubscribeAudit();
    };
  }, [addNotification, showPhoneMessage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-sync performer availability based on active bookings
  useEffect(() => {
    if (bookings.length === 0 || performers.length === 0) return;

    const activeStatuses: BookingStatus[] = ['en_route', 'arrived', 'in_progress'];
    const today = new Date().toISOString().split('T')[0];

    performers.forEach(performer => {
      // Skip non-active performers (pending verification, rejected)
      if (performer.status === 'pending_verification' || performer.status === 'rejected') return;

      const hasActiveBooking = bookings.some(b =>
        b.performer_id === performer.id && activeStatuses.includes(b.status)
      );

      const hasConfirmedToday = bookings.some(b =>
        b.performer_id === performer.id &&
        b.status === 'confirmed' &&
        b.event_date === today
      );

      const shouldBeBusy = hasActiveBooking || hasConfirmedToday;

      if (shouldBeBusy && performer.status === 'available') {
        api.updatePerformerStatus(performer.id, 'busy');
      } else if (!shouldBeBusy && performer.status === 'busy') {
        api.updatePerformerStatus(performer.id, 'available');
      }
    });
  }, [bookings, performers]);

  const handleAgeVerified = () => {
    localStorage.setItem('ageVerified', 'true');
    setAgeVerified(true);
  };

  const handleLogin = (user: NonNullable<AuthedUser>) => {
    setAuthedUser(user);
    setShowLogin(false);
    if (user.role === 'admin') {
      setView('admin_dashboard');
    } else if (user.role === 'performer') {
      setView('performer_dashboard');
    }
  };

  const handleRoleChange = (role: Role) => {
    if (role === 'user') {
      setAuthedUser(null);
      setView('available_now');
    } else if (role === 'admin') {
      setAuthedUser({ name: 'Admin', role: 'admin' });
      setView('admin_dashboard');
    } else if (role === 'performer') {
      const firstPerformer = performers[0];
      if (firstPerformer) {
        setAuthedUser({ name: firstPerformer.name, role: 'performer', id: firstPerformer.id });
        setView('performer_dashboard');
      } else {
        setAuthedUser(null);
      }
    }
  };

  const handlePerformerChange = (id: number | null) => {
    if (id) {
      const performer = performers.find(p => p.id === id);
      if (performer) {
        setAuthedUser({ name: performer.name, role: 'performer', id: performer.id });
        setView('performer_dashboard');
      }
    }
  };

  const handleLogout = () => {
    setAuthedUser(null);
    sessionStorage.removeItem('clientEmail');
    setView('available_now');
  };

  const handlePerformerStatusChange = async (performerId: number, status: PerformerStatus) => {
    const performer = performers.find(p => p.id === performerId);
    if (!performer) return;

    const originalStatus = performer.status;
    const performerName = performer.name;
    const originalPerformers = performers;

    setPerformers(prev => prev.map(p => p.id === performerId ? { ...p, status } : p));

    try {
      const { error: apiError } = await api.updatePerformerStatus(performerId, status);
      if (apiError) throw apiError;

      // Log status change to audit log
      await api.createAuditLog('PERFORMER_STATUS_CHANGE', String(performerId), {
        performerName,
        oldStatus: originalStatus,
        newStatus: status
      });

      // Re-fetch audit logs to show the new entry immediately
      const { auditLogs: aData } = await api.getInitialData();
      if (!aData.error) setAuditLogs(aData.data as AuditLog[]);

      addCommunication({ sender: 'System', recipient: 'admin', message: `${performerName}'s status changed to ${status}.`, type: 'admin_message' });
    } catch (err) {
      console.error("Failed to update status:", err);
      setPerformers(originalPerformers);
      setError("Could not update performer status.");
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    const originalBookings = bookings;
    const booking = originalBookings.find(b => b.id === bookingId);
    if (!booking) return;

    let updatedBookingData: Partial<Booking> = { status };
    if (status === 'confirmed') {
      updatedBookingData = { ...updatedBookingData, verified_by_admin_name: 'Admin', verified_at: new Date().toISOString() };
    }
    if (status === 'pending_deposit_confirmation') {
      updatedBookingData.deposit_receipt_path = `uploads/receipt-${bookingId.slice(0, 8)}.pdf`;
    }

    const updatedBookings = originalBookings.map(b => b.id === bookingId ? { ...b, ...updatedBookingData } : b);
    setBookings(updatedBookings);

    try {
      const { error: apiError } = await api.updateBookingStatus(bookingId, status, updatedBookingData);
      if (apiError) throw apiError;

      const { totalCost, depositAmount } = calculateBookingCost(booking.duration_hours, booking.services_requested || [], 1);
      const finalBalance = totalCost - depositAmount;

      const clientMessageMap = {
        deposit_pending: `✅ Booking Approved! Your application for ${booking.event_type} with ${booking.performer?.name} is approved. Please pay the deposit to confirm.`,
        pending_deposit_confirmation: `🧾 Deposit Submitted! We've received your confirmation. An admin will verify it shortly.`,
        rejected: `❗️ Booking Rejected. Unfortunately, your application for ${booking.event_type} has been rejected by administration. We suggest checking out other available entertainers.`,
      };

      const clientMessage = clientMessageMap[status as keyof typeof clientMessageMap];
      if (clientMessage) addCommunication({ sender: 'System', recipient: 'user', message: clientMessage, booking_id: bookingId, type: 'booking_update' });

      if (status === 'deposit_pending') showPhoneMessage({ for: 'Client', content: <p>🎉 <strong>Booking Approved!</strong><br />Your application for {booking.event_type} with <strong>{booking.performer?.name}</strong> is approved. Please pay the <strong>${(depositAmount || 0).toFixed(2)}</strong> deposit via the booking page to confirm your event.</p> });

      if (status === 'confirmed') {
        showPhoneMessage({ for: 'Client', content: <p>✅ <strong>Booking Confirmed!</strong><br />Your event with <strong>{booking.performer?.name}</strong> is locked in. See you on {new Date(booking.event_date).toLocaleDateString()}!<br /><br /><span className="text-xs">Final balance of <strong>${(finalBalance || 0).toFixed(2)}</strong> due in cash on arrival.</span></p> });
        addCommunication({ sender: 'System', recipient: 'user', message: `🎉 Booking Confirmed! Your event with ${booking.performer?.name} is locked in. Final balance of $${(finalBalance || 0).toFixed(2)} due in cash on arrival. See you on ${new Date(booking.event_date).toLocaleDateString()}!`, booking_id: bookingId, type: 'booking_confirmation' });

        setTimeout(() => showPhoneMessage({ for: 'Performer', content: <p>💰 <strong>DEPOSIT PAID!</strong><br />Your booking is confirmed:<br />👤 Client: <strong>{booking.client_name}</strong><br />📞 Phone: {booking.client_phone}<br />📍 Address: {booking.event_address}<br />📅 When: {new Date(booking.event_date).toLocaleDateString()}, {booking.event_time}<br />👥 Guests: {booking.number_of_guests}<br />{booking.client_message && <><br />📝 <strong>Note:</strong> "{booking.client_message}"</>}<br /><br />She's coming in hot 🔥 Get ready!</p> }), 6000);
        setTimeout(() => showPhoneMessage({ for: 'Admin', content: <p>✅ <strong>DEPOSIT CONFIRMED</strong><br />Booking locked in:<br />👤 Client: <strong>{booking.client_name}</strong><br />🍑 Performer: <strong>{booking.performer?.name}</strong><br />📅 When: {new Date(booking.event_date).toLocaleDateString()}, {booking.event_time}<br /><br />Booking ID: #{booking.id.slice(0, 8)}...</p> }), 12000);
      }

      const performerMessageMap = {
        deposit_pending: `✅ Booking Vetted! The application from ${booking.client_name} for ${new Date(booking.event_date).toLocaleDateString()} has been approved. Awaiting deposit.`,
        rejected: `❗️ Booking Rejected: The application from ${booking.client_name} for ${new Date(booking.event_date).toLocaleDateString()} has been rejected.`,
        confirmed: `🎉 BOOKING CONFIRMED! The deposit for your event with ${booking.client_name} on ${new Date(booking.event_date).toLocaleDateString()} is paid. Client Address: ${booking.event_address}. Phone: ${booking.client_phone}.`,
      };

      const performerMessage = performerMessageMap[status as keyof typeof performerMessageMap];
      if (performerMessage) addCommunication({ sender: 'System', recipient: booking.performer_id, message: performerMessage, booking_id: bookingId, type: 'booking_update' });

      const adminMessageMap = {
        pending_deposit_confirmation: `🧾 Client for booking #${bookingId.slice(0, 8)} (${booking.client_name}) has confirmed deposit payment. Please verify.`,
        confirmed: `✅ Booking Confirmed for ${booking.client_name} with ${booking.performer?.name}.`,
        rejected: `❌ Booking Rejected for ${booking.client_name} with ${booking.performer?.name}.`,
      };

      const adminMessage = adminMessageMap[status as keyof typeof adminMessageMap];
      if (adminMessage) addCommunication({ sender: 'System', recipient: 'admin', message: adminMessage, booking_id: bookingId, type: 'admin_message' });

    } catch (err) {
      console.error("Failed to update booking:", err);
      setBookings(originalBookings);
      setError("Could not update booking status.");
    }
  };

  const handleUpdateDoNotServeStatus = async (entryId: string, status: DoNotServeStatus) => {
    const entry = doNotServeList.find(e => e.id === entryId);
    if (!entry) return;
    const originalList = doNotServeList;

    setDoNotServeList(prev => prev.map(e => e.id === entryId ? { ...e, status } : e));

    try {
      const { error: apiError } = await api.updateDoNotServeStatus(entryId, status);
      if (apiError) throw apiError;

      // Log the admin's decision
      await api.createAuditLog(
        `DNS_ENTRY_${status.toUpperCase()}`,
        String(authedUser?.id || 'admin'),
        { entryId, clientName: entry.client_name, reason: entry.reason },
        'admin'
      );

      const message = `The 'Do Not Serve' submission for '${entry.client_name}' submitted by ${entry.performer?.name} has been ${status}.`;
      addCommunication({ sender: 'System', recipient: 'admin', message, type: 'admin_message' });
      if (entry.submitted_by_performer_id !== 0) {
        addCommunication({ sender: 'System', recipient: entry.submitted_by_performer_id, message, type: 'admin_message' });
      }
    } catch (err) {
      console.error("Failed to update DNS entry:", err);
      setDoNotServeList(originalList);
      setError("Could not update 'Do Not Serve' entry.");
    }
  }

  const handleCreateDoNotServeEntry = async (newEntryData: Omit<DoNotServeEntry, 'id' | 'created_at' | 'status'>, submitterName: Performer['name']) => {
    try {
      const { data, error: apiError } = await api.createDoNotServeEntry(newEntryData);
      if (apiError) throw apiError;
      setDoNotServeList(prev => [data![0], ...prev]);
      addCommunication({ sender: submitterName, recipient: 'admin', message: `New 'Do Not Serve' entry submitted by ${submitterName} for review against "${newEntryData.client_name}".`, type: 'admin_message' })
    } catch (err) {
      console.error("Failed to create DNS entry:", err);
      setError("Could not create 'Do Not Serve' entry.");
    }
  };

  const handlePerformerBookingDecision = async (bookingId: string, decision: 'accepted' | 'declined', eta?: number) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    const performerName = booking.performer?.name || 'The performer';

    if (decision === 'declined') {
      await handleUpdateBookingStatus(bookingId, 'rejected');
      addCommunication({ sender: performerName, recipient: 'admin', message: `${performerName} has DECLINED the booking request from ${booking.client_name}.`, type: 'admin_message' });
      addCommunication({ sender: 'System', recipient: 'user', message: `We're sorry, ${performerName} is unable to accept your booking request at this time. Please try booking another performer. We have many other talented entertainers available!`, booking_id: booking.id, type: 'booking_update' });
      return;
    }

    const isVerifiedBooker = bookings.some(b =>
      b.status === 'confirmed' && b.client_email.toLowerCase() === booking.client_email.toLowerCase()
    );
    const newStatus = isVerifiedBooker ? 'deposit_pending' : 'pending_vetting';

    const updateData: Partial<Booking> = { status: newStatus };
    if (eta && eta > 0) {
      updateData.performer_eta_minutes = eta;
    }

    const originalBookings = bookings;
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, ...updateData } : b));

    try {
      const { error: apiError } = await api.updateBookingStatus(bookingId, newStatus, updateData);
      if (apiError) throw apiError;

      const etaMessagePartAdmin = eta && eta > 0 ? ` with an ETA of ${eta} minutes` : '';
      const etaMessagePartUser = eta && eta > 0 ? ` Her ETA is ~${eta} minutes.` : '';
      const etaSmsIcon = eta && eta > 0 ? `⏱ ETA: ${eta} mins` : '';

      if (isVerifiedBooker) {
        addCommunication({ sender: performerName, recipient: 'admin', message: `${performerName} has ACCEPTED the booking from verified client ${booking.client_name}${etaMessagePartAdmin}. It has automatically skipped vetting and is awaiting deposit.`, type: 'admin_message' });
        addCommunication({ sender: 'System', recipient: 'user', message: `${performerName} has accepted your request!${etaMessagePartUser} As a verified client, you can now proceed to payment.`, booking_id: booking.id, type: 'booking_update' });

        const { depositAmount } = calculateBookingCost(booking.duration_hours, booking.services_requested || [], 1);
        showPhoneMessage({ for: 'Client', content: <p>🎉 <strong>Booking Approved!</strong><br />{performerName} has accepted your request!{eta && <><br />{etaSmsIcon}</>}<br /><br />Your application for {booking.event_type} is approved. Please pay the <strong>${(depositAmount || 0).toFixed(2)}</strong> deposit via the booking page to confirm your event.</p> });
        addCommunication({ sender: 'System', recipient: booking.performer_id, message: `✅ Booking Vetted! The application from ${booking.client_name} for ${new Date(booking.event_date).toLocaleDateString()} has been approved. Awaiting deposit.`, booking_id: booking.id, type: 'booking_update' });

      } else {
        addCommunication({ sender: performerName, recipient: 'admin', message: `${performerName} has ACCEPTED the booking request from ${booking.client_name}${etaMessagePartAdmin}. It is now pending your vetting.`, type: 'admin_message' });
        addCommunication({ sender: 'System', recipient: 'user', message: `${performerName} has accepted your request!${etaMessagePartUser} Your booking is now with our admin team for final review.`, booking_id: booking.id, type: 'booking_update' });
        showPhoneMessage({ for: 'Client', content: <p>🙌 <strong>Request Accepted!</strong><br /><strong>{performerName}</strong> has accepted your request!{eta && <><br />{etaSmsIcon}</>}<br /><br />Our admin team is now performing final vetting. We'll notify you once it's ready for deposit.</p> });
      }
    } catch (err) {
      console.error("Failed performer decision update:", err);
      setBookings(originalBookings);
      setError("Failed to process performer decision.");
    }
  };

  const handleUpdateEta = async (bookingId: string, eta: number) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    const updateData: Partial<Booking> = { performer_eta_minutes: eta };
    const originalBookings = bookings;
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, ...updateData } : b));

    try {
      const { error: apiError } = await api.updateBookingStatus(bookingId, booking.status, updateData);
      if (apiError) throw apiError;

      const performerName = booking.performer?.name || 'Performer';
      addCommunication({ sender: performerName, recipient: 'user', message: `ETA has been updated to ${eta} minutes.`, booking_id: booking.id, type: 'booking_update' });

      showPhoneMessage({
        for: 'Client',
        content: <p>⏱ <strong>ETA Updated!</strong><br /><strong>{performerName}</strong> has updated their ETA to <strong>{eta} minutes</strong> for your {booking.event_type} booking.</p>
      });
    } catch (err) {
      console.error("Failed to update ETA:", err);
      setBookings(originalBookings);
      setError("Failed to update ETA.");
    }
  };

  const handleAdminBookingDecisionForPerformer = async (bookingId: string, decision: 'accepted' | 'declined') => {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    addCommunication({ sender: 'Admin', recipient: booking.performer_id, message: `An admin has ${decision} the booking from ${booking.client_name} on your behalf.`, type: 'booking_update' });
    await handlePerformerBookingDecision(bookingId, decision, undefined);
  }

  const handleAdminChangePerformer = async (bookingId: string, newPerformerId: number) => {
    const booking = bookings.find(b => b.id === bookingId);
    const newPerformer = performers.find(p => p.id === newPerformerId);
    if (!booking || !newPerformer) return;

    const oldPerformerId = booking.performer_id;
    const oldPerformerName = booking.performer?.name || 'Previous Performer';

    const updates: Partial<Booking> = {
      performer_id: newPerformerId,
      status: 'pending_performer_acceptance',
      performer_reassigned_from_id: oldPerformerId,
    };

    const originalBookings = bookings;
    setBookings(prev => prev.map(b => b.id === bookingId ? {
      ...b,
      ...updates,
      performer: { id: newPerformerId, name: newPerformer.name },
    } : b));

    try {
      const { error: apiError } = await api.updateBookingStatus(bookingId, 'pending_performer_acceptance', updates);
      if (apiError) throw apiError;

      addCommunication({ sender: 'Admin', recipient: 'admin', message: `Booking for ${booking.client_name} has been reassigned from ${oldPerformerName} to ${newPerformer.name}.`, type: 'admin_message' });
      addCommunication({ sender: 'Admin', recipient: 'user', message: `An update on your booking: ${newPerformer.name} has now been assigned to your event. We are awaiting their confirmation.`, booking_id: booking.id, type: 'booking_update' });
      addCommunication({ sender: 'Admin', recipient: oldPerformerId, message: `Your booking for ${booking.client_name} has been reassigned to another performer by an administrator.`, booking_id: booking.id, type: 'booking_update' });
      addCommunication({ sender: 'Admin', recipient: newPerformerId, message: `You have been newly assigned a booking for ${booking.client_name}. Please review and accept/decline.`, booking_id: booking.id, type: 'booking_update' });
    } catch (err) {
      console.error("Failed to reassign performer:", err);
      setBookings(originalBookings);
      setError("Could not reassign performer.");
    }
  };

  const handleUpdatePerformer = async (performerId: number, updates: Partial<Performer>) => {
    const originalPerformers = performers;
    setPerformers(prev => prev.map(p => p.id === performerId ? { ...p, ...updates } : p));
    try {
      const { error } = await api.updatePerformer(performerId, updates);
      if (error) throw error;
    } catch (err) {
      console.error("Failed to update performer:", err);
      setPerformers(originalPerformers);
      setError("Failed to update performer details.");
    }
  };

  const handleCreatePerformer = async (performerData: Omit<Performer, 'id'>) => {
    try {
      const { data, error } = await api.createPerformer(performerData);
      if (error) throw error;
      if (data) {
        setPerformers(prev => [...prev, data]);
      }
    } catch (err) {
      console.error("Failed to create performer:", err);
      setError("Failed to create new performer.");
    }
  };

  const handleBookingRequest = async (formState: BookingFormState, requestedPerformers: Performer[]) => {
    try {
      const { data: newBookings, error: apiError } = await api.createBookingRequest(formState, requestedPerformers);
      if (apiError) throw apiError;

      sessionStorage.setItem('clientEmail', formState.email);
      setBookings(prev => [...newBookings!, ...prev]);

      const firstBooking = newBookings![0];
      addCommunication({ sender: 'System', recipient: 'user', message: `🎉 Booking Request Sent! We've notified ${newBookings!.map(b => b.performer?.name).join(', ')} of your request.`, booking_id: firstBooking.id, type: 'booking_update' });
      addCommunication({ sender: 'System', recipient: 'admin', message: `📥 New Booking Request: for ${formState.fullName} with ${newBookings!.map(b => b.performer?.name).join(', ')}. Awaiting performer acceptance.`, type: 'admin_message' });

      showPhoneMessage({ for: 'Client', content: <p>🎉 <strong>Request Sent!</strong><br />We've sent your request to <strong>{newBookings!.map(b => b.performer?.name).join(' & ')}</strong>. We'll notify you as soon as they respond!</p> });

      setTimeout(() => {
        const { totalCost, depositAmount } = calculateBookingCost(firstBooking.duration_hours, firstBooking.services_requested || [], newBookings!.length);
        showPhoneMessage({
          for: 'Performer',
          content: <p>🎭 <strong>New Booking Request!</strong><br />From: <strong>{firstBooking.client_name}</strong><br />For: {new Date(firstBooking.event_date).toLocaleDateString()}<br />Event: {firstBooking.event_type}<br />Guests: {firstBooking.number_of_guests}<br /><br /><strong>Total Value:</strong> ${(totalCost || 0).toFixed(2)}<br /><strong>Deposit:</strong> ${(depositAmount || 0).toFixed(2)}</p>,
          actions: [
            { label: '✅ Accept Booking', onClick: () => handlePerformerBookingDecision(firstBooking.id, 'accepted'), style: 'primary' },
            { label: '❌ Decline Booking', onClick: () => handlePerformerBookingDecision(firstBooking.id, 'declined'), style: 'secondary' },
          ]
        });
      }, 6000);
      return { success: true, message: 'Booking submitted', bookingIds: newBookings!.map(b => b.id) };
    } catch (err: any) {
      return { success: false, message: err.message || 'An unknown error occurred.' };
    }
  };

  const handleBookingSubmitted = () => {
    fetchData();
    setSelectedForBooking([]);
    setView('client_dashboard');
  };

  const handleViewProfile = (performer: Performer) => {
    window.scrollTo(0, 0);
    if (view === 'available_now' || view === 'future_bookings' || view === 'services') {
      setBookingOrigin(view);
    }
    setViewedPerformer(performer);
    setView('profile');
  };

  const handleViewDoNotServe = () => {
    setView('do_not_serve');
  };

  const handleBackToDashboard = () => {
    if (authedUser?.role === 'admin') setView('admin_dashboard');
    else if (authedUser?.role === 'performer') setView('performer_dashboard');
    else setView('available_now');
  }

  const handleProceedToBooking = () => {
    if (view === 'available_now' || view === 'future_bookings' || view === 'services') {
      setBookingOrigin(view);
    }
    window.scrollTo(0, 0);
    setView('booking');
  };

  const handleBookSinglePerformer = (performer: Performer) => {
    setSelectedForBooking([performer]);
    handleProceedToBooking();
  };

  const handleBookService = (serviceId: string) => {
    setServiceIdFilter(serviceId);
    setView('future_bookings');
    setCategoryFilter('');
    setAvailabilityFilter('');
    setServiceAreaFilter('');
    setSearchQuery('');
    window.scrollTo(0, 0);
  };

  const handleClearServiceFilter = () => {
    setServiceIdFilter(null);
  };


  const filteredPerformers = useMemo(() => {
    const basePerformers = view === 'available_now'
      ? performers.filter(p => p.status === 'available')
      : performers.filter(p => p.status !== 'pending_verification' && p.status !== 'rejected');

    const lowerCaseQuery = searchQuery.toLowerCase().trim();

    return basePerformers.filter(p => {
      const categoryMatch = !categoryFilter || p.service_ids.some(id => {
        const service = allServices.find(s => s.id === id);
        return service && service.category === categoryFilter;
      });
      const availabilityMatch = view === 'available_now' || !availabilityFilter || p.status === availabilityFilter;

      const serviceIdMatch = !serviceIdFilter || p.service_ids.includes(serviceIdFilter);

      const serviceAreaMatch = !serviceAreaFilter || p.service_areas.includes(serviceAreaFilter);

      const searchMatch = !lowerCaseQuery || (
        p.name.toLowerCase().includes(lowerCaseQuery) ||
        p.tagline.toLowerCase().includes(lowerCaseQuery) ||
        p.service_ids.some(id => {
          const service = allServices.find(s => s.id === id);
          return service && service.name.toLowerCase().includes(lowerCaseQuery);
        })
      );

      return categoryMatch && availabilityMatch && searchMatch && serviceIdMatch && serviceAreaMatch;
    });
  }, [performers, categoryFilter, availabilityFilter, view, searchQuery, serviceIdFilter, serviceAreaFilter]);


  const AccessDenied = () => (
    <div className="text-center py-20 card-base max-w-lg mx-auto">
      <h2 className="text-3xl font-bold text-red-500">Access Denied</h2>
      <p className="text-zinc-400 mt-2">You must be logged in with the correct role to view this page.</p>
      <button onClick={() => setView('available_now')} className="btn-primary mt-6">
        Return to Gallery
      </button>
    </div>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-zinc-400">
          <LoaderCircle className="w-16 h-16 animate-spin text-orange-500 mb-4" />
          <h2 className="text-xl font-semibold text-zinc-200">Initializing Secure Backend...</h2>
          <p>Verifying performer availability.</p>
        </div>
      );
    }

    if (performers.length === 0 && !isLoading) {
      return (
        <div className="text-center py-20 card-base !bg-orange-500/5 border-orange-500/20 max-w-2xl mx-auto animate-fade-in">
          <Sparkles className="h-16 w-16 text-orange-500 mx-auto mb-6" />
          <h2 className="text-3xl font-bold text-white mb-4">Demo Environment Ready</h2>
          <p className="text-zinc-400 mb-8 text-lg">
            This is a fresh demonstration environment. To begin exploring the booking flow, dashboards, and admin features, please seed the database with sample data.
          </p>
          <button
            onClick={() => resetDemoData()}
            className="btn-primary !py-4 !px-8 !text-lg flex items-center gap-3 mx-auto shadow-xl shadow-orange-500/20"
          >
            <Database className="h-6 w-6" />
            Seed Demonstration Data
          </button>
        </div>
      );
    }

    if (error) {
      return <div className="text-center p-8 bg-red-900/50 border border-red-500 rounded-lg text-white max-w-4xl mx-auto"><h2 className="text-xl font-bold">An Error Occurred</h2><p className="mt-2 text-red-200">{error}</p></div>;
    }

    const renderTabs = () => {
      const isAvailableNow = view === 'available_now';
      const isFutureBookings = view === 'future_bookings';
      const isServices = view === 'services';
      return (
        <div className="mb-8 flex justify-center border-b border-zinc-800">
          <button
            onClick={() => { setView('available_now'); setServiceIdFilter(null); setSelectedForBooking([]); setCategoryFilter(''); setAvailabilityFilter(''); }}
            className={`flex items-center gap-2 py-4 px-6 text-sm font-semibold transition-colors ${isAvailableNow ? 'border-b-2 border-orange-500 text-orange-400' : 'border-b-2 border-transparent text-zinc-400 hover:text-white'}`}
          >
            <Clock size={16} /> Available Now
          </button>
          <button
            onClick={() => { setView('future_bookings'); setServiceIdFilter(null); setSelectedForBooking([]); setCategoryFilter(''); setAvailabilityFilter(''); }}
            className={`flex items-center gap-2 py-4 px-6 text-sm font-semibold transition-colors ${isFutureBookings ? 'border-b-2 border-orange-500 text-orange-400' : 'border-b-2 border-transparent text-zinc-400 hover:text-white'}`}
          >
            <CalendarCheck size={16} /> Book for Future
          </button>
          <button
            onClick={() => { setView('services'); setServiceIdFilter(null); setSelectedForBooking([]); setCategoryFilter(''); setAvailabilityFilter(''); }}
            className={`flex items-center gap-2 py-4 px-6 text-sm font-semibold transition-colors ${isServices ? 'border-b-2 border-orange-500 text-orange-400' : 'border-b-2 border-transparent text-zinc-400 hover:text-white'}`}
          >
            <Briefcase size={16} /> Services
          </button>
        </div>
      );
    };

    const HeroSection = () => (
      <div className="text-center mb-12 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 sm:p-12">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white mb-4 tracking-tight">
          Find the Perfect Entertainer
        </h1>
        <p className="text-lg text-zinc-400 max-w-3xl mx-auto">
          Browse our selection of professional, vetted entertainers in Western Australia. Whether you need someone right now or for a future event, we provide a secure and seamless booking experience.
        </p>
      </div>
    );

    switch (view) {
      case 'profile':
        return viewedPerformer && <PerformerProfile performer={viewedPerformer} onBack={handleReturnToGallery} onBook={handleBookSinglePerformer} />;
      case 'booking':
        const approvedDNS = doNotServeList.filter(e => e.status === 'approved');
        return selectedForBooking.length > 0 && (
          <BookingProcess
            performers={selectedForBooking}
            onBack={handleReturnToGallery}
            onBookingSubmitted={handleBookingSubmitted}
            bookings={bookings}
            onUpdateBookingStatus={handleUpdateBookingStatus}
            onBookingRequest={handleBookingRequest}
            doNotServeList={approvedDNS}
            addCommunication={addCommunication}
            onShowPrivacyPolicy={handleShowPrivacyPolicy}
            onShowTermsOfService={handleShowTermsOfService}
            initialSelectedServices={serviceIdFilter ? [serviceIdFilter] : []}
          />
        );
      case 'admin_dashboard':
        if (authedUser?.role !== 'admin') return <AccessDenied />;
        return <AdminDashboard
          bookings={bookings}
          performers={performers}
          doNotServeList={doNotServeList}
          onUpdateBookingStatus={handleUpdateBookingStatus}
          onUpdateDoNotServeStatus={handleUpdateDoNotServeStatus}
          onViewDoNotServe={handleViewDoNotServe}
          communications={communications}
          onAdminDecisionForPerformer={handleAdminBookingDecisionForPerformer}
          onAdminChangePerformer={handleAdminChangePerformer}
          onUpdatePerformer={handleUpdatePerformer}
          onCreatePerformer={handleCreatePerformer}
        />;
      case 'performer_dashboard':
        if (authedUser?.role !== 'performer') return <AccessDenied />;
        const currentPerformer = performers.find(p => p.id === authedUser.id);
        const performerBookings = bookings.filter(b => b.performer_id === authedUser.id);
        const performerCommunications = communications.filter(c => c.recipient === authedUser.id);
        // Fix: Use actorUid for filtering audit logs to match the interface.
        const performerAuditLogs = auditLogs.filter(log => log.actorUid === String(authedUser.id));
        return currentPerformer ? (
          <PerformerDashboard
            performer={currentPerformer}
            bookings={performerBookings}
            communications={performerCommunications}
            auditLogs={performerAuditLogs}
            onToggleStatus={(status) => handlePerformerStatusChange(currentPerformer.id, status)}
            onViewDoNotServe={handleViewDoNotServe}
            onBookingDecision={handlePerformerBookingDecision}
            onUpdateEta={handleUpdateEta}
            onUpdateBookingStatus={handleUpdateBookingStatus}
          />
        ) : (
          <p className="text-center text-gray-400">Select a performer to view their dashboard.</p>
        );
      case 'client_dashboard':
        return <ClientDashboard bookings={bookings} onBrowsePerformers={() => setView('available_now')} onShowSettings={() => setView('settings')} />;
      case 'settings':
        return <UserSettings settings={settings} onSettingsChange={setSettings} onBack={() => setView('client_dashboard')} />;
      case 'faq':
        return <FAQ onBack={() => setView('available_now')} />;
      case 'do_not_serve':
        if (!authedUser || role === 'user') return <AccessDenied />;
        const performerSubmitting = performers.find(p => p.id === authedUser.id);
        return <DoNotServe
          role={role}
          currentPerformer={performerSubmitting}
          doNotServeList={doNotServeList}
          onBack={handleBackToDashboard}
          onCreateEntry={handleCreateDoNotServeEntry}
          addCommunication={addCommunication}
        />
      case 'performer_onboarding':
        return <PerformerOnboarding onSubmit={handleCreatePerformer} onCancel={() => setView('available_now')} />;
      case 'services':
        return (
          <div className="animate-fade-in">
            {renderTabs()}
            <ServicesGallery onBookService={handleBookService} />
          </div>
        );
      case 'available_now':
      case 'future_bookings':
      default:
        const isAvailableNow = view === 'available_now';
        return (
          <div className="animate-fade-in">
            <HeroSection />
            {renderTabs()}
            {serviceIdFilter && (
              <div className="text-center mb-6 bg-zinc-900/50 border border-zinc-800 rounded-xl max-w-xl mx-auto p-4 flex items-center justify-center gap-4">
                <p className="text-zinc-300">
                  Showing performers for: <strong className="text-orange-400">{allServices.find(s => s.id === serviceIdFilter)?.name}</strong>
                </p>
                <button onClick={handleClearServiceFilter} className="bg-orange-500/20 text-orange-300 text-xs font-semibold px-3 py-1 rounded-full hover:bg-orange-500/40 transition-colors flex items-center gap-1">
                  <X size={12} /> Clear Filter
                </button>
              </div>
            )}
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-white mb-2">
                {isAvailableNow ? 'Available Now' : 'Schedule for the Future'}
              </h2>
              <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                {isAvailableNow
                  ? "These performers are online and ready for immediate bookings."
                  : "Browse all professionals. Select one or more to begin your booking for a future date."
                }
              </p>
            </div>
            <div className={`mb-8 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl max-w-3xl mx-auto grid grid-cols-1 ${!isAvailableNow ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
              <div className="relative">
                <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" aria-hidden="true" />
                <select aria-label="Filter by service category" onChange={(e) => setCategoryFilter(e.target.value)} value={categoryFilter} className="input-base input-with-icon appearance-none">
                  <option value="">All Service Categories</option>
                  {uniqueCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 pointer-events-none" />
              </div>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" aria-hidden="true" />
                <select aria-label="Filter by service area" onChange={(e) => setServiceAreaFilter(e.target.value as ServiceArea | '')} value={serviceAreaFilter} className="input-base input-with-icon appearance-none">
                  <option value="">All Service Areas</option>
                  {serviceAreas.map(area => <option key={area} value={area}>{area}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 pointer-events-none" />
              </div>
              {!isAvailableNow && (
                <div className="relative">
                  <Radio className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" aria-hidden="true" />
                  <select aria-label="Filter by availability" onChange={(e) => setAvailabilityFilter(e.target.value as PerformerStatus | '')} value={availabilityFilter} className="input-base input-with-icon appearance-none">
                    <option value="">All Availabilities</option>
                    <option value="available">Available</option>
                    <option value="busy">Busy</option>
                    <option value="offline">Offline</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 pointer-events-none" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
              {filteredPerformers.map((performer) => (
                <PerformerCard
                  key={performer.id}
                  performer={performer}
                  onViewProfile={handleViewProfile}
                  onToggleSelection={handleTogglePerformerSelection}
                  isSelected={selectedForBooking.some(p => p.id === performer.id)}
                />
              ))}
            </div>
            {filteredPerformers.length === 0 && !isLoading && (
              <div className="text-center col-span-full py-12">
                <p className="text-zinc-500">
                  {searchQuery ? `No performers match your search for "${searchQuery}".` : 'No performers match the current filters.'}
                </p>
              </div>
            )}
          </div>
        );
    }
  };

  const handleNavigate = (targetView: string) => {
    if (targetView === 'bookings') {
      setView(authedUser ? (authedUser.role === 'admin' ? 'admin_dashboard' : authedUser.role === 'performer' ? 'performer_dashboard' : 'client_dashboard') : 'client_dashboard');
    } else {
      setView(targetView as any);
    }
  };

  const suspenseFallback = (
    <div className="flex items-center justify-center min-h-[200px]">
      <LoaderCircle className="h-8 w-8 animate-spin text-orange-500" />
    </div>
  );

  return (
    <ErrorBoundary>
    <Suspense fallback={suspenseFallback}>
    <div className="min-h-screen text-white flex flex-col">
      {showDemoBanner && performers.length > 0 && (
        <div className="bg-orange-600 text-white py-2 px-4 text-center text-xs sm:text-sm font-medium relative z-50">
          <div className="container mx-auto flex items-center justify-center gap-4">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <strong>Demo Mode Active:</strong> Use the role switcher in the header to explore Client, Performer, and Admin views.
            </span>
            <button
              onClick={() => setShowDemoBanner(false)}
              className="hover:bg-white/20 rounded p-0.5 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <Header
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onNavigate={handleNavigate}
      >
        <div className="flex items-center gap-2 sm:gap-4">
          <RoleSwitcher
            currentRole={authedUser?.role || 'user'}
            onRoleChange={handleRoleChange}
            performers={performers}
            currentPerformerId={(authedUser?.role === 'performer' && authedUser.id) ? authedUser.id : null}
            onPerformerChange={handlePerformerChange}
          />
          {authedUser ? (
            <>
              <span className="text-sm text-zinc-300 hidden sm:block">Welcome, <strong className="font-semibold text-white">{authedUser.name}</strong></span>
              <button onClick={handleLogout} className="bg-zinc-800 hover:bg-zinc-700 text-white flex items-center gap-2 text-sm p-2 sm:px-4 sm:py-2 rounded-lg transition-colors" title="Logout">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setView('client_dashboard')}
                className="bg-zinc-800 hover:bg-zinc-700 text-white flex items-center gap-2 text-sm p-2 sm:px-4 sm:py-2 rounded-lg transition-colors"
                title="My Bookings"
              >
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">My Bookings</span>
              </button>
              <button onClick={() => setShowLogin(true)} className="btn-primary flex items-center gap-2 text-sm p-2 sm:px-4 sm:py-2" title="Login">
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Login</span>
              </button>
              <button
                onClick={() => setShowWalkthrough(true)}
                title="Start Guided Tour"
                className="hidden sm:flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-colors"
              >
                <span className="text-xs font-bold">▶ Tour</span>
              </button>
            </>
          )}
        </div>
      </Header>
      <main className="flex-grow container mx-auto px-4 py-8 md:py-12">
        {renderContent()}
      </main>
      <Footer onShowPrivacyPolicy={handleShowPrivacyPolicy} onShowTermsOfService={handleShowTermsOfService} onShowPresentation={() => setShowPresentation(true)} />
      {phoneMessage && <DemoPhone message={phoneMessage} onClose={() => setPhoneMessage(null)} />}

      {/* Real-time Notifications Toast Container */}
      <div className="fixed top-24 right-4 z-[100] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
        {notifications.map(notification => (
          <div
            key={notification.id}
            className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-xl animate-slide-in-right pointer-events-auto flex items-start gap-3 ${notification.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : notification.type === 'warning'
                ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                : 'bg-zinc-900/90 border-white/10 text-white'
              }`}
          >
            <div className="flex-1 text-sm font-medium leading-relaxed">
              {notification.message}
            </div>
            <button
              onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {showPrivacyPolicy && <PrivacyPolicy onClose={() => setShowPrivacyPolicy(false)} />}
      {showTermsOfService && <TermsOfService onClose={() => setShowTermsOfService(false)} />}
      {showLogin && <Login onLogin={handleLogin} onClose={() => setShowLogin(false)} performers={performers} onNavigateToOnboarding={() => { setShowLogin(false); setView('performer_onboarding'); }} />}
      {showPresentation && <PresentationVideo onClose={() => setShowPresentation(false)} />}
      {!ageVerified && <AgeGate onVerified={handleAgeVerified} onShowPrivacyPolicy={handleShowPrivacyPolicy} onShowTermsOfService={handleShowTermsOfService} />}
      <WalkthroughOverlay
        isActive={showWalkthrough && ageVerified}
        onClose={() => {
          setShowWalkthrough(false);
          localStorage.setItem('walkthroughShown', 'true');
        }}
        onRoleChange={(role) => handleRoleChange(role === 'Client' ? 'user' : role.toLowerCase() as Role)}
      />
    </div>
    </Suspense>
    </ErrorBoundary>
  );
};

export default App;