import React, { useState, useMemo, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseClient';
import type { Performer, Booking, BookingStatus, DoNotServeEntry, Communication, Service } from '../types';
import { allServices } from '../data/mockData';
import { DEPOSIT_PERCENTAGE, ASAP_DEFAULT_DURATION_HOURS, ASAP_MAX_ETA_MINUTES, ASAP_SURCHARGE_MULTIPLIER, PAY_ID_NAME, PAY_ID_EMAIL } from '../constants';
import { getBookingDurationInfo, calculateBookingCost } from '../utils/bookingUtils';
import InputField from './InputField';
import BookingCostCalculator from './BookingCostCalculator';
import BookingConfirmationDialog from './BookingConfirmationDialog';
import PayIDSimulationModal from './PayIDSimulationModal';
import { api } from '../services/api';
import DiditVerification from './DiditVerification';
import { ArrowLeft, User, Mail, Phone, Calendar, Clock, MapPin, PartyPopper, ShieldCheck, Send, ListChecks, Info, AlertTriangle, ShieldX, CheckCircle, ChevronDown, LoaderCircle, Users as UsersIcon, Shield, Wallet, Briefcase, Zap } from 'lucide-react';

export interface BookingFormState {
  fullName: string;
  email: string;
  mobile: string;
  dob: string;
  eventDate: string;
  eventTime: string;
  eventAddress: string;
  eventType: string;
  duration: string;
  serviceDurations: Record<string, number>;
  numberOfGuests: string;
  selectedServices: string[];
  didit_verification_id: string | null;
  client_message: string;
  _hp: string;  // honeypot - must remain empty
  isASAP: boolean;
}

interface BookingProcessProps {
  performers: Performer[];
  onBack: () => void;
  onBookingSubmitted: () => void;
  bookings: Booking[];
  onUpdateBookingStatus?: (bookingId: string, status: BookingStatus) => Promise<void>;
  onBookingRequest: (formState: BookingFormState, performers: Performer[]) => Promise<{success: boolean; message: string; bookingIds?: string[]}>;
  doNotServeList: DoNotServeEntry[];
  addCommunication: (commData: Omit<Communication, 'id' | 'created_at' | 'read'>) => Promise<void>;
  onShowPrivacyPolicy: () => void;
  onShowTermsOfService: () => void;
  initialSelectedServices?: string[];
  isASAP?: boolean;
}

type BookingStage = 'form' | 'performer_acceptance_pending' | 'vetting_pending' | 'deposit_pending' | 'deposit_confirmation_pending' | 'confirmed' | 'rejected';

/** Generate a unique booking reference like FLV-20260313-X7K2 */
const generateBookingRef = (): string => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) rand += chars[Math.floor(Math.random() * chars.length)];
  return `FLV-${datePart}-${rand}`;
};

const eventTypes = ['Bucks Party', 'Birthday Party', 'Corporate Event', 'Hens Party', 'Private Gathering', 'Other'];

const ErrorDisplay = ({ message }: { message: string | null }) => message ? (
    <div className="p-4 mb-6 text-sm text-red-200 bg-red-900/50 rounded-lg border border-red-500 flex items-start gap-3 animate-fade-in" role="alert">
        <AlertTriangle className="h-5 w-5 mt-0.5 text-red-400 flex-shrink-0" />
        <div>
            <span className="font-bold">Submission Error:</span> {message}
        </div>
    </div>
) : null;

interface StatusScreenProps {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  bgColor: string;
  buttonText: string;
  onButtonClick: () => void;
  secondaryButtonText?: string;
  onSecondaryClick?: () => void;
  bookingRef?: string;
}

const StatusScreen: React.FC<StatusScreenProps> = ({ icon: Icon, title, children, bgColor, buttonText, onButtonClick, secondaryButtonText, onSecondaryClick, bookingRef }) => (
  <div className={`flex flex-col items-center justify-center min-h-[60vh] text-center p-4 animate-fade-in ${bgColor}`}>
    <div className="bg-black/40 backdrop-blur-md p-8 sm:p-12 rounded-2xl border border-white/10 shadow-2xl max-w-2xl w-full">
        <Icon className={`mx-auto h-20 w-20 mb-6 ${Icon === LoaderCircle ? 'animate-spin text-orange-500' : 'text-orange-400'}`} />
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{title}</h2>
        <div className="text-zinc-300 mt-2 mb-8 max-w-lg mx-auto leading-relaxed">
          {children}
        </div>
        {bookingRef && (
          <div className="mt-4 mb-8 bg-zinc-900/50 px-6 py-3 rounded-xl border border-zinc-800 inline-block">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Booking Reference</p>
            <p className="text-xl font-mono font-bold text-orange-400 mt-1">{bookingRef}</p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={onButtonClick} className="btn-primary px-8 py-3 text-lg">
                {buttonText}
            </button>
            {secondaryButtonText && onSecondaryClick && (
                <button onClick={onSecondaryClick} className="px-8 py-3 text-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl transition-colors border border-zinc-700">
                    {secondaryButtonText}
                </button>
            )}
        </div>
    </div>
  </div>
);


const allWizardSteps = [
    { id: 1, name: 'Client Details', icon: User },
    { id: 2, name: 'Event Details', icon: Calendar },
    { id: 3, name: 'Services', icon: ListChecks },
    { id: 4, name: 'Identity & Safety', icon: ShieldCheck },
];

type WizardStep = typeof allWizardSteps[number];

const ProgressIndicator: React.FC<{ currentStep: number; steps: WizardStep[]; onStepClick?: (step: number) => void }> = ({ currentStep, steps, onStepClick }) => (
    <nav aria-label="Progress" className="mb-10">
        <ol role="list" className="flex items-center justify-between max-w-2xl mx-auto">
            {steps.map((step, index) => {
                const isCompleted = currentStep > step.id;
                const isCurrent = currentStep === step.id;
                const isClickable = step.id <= currentStep;
                const Icon = step.icon;
                const displayNumber = index + 1;

                return (
                    <li key={step.name} className="flex items-center flex-1 last:flex-none">
                        <div className="flex flex-col items-center gap-2">
                            <div
                                onClick={() => isClickable && onStepClick?.(step.id)}
                                className={`relative flex items-center justify-center w-11 h-11 rounded-full border-2 transition-all duration-300 ${isCompleted ? 'bg-orange-500 border-orange-500' : isCurrent ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-700 bg-zinc-900'} ${isClickable ? 'cursor-pointer hover:scale-110' : ''}`}
                            >
                                {isCompleted ? (
                                    <CheckCircle className="h-5 w-5 text-white" />
                                ) : (
                                    <Icon className={`h-5 w-5 ${isCurrent ? 'text-orange-400' : 'text-zinc-500'}`} />
                                )}
                            </div>
                            <div className="text-center">
                                <span className={`text-[10px] font-semibold uppercase tracking-wider block ${isCurrent ? 'text-orange-400' : isCompleted ? 'text-orange-400/70' : 'text-zinc-600'}`}>
                                    Step {displayNumber}
                                </span>
                                <span className={`text-xs font-medium hidden sm:block ${isCurrent ? 'text-white' : isCompleted ? 'text-zinc-400' : 'text-zinc-500'}`}>{step.name}</span>
                            </div>
                        </div>
                        {index < steps.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-3 rounded-full transition-colors duration-300 mb-6 ${isCompleted ? 'bg-orange-500' : 'bg-zinc-800'}`} />
                        )}
                    </li>
                );
            })}
        </ol>
    </nav>
);


const BookingProcess: React.FC<BookingProcessProps> = ({ performers, onBack, onBookingSubmitted, bookings, onUpdateBookingStatus, onBookingRequest, doNotServeList, addCommunication, onShowPrivacyPolicy, onShowTermsOfService, initialSelectedServices = [], isASAP = false }) => {
    const [stage, setStage] = useState<BookingStage>('form');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [form, setForm] = useState<BookingFormState>({
        fullName: '', email: '', mobile: '', dob: '', eventDate: '', eventTime: '', eventAddress: '', eventType: '', duration: '2', serviceDurations: {}, numberOfGuests: '', selectedServices: initialSelectedServices, didit_verification_id: null, client_message: '', _hp: '', isASAP: false
    });
    const [bookingIds, setBookingIds] = useState<string[]>([]);
    const [bookingRef, setBookingRef] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [agreedTerms, setAgreedTerms] = useState(false);
    const [isVerifiedBooker, setIsVerifiedBooker] = useState(false);
    const [isDiditVerified, setIsDiditVerified] = useState(false);
    const [showDiditModal, setShowDiditModal] = useState(false);
    const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
    const [isPayIdModalOpen, setIsPayIdModalOpen] = useState(false);
    const [lastSubmitTime, setLastSubmitTime] = useState<number>(0);
    const formStartTime = React.useRef<number>(Date.now());

    useEffect(() => {
      const checkVerifiedBooker = () => {
        if(!form.email && !form.mobile) return setIsVerifiedBooker(false);
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
        
        const bookingRef = doc(db, 'bookings', bookingIds[0]);
        const unsubscribe = onSnapshot(bookingRef, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data() as Booking;
            const currentStatus = data.status;
            
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
            }
        });
        
        return () => unsubscribe();
    }, [bookingIds, stage]);

    // Auto-fill date/time and set ASAP flag when launched in ASAP mode
    useEffect(() => {
        if (isASAP) {
            const now = new Date();
            const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            setForm(prev => ({
                ...prev,
                isASAP: true,
                eventDate: todayDate,
                eventTime: currentTime,
                duration: String(ASAP_DEFAULT_DURATION_HOURS),
            }));
        }
    }, [isASAP]);

    // Wizard steps — ASAP mode skips the Event Details step (it's auto-filled)
    const wizardSteps = useMemo(() => {
        if (isASAP) {
            return [
                { id: 1, name: 'Client Details', icon: User },
                { id: 3, name: 'Services', icon: ListChecks },
                { id: 4, name: 'Identity & Safety', icon: ShieldCheck },
            ];
        }
        return allWizardSteps;
    }, [isASAP]);

    const todayStr = useMemo(() => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, []);

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
            const isRemoving = prev.selectedServices.includes(serviceId);
            const selectedServices = isRemoving
                ? prev.selectedServices.filter(s => s !== serviceId)
                : [...prev.selectedServices, serviceId];
            const serviceDurations = { ...prev.serviceDurations };
            if (isRemoving) {
                delete serviceDurations[serviceId];
            } else {
                const service = allServices.find(s => s.id === serviceId);
                if (service?.rate_type === 'per_hour') {
                    serviceDurations[serviceId] = service.min_duration_hours || 2;
                }
            }
            return { ...prev, selectedServices, serviceDurations };
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

    const { totalCost, depositAmount } = useMemo(() => {
        return calculateBookingCost(Number(form.duration), form.selectedServices, performers.length, form.serviceDurations, form.isASAP);
    }, [form.selectedServices, form.duration, form.serviceDurations, performers.length, form.isASAP]);

    const { formattedTotalDuration } = useMemo(() => getBookingDurationInfo(Number(form.duration), form.selectedServices, form.serviceDurations), [form.duration, form.selectedServices, form.serviceDurations]);

    const validateStep = (step: number): boolean => {
        const errors: Record<string, string> = {};
        
        switch (step) {
            case 1:
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
                break;
            case 2:
                if (form.isASAP) break; // Auto-filled for ASAP bookings
                if (!form.eventDate) errors.eventDate = "Date required.";
                else {
                    const eventDate = new Date(form.eventDate);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    if (eventDate < today) errors.eventDate = "Event date must be in the future.";
                }
                if (!form.eventTime) errors.eventTime = "Time required.";
                if (!form.eventAddress.trim()) errors.eventAddress = "Address required.";
                if (!form.eventType) errors.eventType = "Event type required.";
                if (!form.numberOfGuests) errors.numberOfGuests = "Guest count required.";
                else if (Number(form.numberOfGuests) < 1) errors.numberOfGuests = "Must have at least 1 guest.";
                break;
            case 3:
                if (form.selectedServices.length === 0) errors.selectedServices = "Select at least one service.";
                break;
            case 4:
                if (!isVerifiedBooker) {
                    if (!isDiditVerified) errors.didit = "Identity verification is required.";
                    if (!agreedTerms) errors.agreedTerms = "Agreement required.";
                }
                break;
        }

        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return false;
        }
        return true;
    };

    const handleNext = () => {
        if (validateStep(currentStep)) {
            let nextStep = currentStep + 1;
            // Skip Event Details step in ASAP mode (auto-filled)
            if (isASAP && nextStep === 2) {
                nextStep = 3;
            }
            if (nextStep <= 4) {
                setCurrentStep(nextStep);
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
            duration: '2',
            serviceDurations: {}
        }));
    };

    const handleBack = () => {
        let prevStep = currentStep - 1;
        // Skip Event Details step in ASAP mode
        if (isASAP && prevStep === 2) {
            prevStep = 1;
        }
        if (prevStep >= 1) {
            setCurrentStep(prevStep);
            window.scrollTo(0, 0);
        } else {
            onBack();
        }
    };

    const handleFinalSubmission = async () => {
        setIsConfirmDialogOpen(false);
        setIsSubmitting(true);
        setError(null);

        // Honeypot check - bots will fill this hidden field
        if (form._hp) {
            setStage('rejected');
            setIsSubmitting(false);
            return;
        }

        // Rate limit: minimum 10 seconds between submissions
        const now = Date.now();
        if (now - lastSubmitTime < 10000) {
            setError('Please wait a moment before submitting again.');
            setIsSubmitting(false);
            return;
        }
        setLastSubmitTime(now);

        // Reject submissions completed in under 5 seconds (likely bot)
        if (Date.now() - formStartTime.current < 5000) {
            setStage('rejected');
            setIsSubmitting(false);
            return;
        }

        const normalizedEmail = form.email.toLowerCase().trim();
        const normalizedPhone = form.mobile.replace(/\s+/g, '');
        // Note: This client-side check is a UX convenience only. 
        // The actual security gate is implemented server-side in Cloud Functions.
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
                setBookingRef(generateBookingRef());
            } else {
                setError(result.message);
            }
        } catch (err: any) {
            setError(err.message || 'Submission failed.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePaymentSuccess = async (receiptRef: string) => {
       setIsPayIdModalOpen(false);
       if(bookingIds.length > 0) {
          await api.updateBookingStatus(bookingIds[0], 'pending_deposit_confirmation', {
            deposit_receipt_ref: receiptRef,
            deposit_submitted_at: new Date().toISOString()
          });
          setStage('deposit_confirmation_pending');
       }
    };

    if (isSubmitting) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
                <LoaderCircle className="h-20 w-20 animate-spin text-orange-500 mb-6" />
                <h2 className="text-3xl font-bold text-white mb-2">Submitting Your Booking</h2>
                <p className="text-zinc-400">Please wait while we process your request...</p>
            </div>
        );
    }

    if (stage === 'performer_acceptance_pending') {
        return <StatusScreen icon={LoaderCircle} title="Request Sent" bgColor="bg-purple-900/10" buttonText="Back to Dashboard" onButtonClick={onBookingSubmitted} secondaryButtonText="Book Another Entertainer" onSecondaryClick={onBack} bookingRef={bookingRef}>Awaiting performer confirmation.</StatusScreen>;
    }
    if (stage === 'vetting_pending') {
        return <StatusScreen icon={Shield} title="Identity Vetting" bgColor="bg-yellow-900/10" buttonText="Back to Dashboard" onButtonClick={onBookingSubmitted} secondaryButtonText="Book Another Entertainer" onSecondaryClick={onBack} bookingRef={bookingRef}>Admin is reviewing your verification documents.</StatusScreen>;
    }
    if (stage === 'deposit_pending') {
        return (
            <StatusScreen icon={Wallet} title="Deposit Required" bgColor="bg-orange-900/10" buttonText="Open Payment Form" onButtonClick={() => setIsPayIdModalOpen(true)} bookingRef={bookingRef}>
                <p className="mb-4">Booking approved! Pay <strong>${(depositAmount || 0).toFixed(2)}</strong> to secure your date.</p>
                <div className="text-left bg-zinc-900/60 rounded-xl p-5 border border-zinc-800 space-y-3 max-w-md mx-auto">
                    <p className="text-xs text-zinc-400 uppercase tracking-wider font-bold">Transfer via PayID</p>
                    <div className="flex items-center gap-3 bg-zinc-950/50 p-3 rounded-lg border border-orange-500/20">
                        <div className="w-10 h-10 bg-orange-500 text-white rounded-lg flex items-center justify-center flex-shrink-0">
                            <Wallet className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-bold text-white text-sm uppercase tracking-tight truncate">{PAY_ID_NAME}</p>
                            <p className="text-xs font-medium text-orange-400 truncate">{PAY_ID_EMAIL}</p>
                        </div>
                    </div>
                    <ol className="text-xs text-zinc-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                        <li>Open your banking app → <strong className="text-white">PayID transfer</strong></li>
                        <li>PayID email: <strong className="text-orange-400">{PAY_ID_EMAIL}</strong></li>
                        <li>Amount: <strong className="text-white">${(depositAmount || 0).toFixed(2)}</strong></li>
                        <li>Reference: <strong className="text-orange-400 font-mono">{bookingRef}</strong></li>
                        <li>Click <strong className="text-white">"Open Payment Form"</strong> below to confirm</li>
                    </ol>
                </div>
                {isPayIdModalOpen && (
                    <PayIDSimulationModal
                        amount={depositAmount}
                        totalAmount={totalCost}
                        performerNames={performers.map(p => p.name).join(', ')}
                        eventType={form.eventType}
                        eventDate={form.eventDate}
                        eventAddress={form.eventAddress}
                        bookingRef={bookingRef}
                        onPaymentSuccess={handlePaymentSuccess}
                        onClose={() => setIsPayIdModalOpen(false)}
                    />
                )}
            </StatusScreen>
        );
    }
    if (stage === 'deposit_confirmation_pending') {
        return <StatusScreen icon={LoaderCircle} title="Verifying Payment" bgColor="bg-blue-900/10" buttonText="Dashboard" onButtonClick={onBookingSubmitted} secondaryButtonText="Book Another Entertainer" onSecondaryClick={onBack} bookingRef={bookingRef}>Payment received. Admin is confirming.</StatusScreen>;
    }
    if (stage === 'confirmed') {
        return <StatusScreen icon={CheckCircle} title="Confirmed!" bgColor="bg-green-900/10" buttonText="View Bookings" onButtonClick={onBookingSubmitted} secondaryButtonText="Book Another Entertainer" onSecondaryClick={onBack} bookingRef={bookingRef}>Booking is locked in!</StatusScreen>;
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

            {isASAP && (
                <div className="mb-6 p-4 bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/40 rounded-xl flex items-center gap-4 animate-fade-in">
                    <div className="bg-orange-500 text-white p-3 rounded-xl flex-shrink-0">
                        <Zap className="h-6 w-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">ASAP Booking</h3>
                        <p className="text-sm text-orange-200/80">Performer arrives within {ASAP_MAX_ETA_MINUTES} minutes. {Math.round((ASAP_SURCHARGE_MULTIPLIER - 1) * 100)}% express surcharge applies.</p>
                    </div>
                </div>
            )}

            <ProgressIndicator currentStep={currentStep} steps={wizardSteps} onStepClick={(step) => { setCurrentStep(step); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />

            <div className="flex items-start gap-3 p-4 bg-blue-950/30 border border-blue-500/30 rounded-xl mb-6">
              <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-200/90 leading-relaxed">
                Our entertainers are independent freelancers and may become unavailable on short notice. If your chosen performer is unable to attend, we will suggest a suitable replacement for your approval.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="card-base !p-6 sm:!p-10 shadow-2xl border-zinc-800/50">
                        <ErrorDisplay message={error} />
                        
                        {currentStep === 1 && (
                            <div className="space-y-6 animate-fade-in">
                                <div><h2 className="text-2xl font-bold text-white mb-2">Client Details</h2><p className="text-zinc-400">Match these to your identification documents.</p></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <InputField icon={<User />} label="Legal Full Name" name="fullName" value={form.fullName} onChange={handleChange} required error={fieldErrors.fullName} />
                                    <InputField icon={<Mail />} label="Email Address" type="email" name="email" value={form.email} onChange={handleChange} required error={fieldErrors.email} />
                                    <InputField icon={<Phone />} label="Mobile Number" type="tel" name="mobile" value={form.mobile} onChange={handleChange} required error={fieldErrors.mobile} />
                                    <InputField icon={<Calendar />} label="Date of Birth" type="date" name="dob" value={form.dob} onChange={handleChange} required error={fieldErrors.dob} />
                                </div>
                                {isVerifiedBooker && <div className="p-4 bg-green-900/20 border border-green-500/50 rounded-lg flex items-center gap-3"><CheckCircle className="text-green-400" /> <p className="text-sm text-green-200">Verified Trusted Client detected. Verification skipped.</p></div>}
                                <div className="absolute opacity-0 h-0 overflow-hidden" aria-hidden="true" tabIndex={-1}>
                                    <input type="text" name="_hp" value={form._hp} onChange={handleChange} tabIndex={-1} autoComplete="off" />
                                </div>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-6 animate-fade-in">
                                <div><h2 className="text-2xl font-bold text-white mb-2">Event Details</h2><p className="text-zinc-400">Tell us about your event so we can match the right experience.</p></div>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <InputField icon={<Calendar />} label="Event Date" type="date" name="eventDate" min={todayStr} value={form.eventDate} onChange={handleChange} required error={fieldErrors.eventDate} />
                                    <InputField icon={<Clock />} label="Start Time" type="time" name="eventTime" value={form.eventTime} onChange={handleChange} required error={fieldErrors.eventTime} />
                                    <InputField icon={<UsersIcon />} label="Guest Count" type="number" name="numberOfGuests" value={form.numberOfGuests} onChange={handleChange} required error={fieldErrors.numberOfGuests} />
                                    <div className="md:col-span-2">
                                      <InputField icon={<MapPin />} label="Event Address" name="eventAddress" value={form.eventAddress} onChange={handleChange} required error={fieldErrors.eventAddress} placeholder="Full street address" />
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
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-6 animate-fade-in">
                                <div><h2 className="text-2xl font-bold text-white mb-2">Choose Services</h2><p className="text-zinc-400">Select the services you'd like for your event. Costs update in real-time.</p></div>
                                <div className="space-y-8">
                                     {(Object.entries(servicesByCategory) as [string, Service[]][]).map(([category, services]) => (
                                        <div key={category}>
                                            <h3 className="text-lg font-semibold text-orange-400 mb-4 flex items-center gap-2"><Briefcase size={18}/> {category}</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {services.map(service => {
                                                    const isSelected = form.selectedServices.includes(service.id);
                                                    return (
                                                        <div key={service.id} onClick={() => handleServiceChange(service.id)} className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex justify-between items-center group ${isSelected ? 'bg-orange-500/10 border-orange-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                                                            <div className="flex-1">
                                                                <p className={`font-bold ${isSelected ? 'text-orange-400' : 'text-zinc-200'}`}>{service.name}</p>
                                                                <p className="text-xs text-zinc-500">{service.description}</p>
                                                            </div>
                                                            <div className="ml-4 text-right flex flex-col items-end gap-1">
                                                                 <span className="text-sm font-bold block text-zinc-300">${service.rate}{service.rate_type === 'per_hour' ? '/hr' : ''}</span>
                                                                 {(service.duration_minutes || service.min_duration_hours) && (
                                                                   <span className="text-xs text-zinc-500 font-medium">
                                                                     {service.duration_minutes ? `${service.duration_minutes} mins` : `Min ${service.min_duration_hours} hr${service.min_duration_hours! > 1 ? 's' : ''}`}
                                                                   </span>
                                                                 )}
                                                                 {isSelected && <CheckCircle size={18} className="text-orange-400 inline mt-1" />}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                     ))}
                                </div>

                                {/* Per-service duration selectors for hourly services */}
                                {form.selectedServices.filter(id => allServices.find(s => s.id === id)?.rate_type === 'per_hour').length > 0 && (
                                    <div className="space-y-4 animate-fade-in">
                                        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                                            <Clock size={16} className="text-orange-400" />
                                            Set Duration for Each Service
                                        </h3>
                                        {form.selectedServices
                                            .map(id => allServices.find(s => s.id === id))
                                            .filter((s): s is Service => !!s && s.rate_type === 'per_hour')
                                            .map(service => (
                                                <div key={service.id} className="p-4 bg-zinc-900/70 border border-zinc-800 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-orange-400 text-sm">{service.name}</p>
                                                        <p className="text-xs text-zinc-500">${service.rate}/hr{service.min_duration_hours ? ` · Min ${service.min_duration_hours} hr${service.min_duration_hours > 1 ? 's' : ''}` : ''}</p>
                                                    </div>
                                                    <div className="relative w-full sm:w-40 flex-shrink-0">
                                                        <select
                                                            value={form.serviceDurations[service.id] || service.min_duration_hours || 2}
                                                            onChange={(e) => setForm(prev => ({
                                                                ...prev,
                                                                serviceDurations: { ...prev.serviceDurations, [service.id]: Number(e.target.value) }
                                                            }))}
                                                            className="input-base !pl-10 appearance-none !py-2 text-sm"
                                                        >
                                                            {[1, 1.5, 2, 2.5, 3, 4, 5, 6].filter(h => h >= (service.min_duration_hours || 1)).map(h => (
                                                                <option key={h} value={h}>{h} Hour{h !== 1 ? 's' : ''}</option>
                                                            ))}
                                                        </select>
                                                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                                                    </div>
                                                </div>
                                            ))
                                        }
                                    </div>
                                )}

                                <div className="mt-8"><label className="block text-sm font-medium text-zinc-400 mb-2">Special Notes (Optional)</label><textarea name="client_message" value={form.client_message} onChange={handleChange} className="input-base h-24 resize-none" /></div>
                            </div>
                        )}

                        {currentStep === 4 && (
                            <div className="space-y-8 animate-fade-in">
                                <div className="mb-6"><h2 className="text-2xl font-bold text-white mb-2">Safety Verification</h2><p className="text-zinc-400">To protect our performers, we require all new clients to verify their identity.</p></div>
                                {isVerifiedBooker ? (
                                   <div className="p-8 bg-green-900/20 border border-green-500/50 rounded-2xl text-center space-y-4"><CheckCircle className="h-16 w-16 text-green-500 mx-auto" /><h3 className="text-2xl font-bold text-white">Verified Trust Status</h3><p className="text-green-200">You are pre-cleared for this booking. Proceed to confirmation.</p></div>
                                ) : (
                                   <div className="space-y-6">
                                        <div className="p-4 bg-blue-950/40 border border-blue-500/50 rounded-xl flex items-start gap-4">
                                            <Shield className="h-6 w-6 text-blue-400 mt-1 flex-shrink-0" />
                                            <div>
                                                <h4 className="font-bold text-blue-300">Identity Verification Required</h4>
                                                <p className="text-sm text-blue-200/80 leading-relaxed mt-1">
                                                    We use Didit to securely verify your identity. This process is quick and ensures the safety of our performers.
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-zinc-700 rounded-2xl bg-zinc-900/50">
                                            {isDiditVerified ? (
                                                <div className="text-center animate-fade-in">
                                                    <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                                                    <h3 className="text-xl font-bold text-white mb-2">Identity Verified</h3>
                                                    <p className="text-zinc-400">Your identity has been successfully verified via Didit.</p>
                                                </div>
                                            ) : (
                                                <div className="text-center">
                                                    <ShieldCheck className="h-16 w-16 text-zinc-600 mx-auto mb-4" />
                                                    <h3 className="text-xl font-bold text-white mb-4">Verify Your Identity</h3>
                                                    <button
                                                        onClick={() => setShowDiditModal(true)}
                                                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl transition-colors flex items-center gap-2 mx-auto"
                                                    >
                                                        <Shield size={20} />
                                                        Verify with Didit
                                                    </button>
                                                    {fieldErrors.didit && (
                                                        <p className="text-red-400 text-sm mt-4 font-medium animate-slide-in-up">
                                                            {fieldErrors.didit}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-4 pt-6 border-t border-zinc-800">
                                             <label className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-700 rounded-xl cursor-pointer hover:bg-zinc-800 transition-colors">
                                                <input type="checkbox" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} className="h-6 w-6 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500" />
                                                <span className="text-sm text-zinc-300">I agree to the <a href="#" onClick={(e) => { e.preventDefault(); onShowTermsOfService(); }} className="text-orange-400 underline">Terms</a> & <a href="#" onClick={(e) => { e.preventDefault(); onShowPrivacyPolicy(); }} className="text-orange-400 underline">Privacy Policy</a>. I am 18+.</span>
                                            </label>
                                            {fieldErrors.agreedTerms && <p className="text-xs text-red-400 font-medium pl-1">Agreement required.</p>}
                                        </div>
                                   </div>
                                )}
                            </div>
                        )}

                        <div className="mt-12 pt-8 border-t border-zinc-800 flex flex-col sm:flex-row gap-4 items-center justify-between">
                            <div className="flex items-center gap-2">
                                {wizardSteps.map((step, idx) => (
                                    <div key={step.id} className={`h-1.5 rounded-full transition-all duration-300 ${step.id === currentStep ? 'w-8 bg-orange-500' : step.id < currentStep ? 'w-4 bg-orange-500/50' : 'w-4 bg-zinc-700'}`} />
                                ))}
                            </div>
                            <div className="flex gap-3 w-full sm:w-auto">
                                <button onClick={handleBack} disabled={isSubmitting} className="flex-1 sm:flex-none px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl transition-colors border border-zinc-700">{currentStep === 1 ? 'Cancel' : 'Back'}</button>
                                <button onClick={handleNext} disabled={isSubmitting} className="flex-1 sm:flex-none btn-primary px-8 py-3 flex items-center justify-center gap-2 text-base">
                                    {isSubmitting ? <LoaderCircle className="animate-spin" size={18} /> : currentStep === 4 ? <Send size={18} /> : null}
                                    {isSubmitting ? 'Processing...' : currentStep === 4 ? 'Review & Submit' : 'Continue'}
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
                            serviceDurations={form.serviceDurations}
                            performers={performers} 
                            onClearAll={currentStep === 3 ? handleClearAll : undefined}
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
                                        <span className="text-zinc-200">{formattedTotalDuration}</span>
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

            <BookingConfirmationDialog isOpen={isConfirmDialogOpen} onClose={() => setIsConfirmDialogOpen(false)} onConfirm={handleFinalSubmission} isLoading={isSubmitting} bookingDetails={{ performers, eventDate: form.eventDate, eventTime: form.eventTime, eventAddress: form.eventAddress, selectedServices: form.selectedServices.map(id => allServices.find(s => s.id === id)?.name || id), eventDuration: formattedTotalDuration, totalCost, depositAmount }} />
            
            {showDiditModal && (
                <DiditVerification
                    clientName={form.fullName || 'Guest'}
                    onSuccess={(verificationId: string) => {
                        setIsDiditVerified(true);
                        setShowDiditModal(false);
                        setForm(prev => ({ ...prev, didit_verification_id: verificationId }));
                        setFieldErrors(prev => {
                            const newErrors = { ...prev };
                            delete newErrors.didit;
                            return newErrors;
                        });
                    }}
                    onCancel={() => setShowDiditModal(false)}
                />
            )}
        </div>
    );
};

export default BookingProcess;
