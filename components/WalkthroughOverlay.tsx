import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Shield, Zap, Users, AlertTriangle, CheckCircle, BarChart3, Play } from 'lucide-react';

// --- Types ---

interface WalkthroughStep {
    id: string;
    title: string;
    body: string;
    role?: 'Client' | 'Performer' | 'Admin';
    safetyNote?: string;
    actionLabel?: string;
    onAction?: () => void;
}

interface DemoScenario {
    id: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    outcome: string;
    riskScore: number;
    riskLevel: 'SAFE' | 'REVIEW' | 'BLOCK';
}

interface WalkthroughOverlayProps {
    isActive: boolean;
    onClose: () => void;
    onRoleChange?: (role: 'Client' | 'Performer' | 'Admin') => void;
    onNavigate?: (view: string) => void;
}

// --- Demo Scenarios ---

const DEMO_SCENARIOS: DemoScenario[] = [
    {
        id: 'safe',
        label: 'Safe Client',
        description: 'Verified ID, clear DNS, first booking',
        icon: <CheckCircle className="h-5 w-5" />,
        color: 'emerald',
        outcome: '✅ Auto-approved → Payment step',
        riskScore: 12,
        riskLevel: 'SAFE',
    },
    {
        id: 'suspicious',
        label: 'Suspicious Client',
        description: 'Verified ID but unusual booking pattern',
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'amber',
        outcome: '⚠️ Flagged → Manual admin review',
        riskScore: 47,
        riskLevel: 'REVIEW',
    },
    {
        id: 'blocked',
        label: 'Blocked Client',
        description: 'Matched Do-Not-Serve register',
        icon: <Shield className="h-5 w-5" />,
        color: 'red',
        outcome: '❌ Silently rejected at screening',
        riskScore: 88,
        riskLevel: 'BLOCK',
    },
    {
        id: 'trusted',
        label: 'Trusted Repeat',
        description: 'Returning client, verified within 12 months',
        icon: <Users className="h-5 w-5" />,
        color: 'blue',
        outcome: '⚡ Verification skipped → Direct payment',
        riskScore: 0,
        riskLevel: 'SAFE',
    },
];

// --- Walkthrough Steps ---

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
    {
        id: 'welcome',
        title: 'Welcome to AgencyFlow',
        body: 'This is a live interactive demo of the automated booking and safety platform built for entertainment agencies.\n\nYou can explore 3 different role views — Client, Performer, and Admin — to see the complete workflow.',
        safetyNote: 'All data shown is fictional demo data. No real identities are used.',
    },
    {
        id: 'client-view',
        title: 'Step 1 — Client Booking Request',
        body: 'Clients browse available performers and submit a booking request with their event details.\n\nBefore they can proceed, they see an age verification and safety consent screen — legally important for your agency.',
        role: 'Client',
        safetyNote: 'Client details are hashed immediately. Raw PII never enters the DNS register.',
        actionLabel: 'Switch to Client View',
    },
    {
        id: 'dns-check',
        title: 'Step 2 — Instant DNS Safety Check',
        body: 'The moment a booking is submitted, the system runs an instant Do-Not-Serve check.\n\nClient email and phone are SHA-256 hashed with a private pepper and matched against the safety register — all without storing raw contact details.',
        safetyNote: 'DNS check is synchronous and invisible to the client. Blocked clients receive generic "not available" responses.',
    },
    {
        id: 'verification',
        title: 'Step 3 — Self-Hosted Verification',
        body: 'New clients receive an SMS one-time code. For premium-tier bookings, an on-device liveness check (a quick blink-and-look) runs in the browser — no images leave the device.\n\nDeposit payment via PayID also acts as an identity signal: the bank-provided account name must match the booking name.',
        safetyNote: 'No government ID is collected. No biometric image is uploaded. Only short numeric verification records are retained.',
    },
    {
        id: 'risk-score',
        title: 'Step 4 — Risk Scoring Engine',
        body: 'A 6-factor risk score (0–100) is calculated:\n\n• Verification signals (OTP, liveness, PayID match)\n• DNS register matches\n• Repeat client history\n• Failed verification attempts\n• Booking behaviour patterns\n• Device fingerprint analysis',
        safetyNote: 'Score ≤30: Auto-approve. 31–60: Manual review. ≥61: Auto-reject.',
    },
    {
        id: 'admin-review',
        title: 'Step 5 — Admin Review Queue',
        body: 'Borderline cases land in the admin review dashboard. Admins see the full client profile, risk score breakdown, verification signals, DNS matches, and booking history.\n\nOne click to approve, reject, or escalate to a DNS entry.',
        role: 'Admin',
        safetyNote: 'Every admin decision is logged with timestamp, actor ID, and reasoning for legal audit trails.',
        actionLabel: 'Switch to Admin View',
    },
    {
        id: 'payment',
        title: 'Step 6 — Deposit Payment',
        body: 'Only approved bookings proceed to payment. The client receives a PayID payment request with a unique reference.\n\nOnce deposit is confirmed, the performer receives full client details (address, phone, event info) via SMS.',
        safetyNote: 'Performer contact details are only released after deposit is paid — protecting both sides.',
    },
    {
        id: 'performer-dashboard',
        title: 'For Performers',
        body: 'Performers set their availability in real-time, review incoming requests, set ETAs, and submit incident reports for dangerous clients.\n\nSafety reports go to admin review before any DNS entry is created.',
        role: 'Performer',
        safetyNote: 'Performers can flag clients without those clients knowing a report has been made.',
        actionLabel: 'Switch to Performer View',
    },
    {
        id: 'complete',
        title: 'Ready to See the Real Thing?',
        body: 'This platform is available as a white-label SaaS for entertainment agencies.\n\nEvery feature you\'ve seen — self-hosted verification, DNS, risk scoring, performer safety tools — is production-ready and connects to live services.',
        safetyNote: 'Contact us to discuss pricing, setup, and customisation for your agency.',
    },
];

// --- Risk Score Badge ---

const RiskBadge: React.FC<{ score: number; level: 'SAFE' | 'REVIEW' | 'BLOCK' }> = ({ score, level }) => {
    const colors = {
        SAFE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        REVIEW: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        BLOCK: 'bg-red-500/20 text-red-400 border-red-500/30',
    };

    return (
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold ${colors[level]}`}>
            <span>Risk Score: {score}/100</span>
            <span>•</span>
            <span>{level}</span>
        </div>
    );
};

// --- Scenario Panel ---

const ScenarioPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [activeScenario, setActiveScenario] = useState<DemoScenario | null>(null);
    const [isAnimating, setIsAnimating] = useState(false);

    const handleSelectScenario = (scenario: DemoScenario) => {
        setIsAnimating(true);
        setTimeout(() => {
            setActiveScenario(scenario);
            setIsAnimating(false);
        }, 300);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl shadow-2xl shadow-black/50 animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-zinc-800">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Play className="h-5 w-5 text-orange-500" />
                            Demo Scenarios
                        </h2>
                        <p className="text-sm text-zinc-400 mt-1">Click a scenario to see how the system responds</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-2">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Scenario Grid */}
                <div className="p-6 grid grid-cols-2 gap-3">
                    {DEMO_SCENARIOS.map(scenario => (
                        <button
                            key={scenario.id}
                            onClick={() => handleSelectScenario(scenario)}
                            className={`text-left p-4 rounded-xl border transition-all duration-200 ${activeScenario?.id === scenario.id
                                    ? `border-${scenario.color}-500 bg-${scenario.color}-500/10`
                                    : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-500 hover:bg-zinc-800'
                                }`}
                        >
                            <div className={`flex items-center gap-2 mb-2 text-${scenario.color}-400`}>
                                {scenario.icon}
                                <span className="font-bold text-sm text-white">{scenario.label}</span>
                            </div>
                            <p className="text-xs text-zinc-400">{scenario.description}</p>
                        </button>
                    ))}
                </div>

                {/* Result Panel */}
                <div className={`mx-6 mb-6 transition-all duration-300 ${isAnimating ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
                    {activeScenario ? (
                        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-white">{activeScenario.label} — System Response</h3>
                                <RiskBadge score={activeScenario.riskScore} level={activeScenario.riskLevel} />
                            </div>

                            {/* Risk Bar */}
                            <div>
                                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                                    <span>Risk Score</span>
                                    <span>{activeScenario.riskScore}/100</span>
                                </div>
                                <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-700 ${activeScenario.riskLevel === 'SAFE' ? 'bg-emerald-500' :
                                                activeScenario.riskLevel === 'REVIEW' ? 'bg-amber-500' : 'bg-red-500'
                                            }`}
                                        style={{ width: `${activeScenario.riskScore}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                                    <span>0 — Safe</span>
                                    <span>30</span>
                                    <span>60</span>
                                    <span>100 — Block</span>
                                </div>
                            </div>

                            {/* Outcome */}
                            <div className="bg-zinc-900 rounded-lg p-3">
                                <p className="text-sm font-semibold text-zinc-200">Automated Decision:</p>
                                <p className="text-sm text-zinc-300 mt-1">{activeScenario.outcome}</p>
                            </div>

                            <p className="text-xs text-zinc-500 leading-relaxed">
                                {activeScenario.id === 'safe' && 'SMS OTP confirmed and PayID name matches the booking. No DNS matches. Score below threshold — booking auto-approved and moved to payment step.'}
                                {activeScenario.id === 'suspicious' && 'OTP confirmed but 4 booking attempts across 3 performers in 24h detected. System flags for manual review. Admin receives WhatsApp alert.'}
                                {activeScenario.id === 'blocked' && 'Phone hash matched a HIGH-risk DNS entry. Client receives a generic "not available" response. Performer and admin are silently notified.'}
                                {activeScenario.id === 'trusted' && 'Client has 5+ successful bookings within 12 months and clean history. Verification signals skipped. Booking moves directly to payment — saving 2–5 minutes per returning client.'}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl p-5 text-center">
                            <BarChart3 className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                            <p className="text-sm text-zinc-500">Select a scenario above to see a simulated system response</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Main Walkthrough Overlay ---

const WalkthroughOverlay: React.FC<WalkthroughOverlayProps> = ({
    isActive, onClose, onRoleChange, onNavigate: _onNavigate
}) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [showScenarios, setShowScenarios] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);

    const step = WALKTHROUGH_STEPS[currentStep];
    const total = WALKTHROUGH_STEPS.length;

    const goNext = () => {
        if (currentStep < total - 1) {
            setIsTransitioning(true);
            setTimeout(() => {
                setCurrentStep(prev => prev + 1);
                setIsTransitioning(false);
            }, 200);
        }
    };

    const goPrev = () => {
        if (currentStep > 0) {
            setIsTransitioning(true);
            setTimeout(() => {
                setCurrentStep(prev => prev - 1);
                setIsTransitioning(false);
            }, 200);
        }
    };

    const handleAction = () => {
        if (step.role && onRoleChange) {
            onRoleChange(step.role);
        }
        goNext();
    };

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') goNext();
            if (e.key === 'ArrowLeft') goPrev();
            if (e.key === 'Escape') onClose();
        };
        if (isActive) {
            window.addEventListener('keydown', handleKey);
        }
        return () => window.removeEventListener('keydown', handleKey);
    }, [isActive, currentStep]);

    if (!isActive) return null;

    return (
        <>
            {/* Scenarios Modal */}
            {showScenarios && <ScenarioPanel onClose={() => setShowScenarios(false)} />}

            {/* Floating Walkthrough Panel */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4 pointer-events-none">
                <div
                    className={`pointer-events-auto bg-zinc-900/95 backdrop-blur-xl border border-zinc-700 rounded-2xl shadow-2xl shadow-black/60 transition-all duration-200 ${isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
                        }`}
                >
                    {/* Progress bar */}
                    <div className="h-1 bg-zinc-800 rounded-t-2xl overflow-hidden">
                        <div
                            className="h-full bg-orange-500 transition-all duration-500"
                            style={{ width: `${((currentStep + 1) / total) * 100}%` }}
                        />
                    </div>

                    <div className="p-5">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                                {step.role && (
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${step.role === 'Admin' ? 'bg-purple-500/20 text-purple-400' :
                                            step.role === 'Performer' ? 'bg-blue-500/20 text-blue-400' :
                                                'bg-orange-500/20 text-orange-400'
                                        }`}>
                                        {step.role} View
                                    </span>
                                )}
                                <span className="text-xs text-zinc-500">{currentStep + 1} of {total}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowScenarios(true)}
                                    className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-colors"
                                >
                                    <Play className="h-3 w-3" />
                                    Scenarios
                                </button>
                                <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <h3 className="text-base font-bold text-white mb-2">{step.title}</h3>
                        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">{step.body}</p>

                        {/* Safety Note */}
                        {step.safetyNote && (
                            <div className="mt-3 flex items-start gap-2 bg-orange-500/5 border border-orange-500/20 rounded-lg p-3">
                                <Shield className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-zinc-400">{step.safetyNote}</p>
                            </div>
                        )}

                        {/* Navigation */}
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
                            <button
                                onClick={goPrev}
                                disabled={currentStep === 0}
                                className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Back
                            </button>

                            {/* Step dots */}
                            <div className="flex gap-1.5">
                                {WALKTHROUGH_STEPS.map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setCurrentStep(i)}
                                        className={`h-1.5 rounded-full transition-all duration-300 ${i === currentStep ? 'w-4 bg-orange-500' : 'w-1.5 bg-zinc-700 hover:bg-zinc-500'
                                            }`}
                                    />
                                ))}
                            </div>

                            {currentStep === total - 1 ? (
                                <button onClick={onClose} className="btn-primary !py-2 !px-4 !text-sm flex items-center gap-1">
                                    <Zap className="h-4 w-4" />
                                    Explore Live
                                </button>
                            ) : step.actionLabel ? (
                                <button onClick={handleAction} className="btn-primary !py-2 !px-4 !text-sm flex items-center gap-1">
                                    {step.actionLabel}
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            ) : (
                                <button onClick={goNext} className="flex items-center gap-1 text-sm text-orange-400 hover:text-orange-300 transition-colors font-semibold">
                                    Next
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default WalkthroughOverlay;
