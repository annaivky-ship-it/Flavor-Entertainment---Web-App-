/**
 * DemoTour — Guided product walkthrough for sales demos.
 * 7-step interactive tour that navigates through all major platform sections.
 */
import React, { useEffect } from 'react';
import { ChevronRight, ChevronLeft, X, Play, CheckCircle } from 'lucide-react';

export interface TourStep {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  view?: string;        // Which app view to navigate to
  highlight?: string;   // CSS class / aria-label hint for UI context
  icon: string;         // Emoji icon for the step
  duration?: string;    // Suggested demo duration
  talkingPoints: string[];
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 0,
    icon: '🎉',
    title: 'Welcome to Flavor Entertainers',
    subtitle: 'The premium booking platform for WA',
    description:
      'Flavor is a full-stack booking and management platform connecting clients with professional entertainers. This guided tour will walk you through every major feature in approximately 4 minutes.',
    view: 'available_now',
    talkingPoints: [
      'End-to-end booking automation — no manual coordination needed',
      'Built-in safety with our Do Not Serve screening system',
      'Real-time dashboards for clients, performers, and admins',
      'Automated deposit and payment tracking',
    ],
  },
  {
    id: 1,
    icon: '🌟',
    title: 'Client Browse Experience',
    subtitle: 'Gallery, Filtering & Profiles',
    description:
      'Clients land on the performer gallery and instantly see who is available right now. They can filter by service type, area, and category — then tap any card for a full profile.',
    view: 'available_now',
    talkingPoints: [
      'Live availability status: Available, Busy, or Offline',
      'Filter by service area (Perth North/South, Southwest, Northwest)',
      'Filter by service category (Waitressing, Strip Show, Promotional)',
      'Tap a performer card to view full bio, services, and pricing',
      'Add multiple performers to a single booking in one flow',
    ],
    duration: '~45 sec',
  },
  {
    id: 2,
    icon: '📅',
    title: 'Booking Flow',
    subtitle: 'Multi-step booking wizard',
    description:
      'Clients complete a 4-step booking wizard: Select services → Enter event details → Upload ID documents → Review and submit. The system captures all information needed for safe, verified bookings.',
    view: 'booking',
    talkingPoints: [
      'Step 1: Choose services and calculate cost in real time',
      'Step 2: Enter event date, time, address, guest count, and notes',
      'Step 3: Secure ID upload for client verification (KYC)',
      'Step 4: Review summary with automatic deposit calculation (25%)',
      'System blocks any client on the Do Not Serve list at submission',
    ],
    duration: '~45 sec',
  },
  {
    id: 3,
    icon: '💃',
    title: 'Performer Dashboard',
    subtitle: 'Manage availability & bookings',
    description:
      'Performers have their own portal to manage real-time availability, accept or decline incoming booking requests with ETA updates, and submit Do Not Serve reports for problem clients.',
    view: 'performer_dashboard',
    talkingPoints: [
      'One-tap status toggle: Available → Busy → Offline',
      'Accept or decline bookings with custom ETA (e.g. "25 mins away")',
      'View full client details after acceptance',
      'Submit a DNS report if a client behaves inappropriately',
      'View booking history and upcoming schedule',
    ],
    duration: '~45 sec',
  },
  {
    id: 4,
    icon: '🛠️',
    title: 'Admin Dashboard',
    subtitle: 'Full control centre',
    description:
      'The Admin Dashboard has 5 tabs covering every operational need: Bookings, Performers, Vetting, Payments, and Reports. Admins can approve, reject, reassign, and track everything from one screen.',
    view: 'admin_dashboard',
    talkingPoints: [
      'Bookings tab: Full lifecycle management with one-click status changes',
      'Performers tab: Add, edit, manage, and verify performer profiles',
      'Vetting tab: Review client ID documents and approve/reject applications',
      'Payments tab: Track deposits, confirm PayID payments, mark as paid',
      'Reports tab: Revenue stats, booking counts, and exportable CSV data',
    ],
    duration: '~1 min',
  },
  {
    id: 5,
    icon: '💳',
    title: 'Payments & Reporting',
    subtitle: 'Deposits, PayID, and financial tracking',
    description:
      'The platform automatically calculates a 25% deposit for every booking. Clients pay via PayID and upload a receipt. Admins verify and confirm. Full payment history and financial reporting is built in.',
    view: 'admin_dashboard',
    talkingPoints: [
      'Automatic 25% deposit calculation on every booking',
      'PayID instructions sent to client automatically',
      'Admin verifies receipt and confirms booking with one click',
      'Final balance (75%) collected in cash on the day',
      'CSV export of all financial data for accounting',
    ],
    duration: '~30 sec',
  },
  {
    id: 6,
    icon: '🛡️',
    title: 'Do Not Serve (DNS) System',
    subtitle: 'Performer safety & client screening',
    description:
      'The DNS system is our flagship safety feature. Performers submit flagged clients. Admins review and approve entries. Flagged clients are automatically blocked from booking — using hashed email and phone matching for privacy.',
    view: 'do_not_serve',
    talkingPoints: [
      'Performers submit DNS reports from their dashboard',
      'All entries are admin-reviewed before activation',
      'Emails and phones are hashed (SHA-256 + pepper) for privacy compliance',
      'New bookings are automatically screened at submission',
      'Full audit log of all DNS actions for compliance',
    ],
    duration: '~30 sec',
  },
];

interface DemoTourProps {
  currentStep: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onNavigate: (view: string) => void;
  onComplete: () => void;
}

const DemoTour: React.FC<DemoTourProps> = ({
  currentStep,
  onNext,
  onBack,
  onSkip,
  onNavigate,
  onComplete,
}) => {
  const step = TOUR_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  // Navigate the app to the correct view whenever the step changes
  useEffect(() => {
    if (step?.view) {
      onNavigate(step.view);
    }
    // Scroll to top so the view is visible
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!step) return null;

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      onNext();
    }
  };

  return (
    <>
      {/* Dim backdrop — only partial so the live UI is still visible behind */}
      <div className="fixed inset-0 bg-black/40 z-[60] pointer-events-none" />

      {/* Tour card — anchored bottom-right on desktop, bottom-center on mobile */}
      <div
        className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[420px] z-[70] animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-label={`Tour step ${currentStep + 1}: ${step.title}`}
      >
        <div className="bg-zinc-900 border border-orange-500/40 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
          {/* Header strip */}
          <div className="bg-gradient-to-r from-orange-600 to-amber-500 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{step.icon}</span>
              <span className="text-xs font-bold text-white/90 uppercase tracking-widest">
                Guided Tour · Step {currentStep + 1} of {TOUR_STEPS.length}
              </span>
            </div>
            <button
              onClick={onSkip}
              className="text-white/70 hover:text-white transition-colors"
              aria-label="Skip tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-zinc-800">
            <div
              className="h-1 bg-orange-500 transition-all duration-500"
              style={{ width: `${((currentStep + 1) / TOUR_STEPS.length) * 100}%` }}
            />
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">{step.title}</h2>
              <p className="text-orange-400 text-sm font-medium">{step.subtitle}</p>
            </div>

            <p className="text-zinc-300 text-sm leading-relaxed">{step.description}</p>

            {/* Talking points */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Key points</p>
              {step.talkingPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-orange-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-zinc-400">{point}</p>
                </div>
              ))}
            </div>

            {step.duration && (
              <p className="text-xs text-zinc-600 italic">Suggested demo time: {step.duration}</p>
            )}
          </div>

          {/* Step dots */}
          <div className="flex justify-center gap-1.5 pb-1">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-4 bg-orange-500'
                    : i < currentStep
                    ? 'w-1.5 bg-orange-800'
                    : 'w-1.5 bg-zinc-700'
                }`}
              />
            ))}
          </div>

          {/* Footer / navigation */}
          <div className="px-5 pb-5 pt-2 flex items-center justify-between gap-3">
            {!isFirst ? (
              <button
                onClick={onBack}
                className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            ) : (
              <button
                onClick={onSkip}
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Skip tour
              </button>
            )}

            <button
              onClick={handleNext}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
            >
              {isLast ? (
                <>
                  <Play className="h-4 w-4" />
                  Explore Live Demo
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default DemoTour;
