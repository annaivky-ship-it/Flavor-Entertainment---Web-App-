import React, { useState, useMemo, useEffect } from 'react';
import { api } from '../services/api';
import type { Performer, Booking, BookingStatus, DoNotServeEntry, Communication, Service } from '../types';
import { allServices } from '../data/mockData';
import { DEPOSIT_PERCENTAGE, EVENT_TYPES } from '../constants';
import { getBookingDurationInfo, calculateBookingCost } from '../utils/bookingUtils';
import InputField from './InputField';
import BookingCostCalculator from './BookingCostCalculator';
import BookingConfirmationDialog from './BookingConfirmationDialog';
import PayIDSimulationModal from './PayIDSimulationModal';
import FrankieOneVerification from './FrankieOneVerification';
import { httpsCallable } from 'firebase/functions';
import { functions as firebaseFunctions } from '../services/firebaseClient';
import { ArrowLeft, User, Mail, Phone, Calendar, Clock, MapPin, PartyPopper, UploadCloud, ShieldCheck, Send, ListChecks, Info, AlertTriangle, ShieldX, CheckCircle, ChevronDown, FileText, LoaderCircle, Users as UsersIcon, Shield, Camera, Wallet, Briefcase, KeyRound, RefreshCw } from 'lucide-react';

export interface BookingFormState {
  fullName: string;
  email: string;
  mobile: string;
  dob: string;
  eventDate: string;
  eventTime: string;
  eventAddress: string;
  eventType: string;
  duration: string; // This will now represent the total duration
  serviceDurations: Record<string, number>; // serviceId -> duration in hours
  numberOfGuests: string;
  selectedServices: string[];
  idDocument: File | null;
  selfieDocument: File | null;
  client_message: string;
}

interface BookingProcessProps {
  performers: Performer[];
  onBack: () => void;
  onBookingSubmitted: () => void;
  bookings: Booking[];
  onUpdateBookingStatus?: (bookingId: string, status: BookingStatus) => Promise<void>;
  onBookingRequest: (formState: BookingFormState, performers: Performer[], otpSessionId?: string | null) => Promise<{success: boolean; message: string; bookingIds?: string[]}>;
  doNotServeList: DoNotServeEntry[];
  addCommunication: (commData: Omit<Communication, 'id' | 'created_at' | 'read'>) => Promise<void>;
  onShowPrivacyPolicy: () => void;
  onShowTermsOfService: () => void;
  initialSelectedServices?: string[];
}

type BookingStage = 'form' | 'performer_acceptance_pending' | 'vetting_pending' | 'deposit_pending' | 'deposit_confirmation_pending' | 'confirmed' | 'rejected';


const eventTypes = EVENT_TYPES;

interface FileUploadFieldProps {
  file: File | null;
  setFile: (f: File | null) => void;
  id: string;
  label: string;
  accept: string;
  error?: string;
  icon?: React.ReactNode;
}

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const FileUploadField: React.FC<FileUploadFieldProps> = ({ file, setFile, id, label, accept, error, icon }) => {
    const [internalError, setInternalError] = useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        if (!ALLOWED_IMAGE_MIME_TYPES.has(selectedFile.type)) {
            setInternalError('Only JPG, PNG, WebP, or GIF images are allowed.');
            setFile(null);
            e.target.value = '';
            return;
        }
        if (selectedFile.size > 10 * 1024 * 1024) {
            setInternalError('File size must be under 10MB.');
            setFile(null);
            e.target.value = '';
            return;
        }
        setInternalError('');
        setFile(selectedFile);
    };

    const displayError = internalError || error;

    return (
        <div className="flex-1 min-w-[280px]">
            <label htmlFor={id} className="block text-sm font-semibold text-zinc-300 mb-2">{label}</label>
            <div className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition-all duration-300 ${displayError ? 'border-red-500 bg-red-900/10' : file ? 'border-green-500 bg-green-900/10' : 'border-zinc-700 bg-zinc-900/50 hover:border-orange-500 hover:bg-zinc-800/50'}`}>
                {file ? (
                  <div className="text-center animate-fade-in">
                    <CheckCircle className="mx-auto h-10 w-10 text-green-500 mb-2" />
                    <p className="text-sm font-bold text-white truncate max-w-[200px]">{file.name}</p>
                    <button onClick={() => setFile(null)} className="text-xs text-zinc-500 hover:text-red-400 mt-2 underline">Remove</button>
                  </div>
                ) : (
                  <div className="text-center">
                      {icon || <UploadCloud className={`mx-auto h-10 w-10 ${displayError ? 'text-red-400' : 'text-zinc-500'}`} />}
                      <div className="mt-3 flex flex-col text-sm leading-6 text-zinc-400">
                          <label htmlFor={id} className="relative cursor-pointer rounded-md font-semibold text-orange-500 hover:text-orange-400 transition-colors">
                              <span>Upload Photo</span>
                              <input id={id} name={id} type="file" className="sr-only" onChange={handleFileChange} accept={accept} />
                          </label>
                          <p className="text-xs text-zinc-500">JPG, PNG up to 10MB</p>
                      </div>
                  </div>
                )}
            </div>
            {displayError && <p className="text-xs mt-2 text-red-400 font-medium animate-slide-in-up">{displayError}</p>}
        </div>
    );
};

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
    { id: 1, name: 'Client Details', icon: User },
    { id: 2, name: 'Event Details', icon: Calendar },
    { id: 3, name: 'Services', icon: ListChecks },
    { id: 4, name: 'Identity & Safety', icon: ShieldCheck },
];

const ProgressIndicator: React.FC<{ currentStep: number }> = ({ currentStep }) => (
    <nav aria-label="Progress">
        <ol role="list" className="space-y-4 md:flex md:space-x-8 md:space-y-0 mb-10">
            {wizardSteps.map((step) => {
                const isCompleted = currentStep > step.id;
                const isCurrent = currentStep === step.id;

                return (
                    <li key={step.name} className="md:flex-1">
                        <div className={`group flex flex-col border-l-4 py-2 pl-4 transition-colors md:border-l-0 md:border-t-4 md:pl-0 md:pt-4 md:pb-0 ${isCompleted ? 'border-orange-500' : isCurrent ? 'border-orange-500' : 'border-zinc-700'}`}>
                            <span className={`text-sm font-medium transition-colors ${isCompleted ? 'text-orange-400' : isCurrent ? 'text-orange-400' : 'text-zinc-400'}`}>
                                Step {step.id}
                            </span>
                            <span className="text-sm font-medium text-white">{step.name}</span>
                        </div>
                    </li>
                );
            })}
        </ol>
    </nav>
);


const BookingProcess: React.FC<BookingProcessProps> = ({ performers, onBack, onBookingSubmitted, bookings, onUpdateBookingStatus, onBookingRequest, doNotServeList, addCommunication, onShowPrivacyPolicy, onShowTermsOfService, initialSelectedServices = [] }) => {
    const [stage, setStage] = useState<BookingStage>('form');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [form, setForm] = useState<BookingFormState>({
        fullName: '', 
        email: '', 
        mobile: '', 
        dob: '', 
        eventDate: '', 
        eventTime: '', 
        eventAddress: '', 
        eventType: '', 
        duration: '2', 
        serviceDurations: initialSelectedServices.reduce((acc, id) => {
            const s = allServices.find(srv => srv.id === id);
            acc[id] = s?.rate_type === 'per_hour' ? (s.min_duration_hours || 2) : 0;
            return acc;
        }, {} as Record<string, number>),
        numberOfGuests: '', 
        selectedServices: initialSelectedServices, 
        idDocument: null, 
        selfieDocument: null, 
        client_message: ''
    });
    const [bookingIds, setBookingIds] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [agreedTerms, setAgreedTerms] = useState(false);
    const [isVerifiedBooker, setIsVerifiedBooker] = useState(false);
    const [isFrankieOneVerified, setIsFrankieOneVerified] = useState(false);
    const [showFrankieOneModal, setShowFrankieOneModal] = useState(false);
    const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
    const [isPayIdModalOpen, setIsPayIdModalOpen] = useState(false);

    // --- Returning-client OTP bypass state ---
    // Phase transitions: idle → checking → (otp_sending → otp_required | full_kyc) → (otp_verifying → bypassed | otp_required)
    type VerificationPhase = 'idle' | 'checking' | 'otp_sending' | 'otp_required' | 'otp_verifying' | 'bypassed' | 'full_kyc';
    const [verificationPhase, setVerificationPhase] = useState<VerificationPhase>('idle');
    const [otpSessionId, setOtpSessionId] = useState<string | null>(null);
    const [otpCode, setOtpCode] = useState('');
    const [otpError, setOtpError] = useState('');
    // True after a successful OTP bypass — skips FrankieOne in step 4.
    const [isReturningClientVerified, setIsReturningClientVerified] = useState(false);

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
        if (bookingIds.length === 0) return;

        const unsubscribe = api.subscribeToBooking(bookingIds[0], (booking) => {
            if (!booking) return;
            const currentStatus = booking.status;

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
            const isSelected = prev.selectedServices.includes(serviceId);
            const selectedServices = isSelected
                ? prev.selectedServices.filter(s => s !== serviceId)
                : [...prev.selectedServices, serviceId];
            
            const serviceDurations = { ...prev.serviceDurations };
            if (isSelected) {
                delete serviceDurations[serviceId];
            } else {
                const service = allServices.find(s => s.id === serviceId);
                serviceDurations[serviceId] = service?.rate_type === 'per_hour' ? (service.min_duration_hours || 2) : 0;
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

    const handleServiceDurationChange = (serviceId: string, duration: number) => {
        setForm(prev => ({
            ...prev,
            serviceDurations: {
                ...prev.serviceDurations,
                [serviceId]: duration
            }
        }));
    };
    
    // -------------------------------------------------------------------------
    // Returning-client eligibility check + OTP handlers
    // -------------------------------------------------------------------------

    const runEligibilityCheck = async () => {
        setVerificationPhase('checking');
        setError(null);

        try {
            if (!firebaseFunctions) throw new Error('Firebase not configured');

            const checkFn = httpsCallable<
                { client_email: string; client_phone: string; booking_context: { amount_total_due: number } },
                { eligible: boolean; reason: string; requiresOtp: boolean }
            >(firebaseFunctions, 'checkReturningClientEligibility');

            const result = await checkFn({
                client_email: form.email,
                client_phone: form.mobile,
                booking_context: { amount_total_due: totalCost },
            });

            if (result.data.eligible && result.data.requiresOtp) {
                setVerificationPhase('otp_sending');

                const startFn = httpsCallable<
                    { client_email: string; client_phone: string },
                    { otpSessionId: string }
                >(firebaseFunctions, 'startReturningClientOtp');

                const otpResult = await startFn({ client_email: form.email, client_phone: form.mobile });
                setOtpSessionId(otpResult.data.otpSessionId);
                setOtpCode('');
                setOtpError('');
                setVerificationPhase('otp_required');
            } else {
                // Not eligible — proceed with full KYC path.
                setVerificationPhase('full_kyc');
                setCurrentStep(2);
                window.scrollTo(0, 0);
            }
        } catch (err: any) {
            // If Firebase isn't configured (dev mode) or the function is
            // unavailable, fall back gracefully to the full KYC path.
            console.warn('[ReturningClient] Eligibility check failed, falling back to full KYC:', err?.message);
            setVerificationPhase('full_kyc');
            setCurrentStep(2);
            window.scrollTo(0, 0);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otpSessionId || !otpCode.trim()) return;

        setVerificationPhase('otp_verifying');
        setOtpError('');

        try {
            if (!firebaseFunctions) throw new Error('Firebase not configured');

            const verifyFn = httpsCallable<
                { otpSessionId: string; otp: string; client_email: string; client_phone: string },
                { verified: boolean }
            >(firebaseFunctions, 'verifyReturningClientOtp');

            await verifyFn({
                otpSessionId,
                otp: otpCode.trim(),
                client_email: form.email,
                client_phone: form.mobile,
            });

            setIsReturningClientVerified(true);
            setVerificationPhase('bypassed');
            setCurrentStep(2);
            window.scrollTo(0, 0);
        } catch {
            setOtpError('Verification failed. Please check your code and try again.');
            setVerificationPhase('otp_required');
        }
    };

    const handleResendOtp = async () => {
        if (!firebaseFunctions) return;
        setOtpCode('');
        setOtpError('');
        setVerificationPhase('otp_sending');

        try {
            const startFn = httpsCallable<
                { client_email: string; client_phone: string },
                { otpSessionId: string }
            >(firebaseFunctions, 'startReturningClientOtp');

            const result = await startFn({ client_email: form.email, client_phone: form.mobile });
            setOtpSessionId(result.data.otpSessionId);
            setVerificationPhase('otp_required');
        } catch (err: any) {
            setOtpError(err?.message || 'Could not resend code. Please try again.');
            setVerificationPhase('otp_required');
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
        return calculateBookingCost(form.serviceDurations, performers.length);
    }, [form.serviceDurations, performers.length]);
    
    const { formattedTotalDuration, totalDurationMinutes } = useMemo(() => getBookingDurationInfo(form.serviceDurations), [form.serviceDurations]);

    // Sync total duration back to form.duration for backend compatibility
    useEffect(() => {
        const totalHours = totalDurationMinutes / 60;
        setForm(prev => ({ ...prev, duration: totalHours.toFixed(2) }));
    }, [totalDurationMinutes]);

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
                if (!form.eventDate) errors.eventDate = "Date required.";
                if (!form.eventTime) errors.eventTime = "Time required.";
                if (!form.eventAddress.trim()) errors.eventAddress = "Address required.";
                if (!form.eventType) errors.eventType = "Event type required.";
                if (!form.numberOfGuests) errors.numberOfGuests = "Guest count required.";
                break;
            case 3:
                if (form.selectedServices.length === 0) errors.selectedServices = "Select at least one service.";
                break;
            case 4:
                // Skip all identity checks if client passed the OTP bypass.
                if (!isReturningClientVerified && !isVerifiedBooker) {
                    if (!isFrankieOneVerified) errors.frankieOne = "Identity verification is required.";
                    if (!agreedTerms) errors.agreedTerms = "Agreement required.";
                }
                break;
        }

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleNext = async () => {
        if (currentStep === 1) {
            // --- Step 1: run the returning-client eligibility check before advancing ---
            if (verificationPhase === 'idle') {
                if (!validateStep(1)) return;
                await runEligibilityCheck();
                return;
            }
            if (verificationPhase === 'bypassed') {
                // OTP already verified; just advance.
                setCurrentStep(2);
                window.scrollTo(0, 0);
                return;
            }
            // During checking / otp_sending / otp_required / otp_verifying: ignore clicks.
            return;
        }

        if (validateStep(currentStep)) {
            if (currentStep < 4) {
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
            // Pass the otpSessionId so the Cloud Function can atomically claim
            // the OTP session and set kyc_bypass_reason = 'RETURNING_VERIFIED'.
            const result = await onBookingRequest(form, performers, isReturningClientVerified ? otpSessionId : null);
            if (result.success && result.bookingIds) {
                setBookingIds(result.bookingIds);
            } else {
                setError(result.message);
            }
        } catch (err: any) {
            setError(err.message || 'Submission failed.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePaymentSuccess = async () => {
       setIsPayIdModalOpen(false);
       if(bookingIds.length > 0) {
          await onUpdateBookingStatus?.(bookingIds[0], 'pending_deposit_confirmation');
          setStage('deposit_confirmation_pending');
       }
    };

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
                {isPayIdModalOpen && (
                    <PayIDSimulationModal 
                        amount={depositAmount} 
                        totalAmount={totalCost} 
                        performerNames={performers.map(p => p.name).join(', ')} 
                        eventType={form.eventType} 
                        eventDate={form.eventDate}
                        eventAddress={form.eventAddress}
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
                        <ErrorDisplay message={error} />
                        
                        {currentStep === 1 && (verificationPhase === 'idle' || verificationPhase === 'full_kyc') && (
                            <div className="space-y-6 animate-fade-in">
                                <div><h2 className="text-2xl font-bold text-white mb-2">Client Details</h2><p className="text-zinc-400">Match these to your identification documents.</p></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <InputField icon={<User />} label="Legal Full Name" name="fullName" value={form.fullName} onChange={handleChange} required error={fieldErrors.fullName} />
                                    <InputField icon={<Mail />} label="Email Address" type="email" name="email" value={form.email} onChange={handleChange} required error={fieldErrors.email} />
                                    <InputField icon={<Phone />} label="Mobile Number" type="tel" name="mobile" value={form.mobile} onChange={handleChange} required error={fieldErrors.mobile} />
                                    <InputField icon={<Calendar />} label="Date of Birth" type="date" name="dob" value={form.dob} onChange={handleChange} required error={fieldErrors.dob} />
                                </div>
                                {isVerifiedBooker && <div className="p-4 bg-green-900/20 border border-green-500/50 rounded-lg flex items-center gap-3"><CheckCircle className="text-green-400" /> <p className="text-sm text-green-200">Verified Trusted Client detected. Verification skipped.</p></div>}
                            </div>
                        )}

                        {/* --- Checking eligibility spinner --- */}
                        {currentStep === 1 && verificationPhase === 'checking' && (
                            <div className="flex flex-col items-center justify-center py-16 space-y-4 animate-fade-in">
                                <LoaderCircle className="h-12 w-12 animate-spin text-orange-500" />
                                <p className="text-zinc-400 text-sm">Checking your account status…</p>
                            </div>
                        )}

                        {/* --- OTP sending spinner --- */}
                        {currentStep === 1 && verificationPhase === 'otp_sending' && (
                            <div className="flex flex-col items-center justify-center py-16 space-y-4 animate-fade-in">
                                <LoaderCircle className="h-12 w-12 animate-spin text-orange-500" />
                                <p className="text-zinc-400 text-sm">Sending your verification code…</p>
                            </div>
                        )}

                        {/* --- OTP entry UI --- */}
                        {currentStep === 1 && (verificationPhase === 'otp_required' || verificationPhase === 'otp_verifying') && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="p-6 bg-orange-950/30 border border-orange-500/40 rounded-2xl text-center space-y-3">
                                    <KeyRound className="h-10 w-10 text-orange-400 mx-auto" />
                                    <h3 className="text-xl font-bold text-white">Welcome back — your verification is still valid.</h3>
                                    <p className="text-sm text-zinc-300 leading-relaxed">
                                        Please confirm with the one-time code sent to your mobile number ending in&nbsp;
                                        <span className="font-mono font-bold text-orange-400">
                                            {form.mobile.replace(/\d(?=\d{4})/g, '*')}
                                        </span>.
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <label className="block text-sm font-semibold text-zinc-300">
                                        Verification Code
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                        value={otpCode}
                                        onChange={(e) => {
                                            setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                                            if (otpError) setOtpError('');
                                        }}
                                        placeholder="• • • • • •"
                                        className="input-base text-center text-2xl tracking-widest font-mono w-full"
                                        disabled={verificationPhase === 'otp_verifying'}
                                    />
                                    {otpError && (
                                        <p className="text-sm text-red-400 font-medium animate-slide-in-up">{otpError}</p>
                                    )}
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3">
                                    <button
                                        onClick={handleVerifyOtp}
                                        disabled={otpCode.length < 6 || verificationPhase === 'otp_verifying'}
                                        className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {verificationPhase === 'otp_verifying'
                                            ? <><LoaderCircle className="animate-spin h-4 w-4" /> Verifying…</>
                                            : <><ShieldCheck size={18} /> Confirm Code</>
                                        }
                                    </button>
                                    <button
                                        onClick={handleResendOtp}
                                        disabled={verificationPhase === 'otp_verifying'}
                                        className="flex-1 sm:flex-none px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <RefreshCw size={16} /> Resend
                                    </button>
                                </div>

                                <button
                                    onClick={() => { setVerificationPhase('full_kyc'); setCurrentStep(2); window.scrollTo(0, 0); }}
                                    className="text-xs text-zinc-500 hover:text-zinc-300 underline block text-center transition-colors"
                                    disabled={verificationPhase === 'otp_verifying'}
                                >
                                    Skip — use full identity verification instead
                                </button>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-6 animate-fade-in">
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <InputField icon={<Calendar />} label="Event Date" type="date" name="eventDate" min={todayStr} value={form.eventDate} onChange={handleChange} required error={fieldErrors.eventDate} />
                                    <InputField icon={<Clock />} label="Start Time" type="time" name="eventTime" value={form.eventTime} onChange={handleChange} required error={fieldErrors.eventTime} />
                                    <InputField icon={<UsersIcon />} label="Guest Count" type="number" name="numberOfGuests" value={form.numberOfGuests} onChange={handleChange} required error={fieldErrors.numberOfGuests} />
                                    <InputField icon={<MapPin />} label="Event Address" name="eventAddress" value={form.eventAddress} onChange={handleChange} required error={fieldErrors.eventAddress} />
                                    <div className="md:col-span-2">
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
                                <div className="space-y-8">
                                     {(Object.entries(servicesByCategory) as [string, Service[]][]).map(([category, services]) => (
                                        <div key={category}>
                                            <h3 className="text-lg font-semibold text-orange-400 mb-4 flex items-center gap-2"><Briefcase size={18}/> {category}</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {services.map(service => {
                                                    const isSelected = form.selectedServices.includes(service.id);
                                                    return (
                                                        <div key={service.id} className="space-y-3">
                                                            <div onClick={() => handleServiceChange(service.id)} className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex justify-between items-center group ${isSelected ? 'bg-orange-500/10 border-orange-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
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
                                                            
                                                            {isSelected && service.rate_type === 'per_hour' && (
                                                                <div className="px-4 pb-4 animate-slide-in-up">
                                                                    <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-2">Duration for {service.name}</label>
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="relative flex-1">
                                                                            <select 
                                                                                value={form.serviceDurations[service.id]} 
                                                                                onChange={(e) => handleServiceDurationChange(service.id, Number(e.target.value))}
                                                                                className="input-base !py-2 !text-sm appearance-none !pl-10"
                                                                            >
                                                                                {[1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8].map(h => (
                                                                                    <option key={h} value={h}>{h} Hour{h !== 1 ? 's' : ''}</option>
                                                                                ))}
                                                                            </select>
                                                                            <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-500/70" />
                                                                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                                                                        </div>
                                                                        <div className="text-xs font-bold text-orange-400 bg-orange-500/10 px-3 py-2 rounded-lg border border-orange-500/20">
                                                                            ${(service.rate * (form.serviceDurations[service.id] || 0)).toFixed(2)}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                     ))}
                                </div>
                                <div className="mt-8"><label className="block text-sm font-medium text-zinc-400 mb-2">Special Notes (Optional)</label><textarea name="client_message" value={form.client_message} onChange={handleChange} className="input-base h-24 resize-none" /></div>
                            </div>
                        )}

                        {currentStep === 4 && (
                            <div className="space-y-8 animate-fade-in">
                                <div className="mb-6"><h2 className="text-2xl font-bold text-white mb-2">Safety Verification</h2><p className="text-zinc-400">To protect our performers, we require all new clients to verify their identity.</p></div>
                                {isReturningClientVerified ? (
                                   <div className="p-8 bg-orange-900/20 border border-orange-500/50 rounded-2xl text-center space-y-4">
                                       <ShieldCheck className="h-16 w-16 text-orange-400 mx-auto" />
                                       <h3 className="text-2xl font-bold text-white">Identity Verified — Welcome Back</h3>
                                       <p className="text-orange-200">Your previous verification is on record and confirmed via one-time code. No further steps required — proceed to confirmation.</p>
                                   </div>
                                ) : isVerifiedBooker ? (
                                   <div className="p-8 bg-green-900/20 border border-green-500/50 rounded-2xl text-center space-y-4"><CheckCircle className="h-16 w-16 text-green-500 mx-auto" /><h3 className="text-2xl font-bold text-white">Verified Trust Status</h3><p className="text-green-200">You are pre-cleared for this booking. Proceed to confirmation.</p></div>
                                ) : (
                                   <div className="space-y-6">
                                        <div className="p-4 bg-blue-950/40 border border-blue-500/50 rounded-xl flex items-start gap-4">
                                            <Shield className="h-6 w-6 text-blue-400 mt-1 flex-shrink-0" />
                                            <div>
                                                <h4 className="font-bold text-blue-300">Identity Verification Required</h4>
                                                <p className="text-sm text-blue-200/80 leading-relaxed mt-1">
                                                    We use FrankieOne to securely verify your identity. This process is quick and ensures the safety of our performers.
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-zinc-700 rounded-2xl bg-zinc-900/50">
                                            {isFrankieOneVerified ? (
                                                <div className="text-center animate-fade-in">
                                                    <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                                                    <h3 className="text-xl font-bold text-white mb-2">Identity Verified</h3>
                                                    <p className="text-zinc-400">Your identity has been successfully verified via FrankieOne.</p>
                                                </div>
                                            ) : (
                                                <div className="text-center">
                                                    <ShieldCheck className="h-16 w-16 text-zinc-600 mx-auto mb-4" />
                                                    <h3 className="text-xl font-bold text-white mb-4">Verify Your Identity</h3>
                                                    <button
                                                        onClick={() => setShowFrankieOneModal(true)}
                                                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl transition-colors flex items-center gap-2 mx-auto"
                                                    >
                                                        <Shield size={20} />
                                                        Verify with FrankieOne
                                                    </button>
                                                    {fieldErrors.frankieOne && (
                                                        <p className="text-red-400 text-sm mt-4 font-medium animate-slide-in-up">
                                                            {fieldErrors.frankieOne}
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
                            <div className="text-sm text-zinc-500">Step {currentStep} of 4</div>
                            <div className="flex gap-4 w-full sm:w-auto">
                                <button
                                    onClick={handleBack}
                                    disabled={isSubmitting || verificationPhase === 'otp_verifying' || verificationPhase === 'checking' || verificationPhase === 'otp_sending'}
                                    className="flex-1 sm:flex-none px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {currentStep === 1 ? 'Cancel' : 'Back'}
                                </button>
                                {/* Hide the Continue button while the OTP UI has its own action buttons */}
                                {!(currentStep === 1 && (verificationPhase === 'otp_required' || verificationPhase === 'otp_verifying' || verificationPhase === 'otp_sending' || verificationPhase === 'checking')) && (
                                    <button
                                        onClick={handleNext}
                                        disabled={isSubmitting}
                                        className="flex-1 sm:flex-none btn-primary px-8 py-3 flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? <LoaderCircle className="animate-spin" /> : currentStep === 4 ? <Send size={18} /> : null}
                                        {isSubmitting ? 'Processing...' : currentStep === 4 ? 'Review Request' : 'Continue'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1 space-y-6">
                    <div className="sticky top-8">
                        <BookingCostCalculator 
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
                                        <span className="text-zinc-500">Total Duration:</span>
                                        <span className="text-zinc-200 font-bold">{formattedTotalDuration}</span>
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
            
            {showFrankieOneModal && (
                <FrankieOneVerification 
                    clientName={form.fullName || 'Guest'}
                    onSuccess={() => {
                        setIsFrankieOneVerified(true);
                        setShowFrankieOneModal(false);
                        setFieldErrors(prev => {
                            const newErrors = { ...prev };
                            delete newErrors.frankieOne;
                            return newErrors;
                        });
                    }}
                    onCancel={() => setShowFrankieOneModal(false)}
                />
            )}
        </div>
    );
};

export default BookingProcess;