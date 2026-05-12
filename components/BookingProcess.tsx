import React, { useState, useMemo, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../services/firebaseClient';
import type { Performer, Booking, BookingStatus, DoNotServeEntry, Communication, Service } from '../types';
import { allServices } from '../data/mockData';
import { getBookingDurationInfo, calculateBookingCost } from '../utils/bookingUtils';
import InputField from './InputField';
import BookingCostCalculator from './BookingCostCalculator';
import BookingConfirmationDialog from './BookingConfirmationDialog';
import PayIDSimulationModal from './PayIDSimulationModal';
import { ArrowLeft, User, Mail, Phone, Calendar, Clock, MapPin, PartyPopper, Send, ListChecks, Info, AlertTriangle, ShieldX, CheckCircle, ChevronDown, LoaderCircle, Users as UsersIcon, Shield, Wallet, Briefcase, LogIn, Search, Zap } from 'lucide-react';
import { ASAP_LEAD_TIME_MINUTES, ASAP_SURCHARGE_PERCENT, ASAP_OPERATING_HOURS, isAsapAvailableNow } from '../constants';
import { api } from '../services/api';
import VerificationStep from '../src/components/verification/VerificationStep';
import { perthSuburbs } from '../data/suburbs';

export interface BookingFormState {
    fullName: string;
    email: string;
    mobile: string;
    dob: string;
    eventDate: string;
    eventTime: string;
    eventAddress: string;
    eventSuburb: string;
    eventType: string;
    duration: string;
    numberOfGuests: string;
    selectedServices: string[];
    client_message: string;
    isAsap?: boolean;
    idDocument?: File | null;
    selfieDocument?: File | null;
}

interface BookingProcessProps {
    performers: Performer[];
    onBack: () => void;
    onBookingSubmitted: () => void;
    bookings: Booking[];
    onUpdateBookingStatus?: (bookingId: string, status: BookingStatus) => Promise<void>;
    onBookingRequest: (formState: BookingFormState, performers: Performer[]) => Promise<{ success: boolean; message: string; bookingIds?: string[] }>;
    doNotServeList: DoNotServeEntry[];
    addCommunication: (commData: Omit<Communication, 'id' | 'created_at' | 'read'>) => Promise<void>;
    onShowPrivacyPolicy: () => void;
    onShowTermsOfService: () => void;
    initialSelectedServices?: string[];
}

type BookingStage = 'form' | 'verification_pending' | 'performer_acceptance_pending' | 'vetting_pending' | 'deposit_pending' | 'deposit_confirmation_pending' | 'confirmed' | 'rejected';

function normaliseToE164(phone: string): string {
    const cleaned = (phone || '').replace(/[\s\-()\.]/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('00')) return '+' + cleaned.substring(2);
    if (cleaned.startsWith('0')) return '+61' + cleaned.substring(1);
    return cleaned ? '+61' + cleaned : '';
}


const eventTypes = ['Bucks Party', 'Birthday Party', 'Corporate Event', 'Hens Party', 'Private Gathering', 'Other'];

const FORM_DRAFT_KEY = 'tpb_booking_draft';
// Legacy key kept for one read-and-migrate cycle so users with an in-flight
// draft (pre-rebrand) don't lose their work. Can be deleted after a few
// release cycles.
const LEGACY_FORM_DRAFT_KEY = 'flavor_booking_draft';

export function friendlyErrorMessage(raw: string): { title: string; message: string; isAuthError: boolean } {
    const lower = raw.toLowerCase();
    if (lower.includes('popup-closed') || lower.includes('auth/') || lower.includes('unauthenticated') || lower.includes('not authenticated') || lower.includes('authentication required')) {
        return { title: 'Session Expired', message: 'Your login session has expired. Please log in again — your form data has been saved.', isAuthError: true };
    }
    if (lower.includes('internal') || lower.includes('unknown error')) {
        return { title: 'Something Went Wrong', message: 'We hit a temporary issue processing your booking. Please try again in a moment.', isAuthError: false };
    }
    if (lower.includes('permission') || lower.includes('denied')) {
        return { title: 'Access Denied', message: 'You don\'t have permission to perform this action. Please log in with the correct account.', isAuthError: true };
    }
    if (lower.includes('already-exists') || lower.includes('time slot')) {
        return { title: 'Time Slot Taken', message: raw, isAuthError: false };
    }
    return { title: 'Booking Error', message: raw, isAuthError: false };
}

const ErrorDisplay = ({ message, onLogin }: { message: string | null; onLogin?: () => void }) => {
    if (!message) return null;
    const { title, message: friendly, isAuthError } = friendlyErrorMessage(message);
    return (
        <div className="p-4 mb-6 text-sm text-red-200 bg-red-900/50 rounded-lg border border-red-500 flex items-start gap-3 animate-fade-in" role="alert">
            <AlertTriangle className="h-5 w-5 mt-0.5 text-red-400 flex-shrink-0" />
            <div className="flex-1">
                <span className="font-bold">{title}:</span> {friendly}
                {isAuthError && onLogin && (
                    <button onClick={onLogin} className="mt-2 flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                        <LogIn size={14} /> Log In Again
                    </button>
                )}
            </div>
        </div>
    );
};

interface StatusScreenProps {
    icon: React.ElementType;
    title: string;
    children: React.ReactNode;
    bgColor: string;
    buttonText: string;
    onButtonClick: () => void;
}

const StatusScreen: React.FC<StatusScreenProps> = ({ icon: Icon, title, children, bgColor, buttonText, onButtonClick }) => (
    <div className={`flex flex-col items-center justify-center min-h-[60vh] text-center p-4 animate-fade-in ${bgColor}`}>
        <div className="bg-black/40 backdrop-blur-md p-8 sm:p-12 rounded-2xl border border-white/10 shadow-2xl max-w-2xl w-full">
            <Icon className={`mx-auto h-20 w-20 mb-6 ${Icon === LoaderCircle ? 'animate-spin text-orange-500' : 'text-orange-400'}`} />
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{title}</h2>
            <div className="text-zinc-300 mt-2 mb-8 max-w-lg mx-auto leading-relaxed">
                {children}
            </div>
            <button onClick={onButtonClick} className="btn-primary px-8 py-3 text-lg">
                {buttonText}
            </button>
        </div>
    </div>
);


const wizardSteps = [
    { id: 1, name: 'Booking Details', icon: Calendar },
    { id: 2, name: 'Services & Confirm', icon: ListChecks },
];

const TOTAL_STEPS = wizardSteps.length;

const ProgressIndicator: React.FC<{ currentStep: number }> = ({ currentStep }) => (
    <nav aria-label="Progress" className="mb-10">
        <ol role="list" className="flex items-center justify-between gap-2 sm:gap-4">
            {wizardSteps.map((step, index) => {
                const isCompleted = currentStep > step.id;
                const isCurrent = currentStep === step.id;
                const Icon = step.icon;
                const isLast = index === wizardSteps.length - 1;

                return (
                    <li key={step.name} className="flex-1 flex items-center min-w-0">
                        <div className="flex flex-col items-center gap-2 min-w-0">
                            <div
                                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                                    isCompleted
                                        ? 'bg-orange-500 border-orange-500 text-white shadow-[0_0_18px_rgba(255,0,128,0.45)]'
                                        : isCurrent
                                            ? 'bg-orange-500/15 border-orange-500 text-orange-400 ring-4 ring-orange-500/20'
                                            : 'bg-zinc-900 border-zinc-700 text-zinc-500'
                                }`}
                                aria-current={isCurrent ? 'step' : undefined}
                            >
                                {isCompleted ? <CheckCircle size={20} /> : <Icon size={18} />}
                            </div>
                            <div className="text-center min-w-0">
                                <p className={`text-[10px] font-bold uppercase tracking-wider ${isCurrent || isCompleted ? 'text-orange-400' : 'text-zinc-500'}`}>
                                    Step {step.id}
                                </p>
                                <p className={`text-xs sm:text-sm font-medium truncate ${isCurrent ? 'text-white' : isCompleted ? 'text-zinc-300' : 'text-zinc-500'}`}>
                                    {step.name}
                                </p>
                            </div>
                        </div>
                        {!isLast && (
                            <div className={`flex-1 h-0.5 mx-2 sm:mx-4 -mt-8 transition-colors duration-300 ${isCompleted ? 'bg-orange-500' : 'bg-zinc-800'}`} />
                        )}
                    </li>
                );
            })}
        </ol>
    </nav>
);


const BookingProcess: React.FC<BookingProcessProps> = ({ performers, onBack, onBookingSubmitted, bookings, onUpdateBookingStatus, onBookingRequest, doNotServeList, addCommunication: _addCommunication, onShowPrivacyPolicy, onShowTermsOfService, initialSelectedServices = [] }) => {
    const [stage, setStage] = useState<BookingStage>('form');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [form, setForm] = useState<BookingFormState>(() => {
        try {
            // Try the new key first, fall back to legacy key and migrate.
            let saved = localStorage.getItem(FORM_DRAFT_KEY);
            if (!saved) {
                saved = localStorage.getItem(LEGACY_FORM_DRAFT_KEY);
                if (saved) {
                    try { localStorage.setItem(FORM_DRAFT_KEY, saved); } catch {}
                    try { localStorage.removeItem(LEGACY_FORM_DRAFT_KEY); } catch {}
                }
            }
            if (saved) {
                const parsed = JSON.parse(saved);
                return { ...parsed, selectedServices: parsed.selectedServices?.length ? parsed.selectedServices : initialSelectedServices, idDocument: null, selfieDocument: null };
            }
        } catch {}
        return { fullName: '', email: '', mobile: '', dob: '', eventDate: '', eventTime: '', eventAddress: '', eventSuburb: '', eventType: '', duration: '2', numberOfGuests: '', selectedServices: initialSelectedServices, client_message: '', isAsap: false };
    });
    const [bookingIds, setBookingIds] = useState<string[]>([]);
    const [bookingReference, setBookingReference] = useState<string>('');
    const [bookingPaymentStatus, setBookingPaymentStatus] = useState<string>('unpaid');
    const [bookingExpiresAt, setBookingExpiresAt] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [agreedTerms, setAgreedTerms] = useState(false);
    const [isVerifiedBooker, setIsVerifiedBooker] = useState(false);
    const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
    const [isPayIdModalOpen, setIsPayIdModalOpen] = useState(false);
    const [suburbSearch, setSuburbSearch] = useState('');
    const [isSuburbOpen, setIsSuburbOpen] = useState(false);

    // Persist form state as draft for recovery after session expiry
    useEffect(() => {
        const { idDocument, selfieDocument, ...saveable } = form;
        try { localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(saveable)); } catch {}
    }, [form]);

    const clearDraft = () => {
        try { localStorage.removeItem(FORM_DRAFT_KEY); } catch {}
    };

    useEffect(() => {
        const checkVerifiedBooker = () => {
            if (!form.email && !form.mobile) return setIsVerifiedBooker(false);
            const hasConfirmedBooking = bookings.some(b =>
                b.status === 'confirmed' && (
                    (form.email && b.client_email.toLowerCase() === form.email.toLowerCase()) ||
                    (form.mobile && b.client_phone.replace(/\s+/g, '') === form.mobile.replace(/\s+/g, ''))
                )
            );
            setIsVerifiedBooker(hasConfirmedBooking);
        };
        const debounceTimer = setTimeout(checkVerifiedBooker, 500);
        return () => clearTimeout(debounceTimer);
    }, [form.email, form.mobile, bookings]);

    // Automatically open PayID modal when transition to deposit_pending occurs
    useEffect(() => {
        if (stage === 'deposit_pending' && !isPayIdModalOpen) {
            setIsPayIdModalOpen(true);
        }
    }, [stage]);

    useEffect(() => {
        if (bookingIds.length === 0 || !db) return;

        const bookingDocRef = doc(db, 'bookings', bookingIds[0]);
        const unsubscribe = onSnapshot(bookingDocRef, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data() as Booking;
            const currentStatus = data.status;

            // Capture payment data for the PayID modal
            if (data.bookingReference) setBookingReference(data.bookingReference);
            if (data.payment_status) setBookingPaymentStatus(data.payment_status);
            if (data.expiresAt) {
                // Handle both Firestore Timestamp and ISO string
                const expiresAtValue = data.expiresAt;
                if (typeof expiresAtValue === 'object' && 'toDate' in (expiresAtValue as any)) {
                    setBookingExpiresAt((expiresAtValue as any).toDate().toISOString());
                } else {
                    setBookingExpiresAt(String(expiresAtValue));
                }
            }

            if (currentStatus === 'pending_performer_acceptance' && stage !== 'performer_acceptance_pending') {
                setStage('performer_acceptance_pending');
            } else if (currentStatus === 'pending_vetting' && stage !== 'vetting_pending') {
                setStage('vetting_pending');
            } else if (currentStatus === 'deposit_pending' && stage !== 'deposit_pending') {
                setStage('deposit_pending');
            } else if (currentStatus === 'pending_deposit_confirmation' && stage !== 'deposit_confirmation_pending') {
                setStage('deposit_confirmation_pending');
            } else if (currentStatus === 'confirmed' && stage !== 'confirmed') {
                setStage('confirmed');
            } else if (currentStatus === 'rejected' && stage !== 'rejected') {
                setStage('rejected');
            } else if (currentStatus === 'expired') {
                setStage('rejected'); // Show expired as a rejection state
            }
        });

        return () => unsubscribe();
    }, [bookingIds, stage]);

    const todayStr = useMemo(() => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, []);

    const computeAsapTarget = () => {
        const target = new Date(Date.now() + ASAP_LEAD_TIME_MINUTES * 60_000);
        const yyyy = target.getFullYear();
        const mm = String(target.getMonth() + 1).padStart(2, '0');
        const dd = String(target.getDate()).padStart(2, '0');
        const hh = String(target.getHours()).padStart(2, '0');
        const min = String(target.getMinutes()).padStart(2, '0');
        return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` };
    };

    const handleAsapToggle = (enabled: boolean) => {
        setForm(prev => {
            if (enabled) {
                const { date, time } = computeAsapTarget();
                return { ...prev, isAsap: true, eventDate: date, eventTime: time };
            }
            return { ...prev, isAsap: false };
        });
        setFieldErrors(prev => {
            const next = { ...prev };
            delete next.eventDate;
            delete next.eventTime;
            return next;
        });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
        if (fieldErrors[name]) {
            setFieldErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[name];
                return newErrors;
            });
        }
    };

    const handleServiceChange = (serviceId: string) => {
        setForm(prev => {
            const selectedServices = prev.selectedServices.includes(serviceId)
                ? prev.selectedServices.filter(s => s !== serviceId)
                : [...prev.selectedServices, serviceId];
            return { ...prev, selectedServices };
        });
        if (fieldErrors.selectedServices) {
            setFieldErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors.selectedServices;
                return newErrors;
            });
        }
    };

    const availableServices = useMemo(() => {
        const uniqueServiceIds = [...new Set(performers.flatMap(p => p.service_ids))];
        return allServices.filter(s => uniqueServiceIds.includes(s.id));
    }, [performers]);

    const servicesByCategory = useMemo(() => {
        return availableServices.reduce((acc, service) => {
            (acc[service.category] = acc[service.category] || []).push(service);
            return acc;
        }, {} as Record<string, Service[]>);
    }, [availableServices]);

    const { totalCost, depositAmount, travelFee } = useMemo(() => {
        return calculateBookingCost(Number(form.duration), form.selectedServices, performers.length, form.eventSuburb || undefined, !!form.isAsap);
    }, [form.selectedServices, form.duration, performers.length, form.eventSuburb, form.isAsap]);

    const { formattedTotalDuration } = useMemo(() => getBookingDurationInfo(Number(form.duration), form.selectedServices), [form.duration, form.selectedServices]);

    const validateStep = (step: number): boolean => {
        const errors: Record<string, string> = {};

        switch (step) {
            case 1:
                // Your details
                if (!form.fullName.trim()) errors.fullName = "Full name is required.";
                if (!form.email.trim()) errors.email = "Email address is required.";
                else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Invalid email format.";
                if (!form.mobile.trim()) errors.mobile = "Mobile number is required.";
                else if (!/^(\+614|04)\d{8}$/.test(form.mobile.replace(/\s+/g, ''))) errors.mobile = "Invalid AU mobile number.";
                if (!form.dob) {
                    errors.dob = "Date of birth is required.";
                } else {
                    const birthDate = new Date(form.dob);
                    const today = new Date();
                    let age = today.getFullYear() - birthDate.getFullYear();
                    const m = today.getMonth() - birthDate.getMonth();
                    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                        age--;
                    }
                    if (age < 18) {
                        errors.dob = "You must be at least 18 years old.";
                    }
                }
                // Event details
                if (!form.eventDate) errors.eventDate = "Date required.";
                if (!form.eventTime) errors.eventTime = "Time required.";
                if (!form.eventAddress.trim()) errors.eventAddress = "Address required.";
                if (!form.eventSuburb) errors.eventSuburb = "Suburb required.";
                if (!form.eventType) errors.eventType = "Event type required.";
                if (!form.numberOfGuests) errors.numberOfGuests = "Guest count required.";
                // Enforce performer minimum booking duration
                const maxMinDuration = Math.max(...performers.map(p => p.min_booking_duration_hours || 0));
                if (maxMinDuration > 0 && Number(form.duration) < maxMinDuration) {
                    errors.duration = `Minimum ${maxMinDuration} hour${maxMinDuration > 1 ? 's' : ''} required for ${performers.map(p => p.name).join(' & ')}.`;
                }
                // Client-side conflict detection (skipped for ASAP — admin/performer
                // decide on the fly whether the rush slot is workable)
                if (!form.isAsap && form.eventDate && form.eventTime && !errors.eventDate && !errors.eventTime) {
                    const conflicting = bookings.filter(b =>
                        b.event_date === form.eventDate &&
                        b.event_time === form.eventTime &&
                        b.status !== 'cancelled' && b.status !== 'rejected' &&
                        performers.some(p => p.id === b.performer_id)
                    );
                    if (conflicting.length > 0) {
                        const names = conflicting.map(b => b.performer?.name || `Performer #${b.performer_id}`).join(', ');
                        errors.eventTime = `Time conflict: ${names} already booked for this date/time.`;
                    }
                }
                if (form.isAsap) {
                    const blocker = performers.find(p => p.accepts_asap === false);
                    if (blocker) {
                        errors.eventTime = `${blocker.name} doesn't accept ASAP bookings — toggle ASAP off or pick another performer.`;
                    }
                }
                break;
            case 2:
                if (form.selectedServices.length === 0) errors.selectedServices = "Select at least one service.";
                if (!isVerifiedBooker && !agreedTerms) errors.agreedTerms = "Agreement required.";
                break;
        }

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleNext = () => {
        if (validateStep(currentStep)) {
            if (currentStep < TOTAL_STEPS) {
                setCurrentStep(currentStep + 1);
                window.scrollTo(0, 0);
            } else {
                setIsConfirmDialogOpen(true);
            }
        }
    };

    const handleClearAll = () => {
        setForm(prev => ({
            ...prev,
            selectedServices: initialSelectedServices,
            duration: '2'
        }));
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
            window.scrollTo(0, 0);
        } else {
            onBack();
        }
    };

    const handleFinalSubmission = async () => {
        setIsConfirmDialogOpen(false);
        setIsSubmitting(true);
        setError(null);

        // For users who explicitly logged in, refresh their token before
        // submitting so we catch token-refresh failures upfront with a
        // friendly re-login prompt. Anonymous customers (no currentUser, or
        // signed in anonymously) don't need a session — the
        // createBookingRequest callable accepts unauthenticated calls.
        if (auth?.currentUser && !auth.currentUser.isAnonymous) {
            try {
                await auth.currentUser.getIdToken(true);
            } catch {
                setError('Your login session has expired. Please log in again — your form data has been saved.');
                setIsSubmitting(false);
                return;
            }
        }

        const normalizedEmail = form.email.toLowerCase().trim();
        const normalizedPhone = form.mobile.replace(/\s+/g, '');
        const isBanned = doNotServeList.some(e =>
            e.client_email.toLowerCase().trim() === normalizedEmail ||
            e.client_phone.replace(/\s+/g, '') === normalizedPhone
        );

        if (isBanned) {
            setStage('rejected');
            setIsSubmitting(false);
            return;
        }

        try {
            const result = await onBookingRequest(form, performers);
            if (result.success && result.bookingIds) {
                setBookingIds(result.bookingIds);
                clearDraft();

                // Move into the new self-hosted verification flow.
                // Trusted/repeat bookers skip directly to performer acceptance.
                setStage(isVerifiedBooker ? 'performer_acceptance_pending' : 'verification_pending');
                onBookingSubmitted?.();
            } else {
                setError(result.message);
            }
        } catch (err: unknown) {
            const raw = err instanceof Error ? err.message : 'Submission failed.';
            setError(raw);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePaymentSuccess = async () => {
        setIsPayIdModalOpen(false);
        // In monoova mode: webhook already confirmed → go straight to confirmed
        if (bookingPaymentStatus === 'paid' || bookingPaymentStatus === 'deposit_paid') {
            setStage('confirmed');
            return;
        }
        // In manual mode (or fallback): client clicked "I've Sent Payment" →
        // transition booking to pending_deposit_confirmation so admin can verify
        if (bookingIds.length > 0) {
            await onUpdateBookingStatus?.(bookingIds[0], 'pending_deposit_confirmation');
            setStage('deposit_confirmation_pending');
        }
    };

    if (stage === 'verification_pending' && bookingIds.length > 0) {
        return (
            <div className="max-w-md mx-auto pt-8 pb-12 px-4">
                <div className="card-base !p-6 sm:!p-8 shadow-2xl border-zinc-800/50">
                    <VerificationStep
                        bookingId={bookingIds[0]}
                        phoneE164={normaliseToE164(form.mobile)}
                        onAllSignalsCleared={() => {
                            setStage('performer_acceptance_pending');
                            onBookingSubmitted?.();
                        }}
                        onCancel={() => onBookingSubmitted?.()}
                    />
                </div>
            </div>
        );
    }

    if (stage === 'performer_acceptance_pending') {
        return <StatusScreen icon={LoaderCircle} title="Request Sent" bgColor="bg-purple-900/10" buttonText="Back to Dashboard" onButtonClick={onBookingSubmitted}>Awaiting performer confirmation.</StatusScreen>;
    }
    if (stage === 'vetting_pending') {
        return <StatusScreen icon={Shield} title="Identity Vetting" bgColor="bg-yellow-900/10" buttonText="Back to Dashboard" onButtonClick={onBookingSubmitted}>Admin is reviewing your verification documents.</StatusScreen>;
    }
    if (stage === 'deposit_pending') {
        return (
            <StatusScreen icon={Wallet} title="Deposit Required" bgColor="bg-orange-900/10" buttonText="Pay Deposit" onButtonClick={() => setIsPayIdModalOpen(true)}>
                Booking approved! Pay <strong>${(depositAmount || 0).toFixed(2)}</strong> to secure your date.
                {bookingReference && <p className="mt-2 text-sm text-zinc-400">Reference: <strong className="text-orange-400">{bookingReference}</strong></p>}
                {isPayIdModalOpen && (
                    <PayIDSimulationModal
                        amount={depositAmount}
                        totalAmount={totalCost}
                        performerNames={performers.map(p => p.name).join(', ')}
                        eventType={form.eventType}
                        eventDate={form.eventDate}
                        eventAddress={form.eventAddress}
                        bookingReference={bookingReference}
                        paymentStatus={bookingPaymentStatus}
                        expiresAt={bookingExpiresAt}
                        onPaymentSuccess={handlePaymentSuccess}
                        onClose={() => setIsPayIdModalOpen(false)}
                    />
                )}
            </StatusScreen>
        );
    }
    if (stage === 'deposit_confirmation_pending') {
        return <StatusScreen icon={LoaderCircle} title="Verifying Payment" bgColor="bg-blue-900/10" buttonText="Dashboard" onButtonClick={onBookingSubmitted}>Payment received. Admin is confirming.</StatusScreen>;
    }
    if (stage === 'confirmed') {
        return <StatusScreen icon={CheckCircle} title="Confirmed!" bgColor="bg-green-900/10" buttonText="View Bookings" onButtonClick={onBookingSubmitted}>Booking is locked in!</StatusScreen>;
    }
    if (stage === 'rejected') {
        return <StatusScreen icon={ShieldX} title="Application Declined" bgColor="bg-red-900/10" buttonText="Back to Gallery" onButtonClick={onBack}>Request could not be fulfilled.</StatusScreen>;
    }

    return (
        <div className="animate-fade-in max-w-4xl mx-auto pb-12">
            <div className="mb-8 flex items-center justify-between px-2">
                <button onClick={handleBack} className="text-zinc-400 hover:text-white flex items-center gap-2 transition-colors">
                    <ArrowLeft size={20} /> Back
                </button>
                <div className="text-right">
                    <p className="text-sm text-zinc-500 uppercase font-bold">Booking Request</p>
                    <p className="text-orange-400 font-bold">{performers.map(p => p.name).join(' & ')}</p>
                </div>
            </div>

            <ProgressIndicator currentStep={currentStep} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="card-base !p-6 sm:!p-10 shadow-2xl border-zinc-800/50">
                        <ErrorDisplay message={error} onLogin={() => window.location.reload()} />

                        {currentStep === 1 && (
                            <div className="space-y-8 animate-fade-in">
                                <section className="space-y-4">
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Your details</h2>
                                        <p className="text-sm text-zinc-400">Use the name on your ID — it speeds up verification.</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <InputField icon={<User />} label="Legal Full Name" name="fullName" value={form.fullName} onChange={handleChange} required error={fieldErrors.fullName} />
                                        <InputField icon={<Mail />} label="Email Address" type="email" name="email" value={form.email} onChange={handleChange} required error={fieldErrors.email} />
                                        <InputField icon={<Phone />} label="Mobile Number" type="tel" name="mobile" value={form.mobile} onChange={handleChange} required error={fieldErrors.mobile} placeholder="04XX XXX XXX" />
                                        <InputField icon={<Calendar />} label="Date of Birth" type="date" name="dob" value={form.dob} onChange={handleChange} required error={fieldErrors.dob} />
                                    </div>
                                    {isVerifiedBooker && (
                                        <div className="p-3 bg-green-900/20 border border-green-500/40 rounded-lg flex items-center gap-3">
                                            <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                                            <p className="text-xs text-green-200">Trusted client — verification will be skipped after submission.</p>
                                        </div>
                                    )}
                                </section>

                                <hr className="border-zinc-800" />

                                <section className="space-y-4">
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Where & when</h2>
                                        <p className="text-sm text-zinc-400">Tell us about the event so we can match the right performer.</p>
                                    </div>
                                {(() => {
                                    const asapBlocker = performers.find(p => p.accepts_asap === false);
                                    const outsideHours = !isAsapAvailableNow();
                                    const asapDisabled = !!asapBlocker || outsideHours;
                                    const disabledReason = outsideHours && ASAP_OPERATING_HOURS
                                        ? `ASAP bookings are only available between ${ASAP_OPERATING_HOURS.startHour}:00 and ${ASAP_OPERATING_HOURS.endHour}:00. Schedule for later instead.`
                                        : asapBlocker
                                            ? `${asapBlocker.name} doesn't currently take ASAP bookings — pick another performer or schedule for later.`
                                            : '';
                                    return (
                                        <button
                                            type="button"
                                            onClick={() => !asapDisabled && handleAsapToggle(!form.isAsap)}
                                            disabled={asapDisabled}
                                            className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-4 ${form.isAsap
                                                ? 'bg-pink-500/10 border-pink-500 ring-1 ring-pink-500/40'
                                                : asapDisabled
                                                    ? 'bg-zinc-900/40 border-zinc-800 opacity-60 cursor-not-allowed'
                                                    : 'bg-zinc-900 border-zinc-800 hover:border-pink-500/50'}`}
                                        >
                                            <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${form.isAsap ? 'bg-pink-500 text-white' : 'bg-zinc-800 text-pink-400'}`}>
                                                <Zap className="h-5 w-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-white flex items-center gap-2">
                                                    Book ASAP
                                                    <span className="text-[10px] uppercase tracking-wide bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded">
                                                        Within {ASAP_LEAD_TIME_MINUTES} min
                                                    </span>
                                                </p>
                                                <p className="text-xs text-zinc-400 mt-0.5">
                                                    {asapDisabled
                                                        ? disabledReason
                                                        : form.isAsap
                                                            ? `Performer arrives by ${form.eventTime} today. A ${Math.round(ASAP_SURCHARGE_PERCENT * 100)}% rush surcharge applies.`
                                                            : `Need someone now? Toggle on and we'll dispatch a performer within the hour.`}
                                                </p>
                                            </div>
                                            <div className={`h-6 w-11 rounded-full p-0.5 transition ${form.isAsap ? 'bg-pink-500' : 'bg-zinc-700'}`}>
                                                <div className={`h-5 w-5 rounded-full bg-white transition ${form.isAsap ? 'translate-x-5' : ''}`} />
                                            </div>
                                        </button>
                                    );
                                })()}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {form.isAsap ? (
                                        <div className="md:col-span-2 grid grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-medium text-zinc-400 mb-1">Event Date</label>
                                                <div className="input-base flex items-center !pl-12 relative cursor-not-allowed bg-zinc-900/60">
                                                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-pink-400" />
                                                    <span className="text-zinc-200">{form.eventDate || todayStr} (today)</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-zinc-400 mb-1">Arrive By</label>
                                                <div className="input-base flex items-center !pl-12 relative cursor-not-allowed bg-zinc-900/60">
                                                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-pink-400" />
                                                    <span className="text-zinc-200">{form.eventTime} ({ASAP_LEAD_TIME_MINUTES} min from now)</span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (<>
                                    <InputField icon={<Calendar />} label="Event Date" type="date" name="eventDate" min={todayStr} value={form.eventDate} onChange={handleChange} required error={fieldErrors.eventDate} />
                                    <InputField icon={<Clock />} label="Start Time" type="time" name="eventTime" value={form.eventTime} onChange={handleChange} required error={fieldErrors.eventTime} />
                                    </>)}
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-1">Duration (Hours)</label>
                                        <div className="relative">
                                            <select name="duration" value={form.duration} onChange={handleChange} className="input-base !pl-12 appearance-none">
                                                {[1, 1.5, 2, 2.5, 3, 4, 5, 6].map(h => <option key={h} value={h}>{h} Hour{h !== 1 ? 's' : ''}</option>)}
                                            </select>
                                            <Clock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 pointer-events-none" />
                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 pointer-events-none" />
                                        </div>
                                        {fieldErrors.duration && <p className="mt-1 text-xs text-red-400">{fieldErrors.duration}</p>}
                                    </div>
                                    <InputField icon={<UsersIcon />} label="Guest Count" type="number" name="numberOfGuests" value={form.numberOfGuests} onChange={handleChange} required error={fieldErrors.numberOfGuests} />
                                    <InputField icon={<MapPin />} label="Event Address" name="eventAddress" value={form.eventAddress} onChange={handleChange} required error={fieldErrors.eventAddress} />
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-1">Suburb / Area</label>
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 pointer-events-none z-10" />
                                            <input
                                                type="text"
                                                placeholder={form.eventSuburb || "Search suburb..."}
                                                value={suburbSearch}
                                                onChange={(e) => { setSuburbSearch(e.target.value); setIsSuburbOpen(true); }}
                                                onFocus={() => setIsSuburbOpen(true)}
                                                onBlur={() => setTimeout(() => setIsSuburbOpen(false), 200)}
                                                className="input-base !pl-12"
                                            />
                                            {form.eventSuburb && !suburbSearch && (
                                                <span className="absolute left-12 top-1/2 -translate-y-1/2 text-zinc-200 pointer-events-none">{form.eventSuburb}</span>
                                            )}
                                            {isSuburbOpen && (
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg max-h-64 overflow-y-auto z-50 shadow-xl">
                                                    {perthSuburbs
                                                        .filter(s => !suburbSearch || s.name.toLowerCase().includes(suburbSearch.toLowerCase()))
                                                        // Show all matches when the user has typed something; cap at 50
                                                        // when the dropdown is opened with no search to keep first
                                                        // paint snappy. perthSuburbs has 300+ entries; type to narrow.
                                                        .slice(0, suburbSearch ? perthSuburbs.length : 50)
                                                        .map(s => (
                                                            <button
                                                                key={s.name}
                                                                type="button"
                                                                onMouseDown={(e) => { e.preventDefault(); setForm(prev => ({ ...prev, eventSuburb: s.name })); setSuburbSearch(''); setIsSuburbOpen(false); if (fieldErrors.eventSuburb) setFieldErrors(prev => { const n = {...prev}; delete n.eventSuburb; return n; }); }}
                                                                className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors flex justify-between"
                                                            >
                                                                <span>{s.name}</span>
                                                                <span className="text-zinc-500 text-xs">{s.distanceFromCBD}km</span>
                                                            </button>
                                                        ))
                                                    }
                                                    {perthSuburbs.filter(s => !suburbSearch || s.name.toLowerCase().includes(suburbSearch.toLowerCase())).length === 0 && (
                                                        <p className="px-4 py-3 text-sm text-zinc-500">No suburbs match "{suburbSearch}"</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {travelFee > 0 && form.eventSuburb && (
                                            <p className="mt-1.5 text-xs text-orange-400 flex items-center gap-1">
                                                <Info size={12} /> A ${travelFee.toFixed(0)} travel fee applies for this location
                                            </p>
                                        )}
                                        {fieldErrors.eventSuburb && <p className="mt-1 text-xs text-red-400">{fieldErrors.eventSuburb}</p>}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-1">Event Type</label>
                                        <div className="relative">
                                            <select name="eventType" value={form.eventType} onChange={handleChange} className="input-base !pl-12 appearance-none">
                                                <option value="" disabled>Select event type</option>
                                                {eventTypes.map(type => <option key={type} value={type}>{type}</option>)}
                                            </select>
                                            <PartyPopper className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 pointer-events-none" />
                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 pointer-events-none" />
                                        </div>
                                    </div>
                                </div>
                                </section>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-8 animate-fade-in">
                                <div>
                                    <h2 className="text-2xl font-bold text-white mb-2">Choose your services</h2>
                                    <p className="text-zinc-400">Select one or more — pricing updates instantly on the right.</p>
                                </div>
                                {fieldErrors.selectedServices && (
                                    <div className="p-3 bg-red-900/30 border border-red-500/40 rounded-lg flex items-center gap-2 text-sm text-red-300">
                                        <AlertTriangle size={16} /> {fieldErrors.selectedServices}
                                    </div>
                                )}
                                <div className="space-y-8">
                                    {(Object.entries(servicesByCategory) as [string, Service[]][]).map(([category, services]) => (
                                        <div key={category}>
                                            <h3 className="text-lg font-semibold text-orange-400 mb-4 flex items-center gap-2"><Briefcase size={18} /> {category}</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {services.map(service => {
                                                    const isSelected = form.selectedServices.includes(service.id);
                                                    return (
                                                        <button type="button" key={service.id} onClick={() => handleServiceChange(service.id)} className={`p-4 rounded-xl border text-left transition-all duration-200 flex justify-between items-center group focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${isSelected ? 'bg-orange-500/10 border-orange-500 shadow-[0_0_18px_rgba(255,0,128,0.15)]' : 'bg-zinc-900 border-zinc-800 hover:border-orange-500/40'}`}>
                                                            <div className="flex-1 min-w-0">
                                                                <p className={`font-bold ${isSelected ? 'text-orange-400' : 'text-zinc-200'}`}>{service.name}</p>
                                                                <p className="text-xs text-zinc-500 mt-0.5">{service.description}</p>
                                                            </div>
                                                            <div className="ml-4 text-right flex flex-col items-end gap-1 flex-shrink-0">
                                                                <span className="text-sm font-bold block text-zinc-300">${service.rate}{service.rate_type === 'per_hour' ? '/hr' : ''}</span>
                                                                {(service.duration_minutes || service.min_duration_hours) && (
                                                                    <span className="text-xs text-zinc-500 font-medium">
                                                                        {service.duration_minutes ? `${service.duration_minutes} mins` : `Min ${service.min_duration_hours} hr${service.min_duration_hours! > 1 ? 's' : ''}`}
                                                                    </span>
                                                                )}
                                                                {isSelected && <CheckCircle size={18} className="text-orange-400 inline mt-1" />}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">Special Notes (Optional)</label>
                                    <textarea name="client_message" value={form.client_message} onChange={handleChange} placeholder="Anything we should know? Theme, music preferences, accessibility, etc." className="input-base h-24 resize-none" />
                                </div>

                                <div className="pt-6 border-t border-zinc-800 space-y-4">
                                    {isVerifiedBooker ? (
                                        <div className="p-4 bg-green-900/20 border border-green-500/40 rounded-xl flex items-center gap-3">
                                            <CheckCircle className="h-6 w-6 text-green-400 flex-shrink-0" />
                                            <div>
                                                <p className="font-semibold text-white text-sm">Verified Trusted Client</p>
                                                <p className="text-xs text-green-200/80">You're pre-cleared — verification will be skipped.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl flex items-start gap-3">
                                            <Shield className="h-5 w-5 text-orange-400 mt-0.5 flex-shrink-0" />
                                            <div className="text-xs text-zinc-400 leading-relaxed">
                                                <span className="font-semibold text-zinc-200">Quick verification after submit.</span> We'll send a one-time SMS code (~60s). No ID is uploaded or stored. Returning clients skip this automatically.
                                            </div>
                                        </div>
                                    )}

                                    <label className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-colors border ${agreedTerms ? 'bg-orange-500/5 border-orange-500/40' : 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800'}`}>
                                        <input type="checkbox" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} className="h-5 w-5 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500" />
                                        <span className="text-sm text-zinc-300">I agree to the <a href="#" onClick={(e) => { e.preventDefault(); onShowTermsOfService(); }} className="text-orange-400 underline">Terms</a> & <a href="#" onClick={(e) => { e.preventDefault(); onShowPrivacyPolicy(); }} className="text-orange-400 underline">Privacy Policy</a>. I am 18+.</span>
                                    </label>
                                    {fieldErrors.agreedTerms && <p className="text-xs text-red-400 font-medium pl-1">{fieldErrors.agreedTerms}</p>}
                                </div>
                            </div>
                        )}

                        <div className="mt-12 pt-8 border-t border-zinc-800 flex flex-col sm:flex-row gap-4 items-center justify-between">
                            <div className="text-sm text-zinc-500">Step {currentStep} of {TOTAL_STEPS}</div>
                            <div className="flex gap-4 w-full sm:w-auto">
                                <button onClick={handleBack} disabled={isSubmitting} className="flex-1 sm:flex-none px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50">{currentStep === 1 ? 'Cancel' : 'Back'}</button>
                                <button onClick={handleNext} disabled={isSubmitting} className="flex-1 sm:flex-none btn-primary px-8 py-3 flex items-center justify-center gap-2 disabled:opacity-60">
                                    {isSubmitting ? <LoaderCircle className="animate-spin" size={18} /> : currentStep === TOTAL_STEPS ? <Send size={18} /> : null}
                                    {isSubmitting ? 'Processing...' : currentStep === TOTAL_STEPS ? 'Review & Submit' : 'Continue'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1 space-y-6">
                    <div className="sticky top-8">
                        <BookingCostCalculator
                            selectedServices={form.selectedServices}
                            durationHours={Number(form.duration)}
                            performers={performers}
                            suburbName={form.eventSuburb || undefined}
                            isAsap={!!form.isAsap}
                            onClearAll={currentStep === 2 ? handleClearAll : undefined}
                        />

                        {currentStep > 1 && (
                            <div className="card-base mt-6 !p-6 !bg-zinc-900/50 border-zinc-800/50 animate-fade-in">
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                    <Info size={18} className="text-orange-400" /> Booking Summary
                                </h3>
                                <div className="space-y-3 text-sm">
                                    {form.eventDate && (
                                        <div className="flex justify-between">
                                            <span className="text-zinc-500">Date:</span>
                                            <span className="text-zinc-200">{new Date(form.eventDate).toLocaleDateString()}</span>
                                        </div>
                                    )}
                                    {form.eventTime && (
                                        <div className="flex justify-between">
                                            <span className="text-zinc-500">Time:</span>
                                            <span className="text-zinc-200">{form.eventTime}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">Duration:</span>
                                        <span className="text-zinc-200">{form.duration} Hours</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">Performers:</span>
                                        <span className="text-zinc-200">{performers.length}</span>
                                    </div>
                                    {form.selectedServices.length > 0 && (
                                        <div className="pt-2 border-t border-zinc-800">
                                            <span className="text-zinc-500 block mb-1">Services:</span>
                                            <div className="flex flex-wrap gap-1">
                                                {form.selectedServices.map(id => {
                                                    const s = allServices.find(srv => srv.id === id);
                                                    return s ? (
                                                        <span key={id} className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[10px] border border-zinc-700">
                                                            {s.name}
                                                        </span>
                                                    ) : null;
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <BookingConfirmationDialog isOpen={isConfirmDialogOpen} onClose={() => setIsConfirmDialogOpen(false)} onConfirm={handleFinalSubmission} isLoading={isSubmitting} bookingDetails={{ performers, eventDate: form.eventDate, eventTime: form.eventTime, eventAddress: form.eventAddress, eventSuburb: form.eventSuburb, selectedServices: form.selectedServices.map(id => allServices.find(s => s.id === id)?.name || id), eventDuration: formattedTotalDuration, totalCost, depositAmount, travelFee }} />

        </div>
    );
};

export default BookingProcess;