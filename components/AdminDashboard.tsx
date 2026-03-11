import React, { useMemo, useState } from 'react';
import { Booking, Performer, BookingStatus, DoNotServeEntry, DoNotServeStatus, Communication, Service } from '../types';
import { allServices } from '../data/mockData';
import { ShieldCheck, ShieldAlert, Check, X, MessageSquare, Download, Filter, FileText, DollarSign, CreditCard, BarChart, Inbox, Users as UsersIcon, UserCog, RefreshCcw, ChevronDown, Clock, LoaderCircle, LineChart, TrendingUp, CheckCircle, Calendar, ArrowUpDown, ArrowUp, ArrowDown, Search, Database, Plus, Edit, Trash2, Star, Mail, Phone } from 'lucide-react';
import { calculateBookingCost } from '../utils/bookingUtils';
import { resetDemoData, isDemoMode, api } from '../services/api';
import ChatDialog from './ChatDialog';

interface AdminDashboardProps {
  bookings: Booking[];
  performers: Performer[];
  doNotServeList: DoNotServeEntry[];
  communications: Communication[];
  onUpdateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  onUpdateDoNotServeStatus: (entryId: string, status: DoNotServeStatus) => Promise<void>;
  onViewDoNotServe: () => void;
  onAdminDecisionForPerformer: (bookingId: string, decision: 'accepted' | 'declined') => Promise<void>;
  onAdminChangePerformer: (bookingId: string, newPerformerId: number) => Promise<void>;
  onUpdatePerformer: (performerId: number, updates: Partial<Performer>) => Promise<void>;
  onCreatePerformer: (performerData: Omit<Performer, 'id'>) => Promise<void>;
}

const getPaymentStatusWeight = (status?: string) => {
  switch(status) {
    case 'unpaid': return 0;
    case 'deposit_paid': return 1;
    case 'fully_paid': return 2;
    case 'refunded': return 3;
    default: return -1;
  }
};

const statusClasses: Record<BookingStatus, string> = {
    pending_performer_acceptance: 'border-purple-500/50 bg-purple-900/30 text-purple-300',
    pending_vetting: 'border-yellow-500/50 bg-yellow-900/30 text-yellow-300',
    deposit_pending: 'border-orange-500/50 bg-orange-900/30 text-orange-300',
    pending_deposit_confirmation: 'border-blue-500/50 bg-blue-900/30 text-blue-300',
    confirmed: 'border-green-500/50 bg-green-900/30 text-green-300',
    en_route: 'border-blue-500/50 bg-blue-900/30 text-blue-300',
    arrived: 'border-emerald-500/50 bg-emerald-900/30 text-emerald-300',
    in_progress: 'border-indigo-500/50 bg-indigo-900/30 text-indigo-300',
    completed: 'border-zinc-500/50 bg-zinc-900/30 text-zinc-300',
    cancelled: 'border-zinc-500/50 bg-zinc-900/30 text-zinc-400',
    rejected: 'border-red-500/50 bg-red-900/30 text-red-300',
};

const bookingStatusOptions: { value: BookingStatus; label: string }[] = [
    { value: 'pending_performer_acceptance', label: 'Pending Performer Acceptance' },
    { value: 'pending_vetting', label: 'Pending Vetting' },
    { value: 'deposit_pending', label: 'Deposit Pending' },
    { value: 'pending_deposit_confirmation', label: 'Pending Deposit Confirmation' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'en_route', label: 'En Route' },
    { value: 'arrived', label: 'Arrived' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'rejected', label: 'Rejected' },
];

type AdminTab = 'management' | 'payments' | 'performers' | 'dns' | 'reporting';

// Admin Dashboard Component for managing bookings, performers, and reporting
const AdminDashboard: React.FC<AdminDashboardProps> = ({ bookings, performers, doNotServeList, communications, onUpdateBookingStatus, onUpdateDoNotServeStatus, onViewDoNotServe, onAdminDecisionForPerformer, onAdminChangePerformer, onUpdatePerformer, onCreatePerformer }) => {
  
  const [activeTab, setActiveTab] = useState<AdminTab>('management');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'event_date' | 'client_name' | 'performer_name' | 'status' | 'payment_status'>('event_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [loadingState, setLoadingState] = useState<{ type: string, id: string } | null>(null);
  const [activeChatBooking, setActiveChatBooking] = useState<Booking | null>(null);
  const [chatMessages, setChatMessages] = useState<Communication[]>([]);
  const [editingPerformer, setEditingPerformer] = useState<Performer | null>(null);
  const [isAddingPerformer, setIsAddingPerformer] = useState(false);
  const [performerForm, setPerformerForm] = useState<Omit<Performer, 'id'>>({
    name: '',
    tagline: '',
    bio: '',
    photo_url: 'https://picsum.photos/seed/performer/400/600',
    status: 'available',
    rating: 5.0,
    review_count: 0,
    service_ids: [],
    service_areas: [],
    created_at: new Date().toISOString(),
  });

  const handleAction = async (type: string, id: string, action: () => Promise<void>) => {
    setLoadingState({ type, id });
    try {
      await action();
    } catch (error) {
      console.error(`Action ${type} for id ${id} failed:`, error);
    } finally {
      setLoadingState(null);
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
        'Admin',
        activeChatBooking.client_name // Defaulting to client, but could be performer
      );
      
      if (error) throw error;
      if (data) {
        setChatMessages(prev => [...prev, data]);
      }
    } catch (err) {
      console.error("Failed to send message", err);
    }
  };

  // Helper to weight status for sorting payment lifecycle
  const getStatusWeight = (status: BookingStatus) => {
    switch(status) {
      case 'pending_deposit_confirmation': return 5; // Needs admin eye now
      case 'deposit_pending': return 4;               // Action required by client
      case 'confirmed': return 3;                     // Done
      case 'pending_vetting': return 2;               // Early stage
      case 'pending_performer_acceptance': return 1;  // Early stage
      case 'rejected': return 0;                      // Dead
      default: return 0;
    }
  };

  const filteredBookings = useMemo(() => {
    let result = [...bookings];

    if (statusFilter) {
        result = result.filter(b => b.status === statusFilter);
    }

    if (searchTerm) {
        const query = searchTerm.toLowerCase().trim();
        result = result.filter(b => 
            b.client_name.toLowerCase().includes(query) || 
            b.event_type.toLowerCase().includes(query) ||
            (b.performer?.name || '').toLowerCase().includes(query)
        );
    }

    return result.sort((a, b) => {
        let valA: any = '';
        let valB: any = '';
        
        switch (sortField) {
            case 'event_date':
                valA = new Date(a.event_date).getTime();
                valB = new Date(b.event_date).getTime();
                break;
            case 'client_name':
                valA = a.client_name.toLowerCase();
                valB = b.client_name.toLowerCase();
                break;
            case 'performer_name':
                valA = (a.performer?.name || '').toLowerCase();
                valB = (b.performer?.name || '').toLowerCase();
                break;
            case 'status':
                valA = a.status;
                valB = b.status;
                break;
            case 'payment_status':
                valA = getPaymentStatusWeight(a.payment_status);
                valB = getPaymentStatusWeight(b.payment_status);
                break;
        }
        
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
  }, [bookings, statusFilter, searchTerm, sortField, sortDirection]);
  
  const paymentRelatedBookings = useMemo(() => {
    let result = bookings.filter(b => ['deposit_pending', 'pending_deposit_confirmation', 'confirmed', 'rejected'].includes(b.status));
    
    if (statusFilter) {
      result = result.filter(b => b.status === statusFilter);
    }

    if (searchTerm) {
        const query = searchTerm.toLowerCase().trim();
        result = result.filter(b => 
            b.client_name.toLowerCase().includes(query) || 
            b.event_type.toLowerCase().includes(query) ||
            (b.performer?.name || '').toLowerCase().includes(query)
        );
    }

    // Apply sorting to payments table too
    return result.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      
      switch (sortField) {
          case 'event_date':
              valA = new Date(a.event_date).getTime();
              valB = new Date(b.event_date).getTime();
              break;
          case 'client_name':
              valA = a.client_name.toLowerCase();
              valB = b.client_name.toLowerCase();
              break;
          case 'payment_status':
              valA = getPaymentStatusWeight(a.payment_status);
              valB = getPaymentStatusWeight(b.payment_status);
              break;
          case 'status':
              valA = getStatusWeight(a.status);
              valB = getStatusWeight(b.status);
              break;
          default:
              valA = a.client_name.toLowerCase();
              valB = b.client_name.toLowerCase();
      }
      
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [bookings, searchTerm, statusFilter, sortField, sortDirection]);
  
  const reportingMetrics = useMemo(() => {
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
    
    let totalRevenue = 0;
    let totalDeposits = 0;
    const performerBookings: Record<string, number> = {};
    const serviceCategoryCounts: Record<Service['category'], number> = {
      'Waitressing': 0,
      'Strip Show': 0,
      'Promotional & Hosting': 0,
    };
    
    performers.forEach(p => performerBookings[p.name] = 0);

    confirmedBookings.forEach(booking => {
      const { totalCost, depositAmount } = calculateBookingCost(booking.duration_hours, booking.services_requested || [], 1);
      totalRevenue += totalCost;
      totalDeposits += depositAmount;
      
      if (booking.performer?.name && performerBookings.hasOwnProperty(booking.performer.name)) {
        performerBookings[booking.performer.name]++;
      }
      
      (booking.services_requested || []).forEach(serviceId => {
        const service = allServices.find(s => s.id === serviceId);
        if (service) {
           serviceCategoryCounts[service.category]++;
        }
      });
    });

    const sortedPerformers = Object.entries(performerBookings)
      .sort(([, a], [, b]) => b - a);

    const sortedCategories = Object.entries(serviceCategoryCounts)
      .sort(([, a], [, b]) => b - a);

    return {
      totalRevenue,
      totalDeposits,
      confirmedCount: confirmedBookings.length,
      performerBookings: sortedPerformers,
      serviceCategoryCounts: sortedCategories,
    };

  }, [bookings, performers]);


  const pendingDnsEntries = doNotServeList.filter(entry => entry.status === 'pending');
  const adminComms = communications.filter(c => c.recipient === 'admin');
  
  const totalBookings = bookings.length;
  const confirmedBookingsCount = bookings.filter(b => b.status === 'confirmed').length;
  const pendingBookings = totalBookings - confirmedBookingsCount - bookings.filter(b => b.status === 'rejected').length;


  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-xl text-zinc-400 mt-1">Manage bookings and monitor performers.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(import.meta.env.DEV || isDemoMode) && (
            <button 
              onClick={() => {
                if (confirm('DEV ONLY: Overwrite data with mock data?')) {
                  resetDemoData();
                }
              }}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors duration-300 flex items-center justify-center gap-2 border border-zinc-700"
            >
              <Database className="h-5 w-5 text-orange-500" />
              Seed Database (DEV ONLY)
            </button>
          )}
          <button 
            onClick={onViewDoNotServe}
            className="bg-red-600/90 hover:bg-red-600 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors duration-300 flex items-center justify-center gap-2 shadow-lg shadow-red-500/10 hover:shadow-red-500/20"
          >
            <ShieldAlert className="h-5 w-5" />
            Manage 'Do Not Serve' List
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-base !p-6 flex items-center gap-4"><BarChart className="w-10 h-10 text-orange-500" /><div><p className="text-zinc-400 text-sm">Total Bookings</p><p className="text-3xl font-bold text-white">{totalBookings}</p></div></div>
        <div className="card-base !p-6 flex items-center gap-4"><ShieldCheck className="w-10 h-10 text-green-500" /><div><p className="text-zinc-400 text-sm">Confirmed</p><p className="text-3xl font-bold text-white">{confirmedBookingsCount}</p></div></div>
        <div className="card-base !p-6 flex items-center gap-4"><ShieldAlert className="w-10 h-10 text-yellow-500" /><div><p className="text-zinc-400 text-sm">Pending Actions</p><p className="text-3xl font-bold text-white">{pendingDnsEntries.length + pendingBookings}</p></div></div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-zinc-800 overflow-x-auto scrollbar-hide">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 min-w-max px-2" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('management')}
            className={`${activeTab === 'management' ? 'border-orange-500 text-orange-400' : 'border-transparent text-zinc-400 hover:text-white hover:border-zinc-500'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2`}
          >
            <CreditCard size={16}/> Management
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`${activeTab === 'payments' ? 'border-orange-500 text-orange-400' : 'border-transparent text-zinc-400 hover:text-white hover:border-zinc-500'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2`}
          >
            <DollarSign size={16}/> Payments
          </button>
          <button
            onClick={() => setActiveTab('performers')}
            className={`${activeTab === 'performers' ? 'border-orange-500 text-orange-400' : 'border-transparent text-zinc-400 hover:text-white hover:border-zinc-500'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2`}
          >
            <UserCog size={16}/> Performers
          </button>
          <button
            onClick={() => setActiveTab('dns')}
            className={`${activeTab === 'dns' ? 'border-orange-500 text-orange-400' : 'border-transparent text-zinc-400 hover:text-white hover:border-zinc-500'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2`}
          >
            <ShieldAlert size={16}/> DNS
            {pendingDnsEntries.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1">
                {pendingDnsEntries.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('reporting')}
            className={`${activeTab === 'reporting' ? 'border-orange-500 text-orange-400' : 'border-transparent text-zinc-400 hover:text-white hover:border-zinc-500'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2`}
          >
            <LineChart size={16}/> Reporting
          </button>
        </nav>
      </div>
      
      {/* Global Filters (Active for Management & Payments) */}
      {(activeTab === 'management' || activeTab === 'payments') && (
        <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-4 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800 animate-fade-in">
          <div className="flex flex-wrap items-center gap-3">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                <input
                    type="text"
                    placeholder="Search client or event type..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input-base !py-2 !pl-9 !pr-4 !text-sm !w-full sm:!w-64"
                />
             </div>
             
             <div className="relative flex items-center">
                <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as any)}
                    className="input-base !py-2 !pl-9 !pr-8 !text-sm !w-auto"
                >
                    <option value="event_date">Sort by Date</option>
                    <option value="client_name">Sort by Client</option>
                    {activeTab === 'management' && <option value="performer_name">Sort by Performer</option>}
                    <option value="payment_status">Sort by Payment Status</option>
                    <option value="status">Sort by Lifecycle Status</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                
                <button 
                    onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                    className="ml-2 p-2 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                    title={sortDirection === 'asc' ? "Ascending" : "Descending"}
                >
                    {sortDirection === 'asc' ? <ArrowUp size={16}/> : <ArrowDown size={16}/>}
                </button>
             </div>

             <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as BookingStatus | '')}
                    className="input-base !py-2 !pl-9 !pr-8 !text-sm !w-auto"
                >
                    <option value="">All Statuses</option>
                    {bookingStatusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
             </div>
          </div>
          <button onClick={() => alert('CSV export functionality would be implemented here.')} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-md transition-colors duration-300 flex items-center gap-2 text-sm justify-center">
              <Download size={16}/> Export CSV
          </button>
        </div>
      )}

      {activeTab === 'performers' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-white">Manage Performers</h2>
            <button 
              onClick={() => {
                setPerformerForm({
                  name: '',
                  tagline: '',
                  bio: '',
                  photo_url: 'https://picsum.photos/seed/performer/400/600',
                  status: 'available',
                  rating: 5.0,
                  review_count: 0,
                  service_ids: [],
                  service_areas: [],
                  created_at: new Date().toISOString(),
                });
                setIsAddingPerformer(true);
              }}
              className="btn-primary flex items-center gap-2 !py-2 !px-4"
            >
              <Plus size={18} /> Add New Performer
            </button>
          </div>

          {(isAddingPerformer || editingPerformer) && (
            <div className="card-base !p-6 border-orange-500/30 bg-orange-500/5">
              <h3 className="text-xl font-bold text-white mb-4">
                {isAddingPerformer ? 'Add New Performer' : `Edit ${editingPerformer?.name}`}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm text-zinc-400">Name</label>
                  <input 
                    type="text" 
                    value={performerForm.name} 
                    onChange={e => setPerformerForm({...performerForm, name: e.target.value})}
                    className="input-base w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-zinc-400">Tagline</label>
                  <input 
                    type="text" 
                    value={performerForm.tagline} 
                    onChange={e => setPerformerForm({...performerForm, tagline: e.target.value})}
                    className="input-base w-full"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm text-zinc-400">Bio</label>
                  <textarea 
                    value={performerForm.bio} 
                    onChange={e => setPerformerForm({...performerForm, bio: e.target.value})}
                    className="input-base w-full h-24"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-zinc-400">Photo URL</label>
                  <input 
                    type="text" 
                    value={performerForm.photo_url} 
                    onChange={e => setPerformerForm({...performerForm, photo_url: e.target.value})}
                    className="input-base w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-zinc-400">Status</label>
                  <select 
                    value={performerForm.status} 
                    onChange={e => setPerformerForm({...performerForm, status: e.target.value as any})}
                    className="input-base w-full"
                  >
                    <option value="available">Available</option>
                    <option value="busy">Busy</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-zinc-400">Min Booking Duration (Hours)</label>
                  <input 
                    type="number" 
                    min="1"
                    step="0.5"
                    value={performerForm.min_booking_duration_hours || ''} 
                    onChange={e => setPerformerForm({...performerForm, min_booking_duration_hours: e.target.value ? Number(e.target.value) : undefined})}
                    className="input-base w-full"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  onClick={() => {
                    setIsAddingPerformer(false);
                    setEditingPerformer(null);
                  }}
                  className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    if (isAddingPerformer) {
                      await onCreatePerformer(performerForm);
                    } else if (editingPerformer) {
                      await onUpdatePerformer(editingPerformer.id, performerForm);
                    }
                    setIsAddingPerformer(false);
                    setEditingPerformer(null);
                  }}
                  className="btn-primary !py-2 !px-6"
                >
                  Save Performer
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {performers.filter(p => p.status === 'pending_verification').length > 0 && (
              <div className="col-span-full mb-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <ShieldAlert className="text-yellow-500" />
                  Pending Verification
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {performers.filter(p => p.status === 'pending_verification').map(p => (
                    <div key={p.id} className="card-base !p-4 flex flex-col gap-4 border-yellow-500/30 bg-yellow-500/5">
                      <div className="flex gap-4">
                        <img src={p.photo_url} alt={p.name} loading="lazy" className="w-20 h-20 rounded-lg object-cover border border-zinc-800" />
                        <div className="flex-grow">
                          <h4 className="font-bold text-white">{p.name}</h4>
                          <p className="text-xs text-zinc-400 line-clamp-2 mt-1">{p.bio}</p>
                          <div className="mt-2 text-xs text-zinc-500">
                            <p><strong>Areas:</strong> {p.service_areas.join(', ')}</p>
                            <p><strong>Services:</strong> {p.service_ids.join(', ')}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button 
                          onClick={() => onUpdatePerformer(p.id, { status: 'available' })}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 rounded transition-colors flex items-center justify-center gap-1"
                        >
                          <Check size={14} /> Approve
                        </button>
                        <button 
                          onClick={() => onUpdatePerformer(p.id, { status: 'rejected' })}
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded transition-colors flex items-center justify-center gap-1"
                        >
                          <X size={14} /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="col-span-full">
              <h3 className="text-xl font-bold text-white mb-4">Active Performers</h3>
            </div>
            {performers.filter(p => p.status !== 'pending_verification' && p.status !== 'rejected').map(p => (
              <div key={p.id} className="card-base !p-4 flex gap-4">
                <img src={p.photo_url} alt={p.name} loading="lazy" className="w-20 h-20 rounded-lg object-cover border border-zinc-800" />
                <div className="flex-grow">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-white">{p.name}</h4>
                      <div className="flex items-center gap-1 text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded border border-white/5">
                        <Star className="w-2.5 h-2.5 text-orange-400 fill-orange-400" />
                        <span className="text-white font-bold">{(p.rating || 0).toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => {
                          setEditingPerformer(p);
                          setPerformerForm({
                            name: p.name,
                            tagline: p.tagline,
                            bio: p.bio,
                            photo_url: p.photo_url,
                            status: p.status,
                            rating: p.rating,
                            review_count: p.review_count,
                            service_ids: p.service_ids,
                            service_areas: p.service_areas,
                            created_at: p.created_at,
                          });
                        }}
                        className="p-1 text-zinc-400 hover:text-orange-500 transition-colors"
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        onClick={() => {
                          if (confirm(`Are you sure you want to deactivate ${p.name}?`)) {
                            onUpdatePerformer(p.id, { status: 'offline' });
                          }
                        }}
                        className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-2 mt-1">{p.bio}</p>
                  <div className="flex justify-between items-center mt-3">
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${p.status === 'available' ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-500'}`}>
                      {p.status}
                    </span>
                    <span className="text-sm font-bold text-white">{p.tagline}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'dns' && (
        <div className="space-y-8 animate-fade-in">
          {pendingDnsEntries.length > 0 && (
            <div className="card-base !p-6 !border-yellow-500/50 !bg-yellow-900/10">
              <h2 className="text-2xl font-semibold text-white mb-4">Pending DNS Submissions</h2>
              <div className="space-y-4">
                {pendingDnsEntries.map(entry => (
                  <div key={entry.id} className="bg-zinc-950/50 p-5 rounded-xl border border-zinc-800 flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <p className="font-bold text-xl text-white">{entry.client_name}</p>
                        <span className="bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Pending Review</span>
                      </div>
                      <p className="text-sm text-zinc-400">
                        Submitted by: <span className="font-semibold text-orange-400">{entry.performer?.name || 'N/A'}</span>
                        <span className="mx-2 text-zinc-600">|</span>
                        {new Date(entry.created_at).toLocaleDateString()}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 mt-2">
                        {entry.client_email && <span className="flex items-center gap-1"><Mail size={12}/> {entry.client_email}</span>}
                        {entry.client_phone && <span className="flex items-center gap-1"><Phone size={12}/> {entry.client_phone}</span>}
                      </div>
                      <p className="text-sm text-zinc-300 mt-3 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50 italic">
                        "{entry.reason}"
                      </p>
                    </div>
                    <div className="flex flex-row md:flex-col gap-2 flex-shrink-0">
                      <button 
                        onClick={() => handleAction('dns-approve', entry.id, () => onUpdateDoNotServeStatus(entry.id, 'approved'))} 
                        disabled={loadingState?.id === entry.id} 
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                      >
                        {loadingState?.type === 'dns-approve' && loadingState.id === entry.id ? <LoaderCircle size={16} className="animate-spin" /> : <><Check size={16}/> Approve Entry</>}
                      </button>
                      <button 
                        onClick={() => handleAction('dns-reject', entry.id, () => onUpdateDoNotServeStatus(entry.id, 'rejected'))} 
                        disabled={loadingState?.id === entry.id} 
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold py-2 px-4 rounded-lg flex items-center gap-2 text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                      >
                        {loadingState?.type === 'dns-reject' && loadingState.id === entry.id ? <LoaderCircle size={16} className="animate-spin" /> : <><X size={16}/> Reject Entry</>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card-base !p-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
              <h2 className="text-2xl font-semibold text-white">Active 'Do Not Serve' List</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search DNS entries..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-base !py-2 !pl-9 !pr-4 !text-sm !w-full sm:!w-64"
                />
              </div>
            </div>
            <div className="space-y-4">
              {doNotServeList.filter(e => e.status === 'approved' && (
                e.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (e.client_email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (e.client_phone || '').toLowerCase().includes(searchTerm.toLowerCase())
              )).length > 0 ? (
                doNotServeList.filter(e => e.status === 'approved' && (
                  e.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (e.client_email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (e.client_phone || '').toLowerCase().includes(searchTerm.toLowerCase())
                )).map(entry => (
                  <div key={entry.id} className="bg-zinc-900/40 p-4 rounded-lg border border-zinc-800 flex justify-between items-start">
                    <div>
                      <p className="font-bold text-lg text-white">{entry.client_name}</p>
                      <div className="flex flex-wrap gap-x-4 text-xs text-zinc-500 mt-1">
                        {entry.client_email && <span>{entry.client_email}</span>}
                        {entry.client_phone && <span>{entry.client_phone}</span>}
                      </div>
                      <p className="text-sm text-zinc-400 mt-2 italic">"{entry.reason}"</p>
                      <p className="text-[10px] text-zinc-600 mt-2 uppercase tracking-widest font-bold">Approved on {new Date(entry.created_at).toLocaleDateString()}</p>
                    </div>
                    <button 
                      onClick={() => {
                        if (confirm(`Are you sure you want to remove ${entry.client_name} from the DNS list?`)) {
                          onUpdateDoNotServeStatus(entry.id, 'rejected');
                        }
                      }}
                      className="text-zinc-500 hover:text-red-500 p-2 transition-colors"
                      title="Remove from DNS"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-zinc-500 text-center py-10">No active DNS entries found.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reporting' && (
        <div className="card-base !p-6 animate-fade-in">
           <h2 className="text-2xl font-semibold text-white mb-6">Reporting & Analytics</h2>
           {reportingMetrics.confirmedCount > 0 ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="card-base !p-6 flex items-center gap-4 !bg-zinc-950/50"><DollarSign className="w-10 h-10 text-green-500" /><div><p className="text-zinc-400 text-sm">Total Revenue</p><p className="text-3xl font-bold text-white">${(reportingMetrics.totalRevenue || 0).toFixed(2)}</p></div></div>
                  <div className="card-base !p-6 flex items-center gap-4 !bg-zinc-950/50"><CreditCard className="w-10 h-10 text-orange-500" /><div><p className="text-zinc-400 text-sm">Total Deposits Paid</p><p className="text-3xl font-bold text-white">${(reportingMetrics.totalDeposits || 0).toFixed(2)}</p></div></div>
                  <div className="card-base !p-6 flex items-center gap-4 !bg-zinc-950/50"><CheckCircle className="w-10 h-10 text-blue-500" /><div><p className="text-zinc-400 text-sm">Confirmed Bookings</p><p className="text-3xl font-bold text-white">{reportingMetrics.confirmedCount}</p></div></div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="card-base !p-6 !bg-zinc-950/50">
                  <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2"><UsersIcon/> Performer Utilization</h3>
                  <div className="space-y-3">
                    {reportingMetrics.performerBookings.map(([name, count]) => (
                      <div key={name}>
                        <div className="flex justify-between items-center text-sm mb-1">
                          <span className="font-medium text-zinc-200">{name}</span>
                          <span className="text-zinc-400">{count} booking{count !== 1 ? 's' : ''}</span>
                        </div>
                         <div className="w-full bg-zinc-700/50 rounded-full h-2.5">
                            <div className="bg-orange-500 h-2.5 rounded-full" style={{ width: `${(count / (reportingMetrics.performerBookings[0][1] || 1)) * 100}%` }}></div>
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card-base !p-6 !bg-zinc-950/50">
                  <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2"><TrendingUp/> Popular Service Categories</h3>
                   <div className="space-y-3">
                    {reportingMetrics.serviceCategoryCounts.map(([category, count]) => (
                      <div key={category}>
                        <div className="flex justify-between items-center text-sm mb-1">
                          <span className="font-medium text-zinc-200">{category}</span>
                          <span className="text-zinc-400">{count} time{count !== 1 ? 's' : ''} booked</span>
                        </div>
                         <div className="w-full bg-zinc-700/50 rounded-full h-2.5">
                            <div className="bg-purple-500 h-2.5 rounded-full" style={{ width: `${(count / (reportingMetrics.serviceCategoryCounts[0][1] || 1)) * 100}%` }}></div>
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
           ) : (
             <p className="text-zinc-500 text-center py-10">No confirmed bookings yet to generate a report.</p>
           )}
        </div>
      )}


      {activeTab === 'management' && (
      <div className="card-base !p-6">
        <h2 className="text-2xl font-semibold text-white mb-6">All Booking Applications</h2>
        <div className="space-y-4">
          {filteredBookings.length > 0 ? filteredBookings.map(booking => {
            const isLoading = loadingState?.id === booking.id;
            return (
            <div key={booking.id} className={`p-4 rounded-lg border ${statusClasses[booking.status]}`}>
              <div className="flex flex-col md:flex-row justify-between md:items-start">
                <div className="flex-grow">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                      <p className="font-bold text-lg text-white">{booking.event_type}</p>
                      <span className="hidden sm:inline text-zinc-500">&bull;</span>
                      <p className="text-zinc-200">{booking.client_name}</p>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-300 mb-2">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-orange-400"/> 
                        <span>{new Date(booking.event_date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} className="text-orange-400"/> 
                        <span>{booking.event_time}</span>
                      </div>
                  </div>

                  <div className="text-sm text-zinc-400 flex flex-wrap gap-x-4 mb-2">
                    <span>Assigned to: <span className="font-semibold text-orange-400">{booking.performer?.name || 'N/A'}</span></span>
                    <span className="flex items-center gap-1.5"><UsersIcon size={14}/> Guests: <span className="font-semibold text-white">{booking.number_of_guests}</span></span>
                    {booking.performer_eta_minutes && booking.performer_eta_minutes > 0 && (
                        <span className="flex items-center gap-1.5"><Clock size={14}/> ETA: <span className="font-semibold text-white">{booking.performer_eta_minutes} mins</span></span>
                    )}
                  </div>
                  {booking.client_message && (
                    <p className="text-sm text-zinc-300 mt-1 italic">Note: "{booking.client_message}"</p>
                  )}
                  <p className={`font-semibold capitalize text-sm mt-1`}>{booking.status.replace(/_/g, ' ')}</p>
                </div>
                <div className="text-sm text-zinc-400 mt-4 md:mt-0 md:text-right flex-shrink-0">
                    <p className="text-white font-medium">Contact Info</p>
                    <p>{booking.client_email}</p>
                    <p>{booking.client_phone}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-600/50 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-2 items-center">
                    {booking.status === 'pending_vetting' && (
                        <button onClick={() => handleAction('approve-vetting', booking.id, () => onUpdateBookingStatus(booking.id, 'deposit_pending'))} disabled={isLoading} className="text-xs bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 px-3 rounded flex items-center justify-center gap-1.5 w-32">
                           {isLoading && loadingState?.type === 'approve-vetting' ? <LoaderCircle size={14} className="animate-spin"/> : <><Check size={14}/> Approve Vetting</>}
                        </button>
                    )}
                    {booking.status === 'pending_deposit_confirmation' && (
                        <button onClick={() => handleAction('confirm-deposit', booking.id, () => onUpdateBookingStatus(booking.id, 'confirmed'))} disabled={isLoading} className="text-xs bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 px-3 rounded flex items-center justify-center gap-1.5 w-32">
                          {isLoading && loadingState?.type === 'confirm-deposit' ? <LoaderCircle size={14} className="animate-spin"/> : <><Check size={14}/> Confirm Deposit</>}
                        </button>
                    )}
                     {(booking.status === 'pending_vetting' || booking.status === 'deposit_pending' || booking.status === 'pending_performer_acceptance') && (
                        <button onClick={() => handleAction('reject', booking.id, () => onUpdateBookingStatus(booking.id, 'rejected'))} disabled={isLoading} className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-3 rounded flex items-center justify-center gap-1.5 w-20">
                           {isLoading && loadingState?.type === 'reject' ? <LoaderCircle size={14} className="animate-spin"/> : <><X size={14}/> Reject</>}
                        </button>
                     )}
                     {booking.status !== 'confirmed' && (
                        <div className="flex items-center gap-2 pl-2 border-l border-zinc-600">
                           <p className="text-xs font-semibold text-zinc-300">Admin Override:</p>
                           {booking.status !== 'pending_vetting' && booking.status !== 'deposit_pending' && booking.status !== 'pending_deposit_confirmation' && (
                             <button onClick={() => handleAction('override-accept', booking.id, () => onAdminDecisionForPerformer(booking.id, 'accepted'))} disabled={isLoading} className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold py-1.5 px-3 rounded flex items-center justify-center gap-1.5 w-36">
                               {isLoading && loadingState?.type === 'override-accept' ? <LoaderCircle size={14} className="animate-spin"/> : <><Check size={14}/> Accept for Performer</>}
                             </button>
                           )}
                           {booking.status !== 'rejected' && (
                             <button onClick={() => handleAction('override-decline', booking.id, () => onAdminDecisionForPerformer(booking.id, 'declined'))} disabled={isLoading} className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold py-1.5 px-3 rounded flex items-center justify-center gap-1.5 w-36">
                               {isLoading && loadingState?.type === 'override-decline' ? <LoaderCircle size={14} className="animate-spin"/> : <><X size={14}/> Decline for Performer</>}
                             </button>
                           )}
                        </div>
                     )}
                     <button onClick={() => handleOpenChat(booking)} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-1.5 px-3 rounded flex items-center justify-center gap-1.5">
                        <MessageSquare size={14}/> Chat
                     </button>
                </div>
                 <div className="flex flex-wrap gap-2 items-center">
                       <div className="relative group">
                          <RefreshCcw className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                          <select 
                            value={booking.performer_id}
                            onChange={(e) => onAdminChangePerformer(booking.id, Number(e.target.value))}
                            className="input-base !py-1.5 !pl-9 !pr-8 !text-xs !w-auto appearance-none bg-zinc-700 hover:bg-zinc-600"
                            title="Reassign Performer"
                           >
                            <option value={booking.performer_id} disabled>Reassign</option>
                            {performers.filter(p => p.id !== booking.performer_id).map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                       </div>
                    {booking.status === 'confirmed' && booking.verified_at && (
                        <div className="text-xs text-green-300/80">
                            Verified by <strong>{booking.verified_by_admin_name}</strong> on {new Date(booking.verified_at).toLocaleDateString()}
                        </div>
                    )}
                 </div>
              </div>
            </div>
          )}) : <p className="text-zinc-400 text-center py-4">No bookings match the current filter.</p>}
        </div>
      </div>
      )}

      {activeTab === 'payments' && (
        <div className="card-base !p-0">
            <h2 className="text-2xl font-semibold text-white mb-4 p-6">Payment Tracking</h2>
             <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-zinc-400">
                    <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50">
                        <tr>
                            <th scope="col" className="px-3 py-3 sm:px-6">Client</th>
                            <th scope="col" className="px-3 py-3 sm:px-6">Performer</th>
                            <th scope="col" className="px-3 py-3 sm:px-6">Total Cost</th>
                            <th scope="col" className="px-3 py-3 sm:px-6">Deposit Due</th>
                            <th scope="col" className="px-3 py-3 sm:px-6">Payment Status</th>
                            <th scope="col" className="px-3 py-3 sm:px-6">Action / Verified By</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paymentRelatedBookings.length > 0 ? paymentRelatedBookings.map(booking => {
                            const { totalCost, depositAmount } = calculateBookingCost(booking.duration_hours, booking.services_requested || [], 1);
                            const isLoading = loadingState?.id === booking.id;
                            
                            let paymentStatusText = booking.payment_status ? booking.payment_status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : 'Unknown';
                            if (!booking.payment_status) {
                                if (booking.status === 'deposit_pending') paymentStatusText = 'Awaiting Payment';
                                if (booking.status === 'pending_deposit_confirmation') paymentStatusText = 'Verification Needed';
                                if (booking.status === 'confirmed') paymentStatusText = 'Verified';
                                if (booking.status === 'rejected') paymentStatusText = 'Payment Rejected/Cancelled';
                            }

                            return (
                                <tr key={booking.id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                                    <td className="px-3 py-4 sm:px-6 font-medium text-white whitespace-nowrap">
                                      {booking.client_name}
                                      <div className="text-[10px] text-zinc-500 mt-1">{new Date(booking.event_date).toLocaleDateString()}</div>
                                    </td>
                                    <td className="px-3 py-4 sm:px-6">{booking.performer?.name}</td>
                                    <td className="px-3 py-4 sm:px-6">${(totalCost || 0).toFixed(2)}</td>
                                    <td className="px-3 py-4 sm:px-6 font-bold text-orange-400">${(depositAmount || 0).toFixed(2)}</td>
                                    <td className={`px-3 py-4 sm:px-6 font-semibold ${statusClasses[booking.status]}`}>{paymentStatusText}</td>
                                    <td className="px-3 py-4 sm:px-6">
                                        <div className="flex flex-col gap-2">
                                          {booking.status === 'pending_deposit_confirmation' && (
                                              <>
                                                <button onClick={() => {
                                                    if (booking.deposit_receipt_path?.startsWith('simulated/')) {
                                                        alert(`This is a simulated receipt for a successful payment.\n\nFile: ${booking.deposit_receipt_path}\nBooking ID: ${booking.id}`);
                                                    } else if (booking.deposit_receipt_path) {
                                                        alert(`This would open the uploaded file: ${booking.deposit_receipt_path}`);
                                                    } else {
                                                        alert('No receipt was uploaded for this booking.');
                                                    }
                                                }} className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded flex items-center justify-center gap-1">
                                                    <FileText size={12}/> View Receipt
                                                </button>
                                                <button onClick={() => handleAction('confirm-deposit', booking.id, () => onUpdateBookingStatus(booking.id, 'confirmed'))} disabled={isLoading} className="text-[10px] bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded flex items-center justify-center gap-1">
                                                   {isLoading && loadingState?.type === 'confirm-deposit' ? <LoaderCircle size={12} className="animate-spin"/> : <><Check size={12}/> Confirm Payment</>}
                                                </button>
                                              </>
                                          )}
                                          {booking.status === 'confirmed' && booking.verified_at && (
                                              <div className="text-xs text-green-300/80">
                                                  <p><strong>{booking.verified_by_admin_name}</strong></p>
                                                  <p className="text-zinc-500">{new Date(booking.verified_at).toLocaleString()}</p>
                                              </div>
                                          )}
                                          {booking.status === 'rejected' && (
                                            <span className="text-xs text-red-500">Rejected</span>
                                          )}
                                          <button onClick={() => handleOpenChat(booking)} className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-1 px-3 rounded flex items-center justify-center gap-1 mt-1">
                                              <MessageSquare size={12}/> Chat
                                          </button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        }) : (
                             <tr>
                                <td colSpan={6} className="text-center py-8 text-zinc-500">No bookings match the current filter in payment tracking.</td>
                             </tr>
                        )}
                    </tbody>
                </table>
             </div>
        </div>
      )}
      
       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="card-base !p-6">
             <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-3"><UserCog />Performer Status</h2>
             <ul className="space-y-2 max-h-60 overflow-y-auto">
                {performers.map(p => (
                    <li key={p.id} className="flex justify-between items-center bg-zinc-900/70 p-3 rounded-md border border-zinc-700/50">
                        <span className="text-white font-medium">{p.name}</span>
                        <span className={`capitalize px-2 py-1 text-xs font-semibold rounded-full ${p.status === 'available' ? 'bg-green-500/20 text-green-300' : p.status === 'busy' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-zinc-500/20 text-zinc-300'}`}>{p.status}</span>
                    </li>
                ))}
             </ul>
          </div>
            <div className="card-base !p-6">
                <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-3"><MessageSquare /> Communications</h2>
                 {adminComms.length > 0 ? (
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2 -mr-2">
                      {adminComms.map(comm => (
                        <div key={comm.id} className="bg-zinc-900/70 p-3 rounded-md text-sm border border-zinc-700/50">
                            <p className="text-zinc-200">{comm.message}</p>
                            <p className="text-xs text-zinc-500 mt-1">From: <span className="text-orange-400 font-semibold">{comm.sender}</span> &bull; {new Date(comm.created_at).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                 ) : (
                    <div className="text-center py-8 text-zinc-500">
                      <Inbox className="h-12 w-12 mx-auto mb-2 text-zinc-600" />
                      <p>No new system messages.</p>
                    </div>
                 )}
            </div>
        </div>
      
      {activeChatBooking && (
          <ChatDialog
              isOpen={!!activeChatBooking}
              onClose={() => setActiveChatBooking(null)}
              booking={activeChatBooking}
              currentUser={{ name: 'Admin' }}
              messages={chatMessages}
              onSendMessage={handleSendMessage}
          />
      )}
    </div>
  );
};

export default AdminDashboard;