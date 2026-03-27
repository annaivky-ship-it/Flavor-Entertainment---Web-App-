import React, { useState, useMemo, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseClient';
import type { Performer, Booking, BookingStatus, DoNotServeEntry, Communication, Service } from '../types';
import { allServices } from '../data/mockData';
import { getBookingDurationInfo, calculateBookingCost } from '../utils/bookingUtils';
import InputField from './InputField';
import BookingCostCalculator from './BookingCostCalculator';
import BookingConfirmationDialog from './BookingConfirmationDialog';
import PayIDSimulationModal from './PayIDSimulationModal';
import { ArrowLeft, User, Mail, Phone, Calendar, Clock, MapPin, PartyPopper, ShieldCheck, Send, ListChecks, Info, AlertTriangle, ShieldX, CheckCircle, ChevronDown, LoaderCircle, Users as UsersIcon, Shield, Wallet, Briefcase, Navigation } from 'lucide-react';
import { api } from '../services/api';
import DiditVerification from './DiditVerification';
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

type BookingStage = 'form' | 'kyc_verifying' | 'performer_acceptance_pending' | 'vetting_pending' | 'deposit_pending' | 'deposit_confirmation_pending' | 'confirmed' | 'rejected';


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


const BookingProcess: React.FC<BookingProcessProps> = ({ performers, onBack, onBookingSubmitted, bookings, onUpdateBookingStatus, onBookingRequest, doNotServeList, addCommunication: _addCommunication, onShowPrivacyPolicy, onShowTermsOfService, initialSelectedServices = [] }) => {
    const [stage, setStage] = useState<BookingStage>('form');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [form, setForm] = useState<BookingFormState>({
        fullName: '', email: '', mobile: '', dob: '', eventDate: '', eventTime: '', eventAddress: '', eventSuburb: '', eventType: '', duration: '2', numberOfGuests: '', selectedServices: initialSelectedServices, client_message: ''
    });
    const [bookingIds, setBookingIds] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [agreedTerms, setAgreedTerms] = useState(false);
    const [isVerifiedBooker, setIsVerifiedBooker] = useState(false);
    const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
    const [kycVerificationUrl, setKycVerificationUrl] = useState<string | null>(null);
    const [isPayIdModalOpen, setIsPayIdModalOpen] = useState(false);

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
        return calculateBookingCost(Number(form.duration), form.selectedServices, performers.length, form.eventSuburb || undefined);
    }, [form.selectedServices, form.duration, performers.length, form.eventSuburb]);

    const { formattedTotalDuration } = useMemo(() => getBookingDurationInfo(Number(form.duration), form.selectedServices), [form.duration, form.selectedServices]);

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
                if (!form.eventSuburb) errors.eventSuburb = "Suburb required.";
                if (!form.eventType) errors.eventType = "Event type required.";
                if (!form.numberOfGuests) errors.numberOfGuests = "Guest count required.";
                // Client-side conflict detection
                if (form.eventDate && form.eventTime && !errors.eventDate && !errors.eventTime) {
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
                break;
            case 3:
                if (form.selectedServices.length === 0) errors.selectedServices = "Select at least one service.";
                break;
            case 4:
                if (!isVerifiedBooker) {
                    if (!agreedTerms) errors.agreedTerms = "Agreement required.";
                }
                break;
        }

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleNext = () => {
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
            const result = await onBookingRequest(form, performers);
            if (result.success && result.bookingIds) {
                setBookingIds(result.bookingIds);

                if (!isVerifiedBooker) {
                    const diditRes = await api.initializeDiditSession(result.bookingIds[0]);
                    if (diditRes.verificationUrl) {
                        setKycVerificationUrl(diditRes.verificationUrl);
                        setStage('kyc_verifying');
                        setIsSubmitting(false);
                        return;
                    } else {
                        throw new Error(diditRes.error?.message || "Failed to connect to Didit.");
                    }
                }
            } else {
                setError(result.message);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Submission failed.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePaymentSuccess = async () => {
        setIsPayIdModalOpen(false);
        if (bookingIds.length > 0) {
            await onUpdateBookingStatus?.(bookingIds[0], 'pending_deposit_confirmation');
            setStage('deposit_confirmation_pending');
        }
    };

    if (stage === 'kyc_verifying' && kycVerificationUrl && bookingIds.length > 0) {
        return (
            <DiditVerification
                verificationUrl={kycVerificationUrl}
                bookingId={bookingIds[0]}
                clientName={form.fullName}
                onSuccess={() => {
                    setKycVerificationUrl(null);
                    setStage('performer_acceptance_pending');
                    onBookingSubmitted?.();
                }}
                onCancel={() => {
                    setKycVerificationUrl(null);
                    setStage('performer_acceptance_pending');
                    onBookingSubmitted?.();
                }}
            />
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
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <InputField icon={<Calendar />} label="Event Date" type="date" name="eventDate" min={todayStr} value={form.eventDate} onChange={handleChange} required error={fieldErrors.eventDate} />
                                    <InputField icon={<Clock />} label="Start Time" type="time" name="eventTime" value={form.eventTime} onChange={handleChange} required error={fieldErrors.eventTime} />
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-1">Duration (Hours)</label>
                                        <div className="relative">
                                            <select name="duration" value={form.duration} onChange={handleChange} className="input-base !pl-12 appearance-none">
                                                {[1, 1.5, 2, 2.5, 3, 4, 5, 6].map(h => <option key={h} value={h}>{h} Hour{h !== 1 ? 's' : ''}</option>)}
                                            </select>
                                            <Clock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 pointer-events-none" />
                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 pointer-events-none" />
                                        </div>
                                    </div>
                                    <InputField icon={<UsersIcon />} label="Guest Count" type="number" name="numberOfGuests" value={form.numberOfGuests} onChange={handleChange} required error={fieldErrors.numberOfGuests} />
                                    <InputField icon={<MapPin />} label="Event Address" name="eventAddress" value={form.eventAddress} onChange={handleChange} required error={fieldErrors.eventAddress} />
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-1">Suburb / Area</label>
                                        <div className="relative">
                                            <select name="eventSuburb" value={form.eventSuburb} onChange={handleChange} className="input-base !pl-12 appearance-none">
                                                <option value="">Select suburb</option>
                                                {perthSuburbs.map(s => (
                                                    <option key={s.name} value={s.name}>
                                                        {s.name} ({s.distanceFromCBD}km from CBD)
                                                    </option>
                                                ))}
                                            </select>
                                            <Navigation className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 pointer-events-none" />
                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 pointer-events-none" />
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
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="space-y-8">
                                    {(Object.entries(servicesByCategory) as [string, Service[]][]).map(([category, services]) => (
                                        <div key={category}>
                                            <h3 className="text-lg font-semibold text-orange-400 mb-4 flex items-center gap-2"><Briefcase size={18} /> {category}</h3>
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
                                                    We use Didit to securely verify your identity. After you submit your booking request, you will be securely redirected to Didit to complete this verification process.
                                                </p>
                                            </div>
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
                                <button onClick={handleBack} disabled={isSubmitting} className="flex-1 sm:flex-none px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-colors">{currentStep === 1 ? 'Cancel' : 'Back'}</button>
                                <button onClick={handleNext} disabled={isSubmitting} className="flex-1 sm:flex-none btn-primary px-8 py-3 flex items-center justify-center gap-2">
                                    {isSubmitting ? <LoaderCircle className="animate-spin" /> : currentStep === 4 ? <Send size={18} /> : null}
                                    {isSubmitting ? 'Processing...' : currentStep === 4 ? 'Review Request' : 'Continue'}
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