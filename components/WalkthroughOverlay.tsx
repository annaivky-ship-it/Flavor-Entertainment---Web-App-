import React, { useState, useEffect, useCallback } from 'react';
import {
    X, ChevronRight, ChevronLeft, Shield, Zap, Users, AlertTriangle,
    CheckCircle, BarChart3, Play, Eye, Star, CreditCard,
    Bell, Search, UserCheck, ArrowRight
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'user' | 'admin' | 'performer';

interface WalkthroughOverlayProps {
    isActive: boolean;
    onClose: () => void;
    onRoleChange: (role: Role) => void;
    onNavigate: (view: string) => void;
    performers?: { id: number; name: string; photo_url: string }[];
}

// ─── Risk Bar Component ───────────────────────────────────────────────────────

const RiskBar: React.FC<{ score: number; level: 'SAFE' | 'REVIEW' | 'BLOCK'; animate?: boolean }> = ({
    score, level, animate = false
}) => {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setWidth(score), animate ? 400 : 0);
        return () => clearTimeout(t);
    }, [score, animate]);

    const color = level === 'SAFE' ? '#10b981' : level === 'REVIEW' ? '#f59e0b' : '#ef4444';
    const badgeCls = level === 'SAFE' ? 'bg-emerald-500/20 text-emerald-400' :
        level === 'REVIEW' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400';

    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400 font-medium">Risk Score</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeCls}`}>{level} — {score}/100</span>
            </div>
            <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${width}%`, backgroundColor: color }} />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-600">
                <span>0 Safe</span><span>30</span><span>60</span><span>100 Block</span>
            </div>
        </div>
    );
};

// ─── Scenarios ────────────────────────────────────────────────────────────────

const SCENARIOS = [
    { id: 'safe', label: '✅ Safe Client', score: 12, level: 'SAFE' as const, outcome: 'Auto-approved → Moves to payment step', detail: 'ID verified, no DNS hit, first booking within behaviour norms.' },
    { id: 'suspicious', label: '⚠️ Suspicious Client', score: 47, level: 'REVIEW' as const, outcome: 'Flagged → Manual admin review queue', detail: '4 booking attempts across 3 performers in under 24h detected.' },
    { id: 'blocked', label: '🚫 DNS Blocked', score: 88, level: 'BLOCK' as const, outcome: 'Silently rejected at screening gate', detail: 'Phone hash matched a HIGH-risk Do-Not-Serve register entry.' },
    { id: 'trusted', label: '⚡ Trusted Repeat', score: 0, level: 'SAFE' as const, outcome: 'KYC bypassed → Direct to payment', detail: 'Verified 94 days ago, 3 successful bookings, no incidents.' },
];

// ─── Scenario Modal ───────────────────────────────────────────────────────────

const ScenarioModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [active, setActive] = useState<typeof SCENARIOS[0] | null>(null);
    const [animating, setAnimating] = useState(false);

    const select = (s: typeof SCENARIOS[0]) => {
        setAnimating(true);
        setTimeout(() => { setActive(s); setAnimating(false); }, 250);
    };

    return (
        <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                    <div>
                        <h2 className="font-bold text-white flex items-center gap-2">
                            <Play className="h-4 w-4 text-orange-500" /> Risk Scenarios
                        </h2>
                        <p className="text-xs text-zinc-400 mt-0.5">See how the system responds to different client types</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"><X className="h-4 w-4" /></button>
                </div>
                <div className="p-4 grid grid-cols-2 gap-2">
                    {SCENARIOS.map(s => (
                        <button
                            key={s.id}
                            onClick={() => select(s)}
                            className={`text-left p-3 rounded-xl border transition-all duration-200 ${active?.id === s.id ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-700 bg-zinc-800/60 hover:border-zinc-500'
                                }`}
                        >
                            <p className="text-sm font-bold text-white">{s.label}</p>
                            <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">{s.detail}</p>
                        </button>
                    ))}
                </div>
                <div className={`px-4 pb-4 transition-all duration-200 ${animating ? 'opacity-0' : 'opacity-100'}`}>
                    {active ? (
                        <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
                            <RiskBar score={active.score} level={active.level} animate />
                            <div className="bg-zinc-900 rounded-lg px-3 py-2">
                                <p className="text-xs text-zinc-400">Automated Decision</p>
                                <p className="text-sm font-semibold text-white mt-0.5">{active.outcome}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl p-4 text-center">
                            <BarChart3 className="h-7 w-7 text-zinc-600 mx-auto mb-1.5" />
                            <p className="text-xs text-zinc-500">Select a scenario above to see system response</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── SVG Spotlight Overlay ────────────────────────────────────────────────────

const SpotlightOverlay: React.FC<{ targetSelector: string | null }> = ({ targetSelector }) => {
    const [rect, setRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (!targetSelector) { setRect(null); return; }
        const update = () => {
            const el = document.querySelector(targetSelector);
            if (el) setRect(el.getBoundingClientRect());
            else setRect(null);
        };
        update();
        const interval = setInterval(update, 300);
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [targetSelector]);

    if (!targetSelector || !rect) {
        return (
            <div className="fixed inset-0 bg-black/60 z-[500] pointer-events-none" style={{ backdropFilter: 'blur(2px)' }} />
        );
    }

    const pad = 12;
    const x = rect.left - pad;
    const y = rect.top - pad;
    const w = rect.width + pad * 2;
    const h = rect.height + pad * 2;

    return (
        <svg className="fixed inset-0 z-[500] pointer-events-none" width="100%" height="100%">
            <defs>
                <mask id="tour-mask">
                    <rect width="100%" height="100%" fill="white" />
                    <rect x={x} y={y} width={w} height={h} rx="10" fill="black" />
                </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)" mask="url(#tour-mask)" />
            {/* Animated orange ring */}
            <rect x={x} y={y} width={w} height={h} rx="10" fill="none" stroke="#f97316" strokeWidth="2.5" strokeDasharray="8 5" opacity="0.9">
                <animateTransform attributeName="transform" type="translate" values="0,0; 1,0; 0,0; -1,0; 0,0" dur="3s" repeatCount="indefinite" />
            </rect>
            <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx="9" fill="none" stroke="rgba(249,115,22,0.3)" strokeWidth="6" />
        </svg>
    );
};

// ─── Tour Steps ───────────────────────────────────────────────────────────────

interface TourStep {
    id: string;
    title: string;
    body: string;
    badge?: string;
    badgeColor?: string;
    targetView?: string;
    targetRole?: Role;
    spotlight?: string | null;
    tooltipMode?: 'floating' | 'centered';
    demoContent?: React.ReactNode;
    showScenarioBtn?: boolean;
}

const buildSteps = (): TourStep[] => [
    {
        id: 'welcome',
        title: 'Welcome to Flavor Entertainers',
        body: 'This is a live interactive guided demo of the booking and safety platform for entertainment agencies.\n\nThis tour will walk you through the complete workflow — browse performers, submit a booking, run safety checks, and manage everything as admin or performer.',
        badge: '🎯 Interactive Demo',
        badgeColor: 'orange',
        tooltipMode: 'centered',
        demoContent: (
            <div className="grid grid-cols-2 gap-2 mt-3">
                {[
                    { icon: <Shield className="h-4 w-4" />, label: 'KYC & Safety', cls: 'bg-orange-500/10 border-orange-500/20 text-orange-400' },
                    { icon: <Zap className="h-4 w-4" />, label: 'Auto Vetting', cls: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
                    { icon: <BarChart3 className="h-4 w-4" />, label: 'Risk Scoring', cls: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
                    { icon: <Bell className="h-4 w-4" />, label: 'Live Alerts', cls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
                ].map(item => (
                    <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold ${item.cls}`}>
                        {item.icon} {item.label}
                    </div>
                ))}
            </div>
        ),
    },
    {
        id: 'gallery',
        title: 'Step 1 — Performer Gallery',
        body: 'Clients browse available performers with real-time status, service areas, pricing and availability.\n\nAll performers are agency-vetted before appearing here. Cards show availability (green = online now).',
        badge: '👤 Client View',
        badgeColor: 'orange',
        targetView: 'available_now',
        targetRole: 'user',
        spotlight: '#tour-gallery',
        tooltipMode: 'floating',
    },
    {
        id: 'search',
        title: 'Step 2 — Smart Search & Filters',
        body: 'Clients filter by service type, area (Perth North/South, Southwest), price range, and availability.\n\nSearch across performer name, bio, and services with instant results.',
        badge: '🔍 Smart Filters',
        badgeColor: 'orange',
        targetView: 'available_now',
        spotlight: '#tour-search',
        tooltipMode: 'floating',
        demoContent: (
            <div className="mt-3 flex flex-wrap gap-1.5">
                {['Perth North', 'Topless Waitress', 'Available Now', '≥ 2hrs'].map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] px-2 py-0.5 rounded-full">
                        <Search className="h-2.5 w-2.5" /> {tag}
                    </span>
                ))}
            </div>
        ),
    },
    {
        id: 'booking',
        title: 'Step 3 — Booking Request Form',
        body: 'Clients complete a structured intake form linked to the safety system:\n\n• Event date, time, location, duration\n• Guest count and special requirements\n• Service preferences and performer notes\n\nOn submit, the safety pipeline activates automatically.',
        badge: '📋 Booking Flow',
        badgeColor: 'orange',
        targetView: 'future_bookings',
        tooltipMode: 'centered',
        demoContent: (
            <div className="mt-3 space-y-2">
                {[
                    { label: 'Client', value: 'James Thompson' },
                    { label: 'Date', value: 'Sat 15 Mar 2026, 8pm' },
                    { label: 'Location', value: '42 King St, Perth CBD' },
                    { label: 'Service', value: 'Topless Waitress · 3hrs' },
                    { label: 'Guests', value: '25 pax' },
                ].map(row => (
                    <div key={row.label} className="flex justify-between text-xs py-0.5">
                        <span className="text-zinc-500">{row.label}</span>
                        <span className="text-zinc-200 font-medium">{row.value}</span>
                    </div>
                ))}
                <div className="mt-2 pt-2 border-t border-zinc-700 text-[10px] text-zinc-500">
                    On submit → KYC + DNS safety check triggers automatically
                </div>
            </div>
        ),
    },
    {
        id: 'kyc',
        title: 'Step 4 — Identity Verification (Didit)',
        body: 'New clients verify their identity before the booking is accepted.\n\nThey complete Didit\'s hosted verification: government ID upload, liveness selfie, and AML/sanctions screening.\n\nRaw ID images are never stored — only the session result.',
        badge: '🛡️ KYC Gate',
        badgeColor: 'blue',
        tooltipMode: 'centered',
        demoContent: (
            <div className="mt-3 space-y-2">
                {[
                    { icon: <UserCheck className="h-3.5 w-3.5 text-emerald-400" />, label: 'Government ID', status: 'Verified ✓', cls: 'text-emerald-400' },
                    { icon: <Eye className="h-3.5 w-3.5 text-emerald-400" />, label: 'Liveness Check', status: 'Passed ✓', cls: 'text-emerald-400' },
                    { icon: <Shield className="h-3.5 w-3.5 text-emerald-400" />, label: 'AML Screening', status: 'Clear ✓', cls: 'text-emerald-400' },
                ].map(item => (
                    <div key={item.label} className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 text-xs text-zinc-300">{item.icon} {item.label}</div>
                        <span className={`text-xs font-bold ${item.cls}`}>{item.status}</span>
                    </div>
                ))}
                <p className="text-[10px] text-zinc-500">Avg verification time: ~90 seconds · Powered by Didit</p>
            </div>
        ),
    },
    {
        id: 'dns',
        title: 'Step 5 — Do-Not-Serve Safety Check',
        body: 'Simultaneously, the system checks the client against the DNS register.\n\nEmail and phone are SHA-256 hashed with a private pepper — raw contact details are never stored. Matched clients receive a generic "not available" response.',
        badge: '🚫 DNS Register',
        badgeColor: 'red',
        targetView: 'admin_dashboard',
        targetRole: 'admin',
        spotlight: '#tour-dns-tab',
        tooltipMode: 'floating',
        demoContent: (
            <div className="mt-3 space-y-1.5">
                {[
                    { label: 'Email hash check', status: 'No match ✓', cls: 'text-emerald-400' },
                    { label: 'Phone hash check', status: 'No match ✓', cls: 'text-emerald-400' },
                    { label: 'Name fuzzy match', status: 'No match ✓', cls: 'text-emerald-400' },
                ].map(row => (
                    <div key={row.label} className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2 text-xs">
                        <span className="text-zinc-300">{row.label}</span>
                        <span className={`font-bold ${row.cls}`}>{row.status}</span>
                    </div>
                ))}
                <p className="text-[10px] text-zinc-500 mt-1">DNS check completes in &lt;200ms</p>
            </div>
        ),
    },
    {
        id: 'risk-score',
        title: 'Step 6 — Risk Scoring Engine',
        body: 'A 6-factor automated risk score (0–100) is calculated:\n\n• Identity verification result\n• DNS register matches\n• Repeat client trust history\n• Failed verification attempts\n• Booking behaviour analysis\n• Device fingerprint check\n\nScore ≤30: Auto-approve · 31–60: Admin review · ≥61: Auto-block',
        badge: '📊 Risk Engine',
        badgeColor: 'purple',
        tooltipMode: 'centered',
        showScenarioBtn: true,
        demoContent: (
            <div className="mt-3 space-y-3">
                <RiskBar score={12} level="SAFE" animate />
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                    {[
                        { label: 'Identity', val: '0' },
                        { label: 'DNS', val: '0' },
                        { label: 'History', val: '-10' },
                        { label: 'Attempts', val: '0' },
                        { label: 'Behaviour', val: '0' },
                        { label: 'Device', val: '0' },
                    ].map(f => (
                        <div key={f.label} className="bg-zinc-800 rounded px-2 py-1.5 text-center">
                            <div className="text-zinc-500">{f.label}</div>
                            <div className="text-emerald-400 font-bold">{f.val}</div>
                        </div>
                    ))}
                </div>
            </div>
        ),
    },
    {
        id: 'admin-queue',
        title: 'Step 7 — Admin Booking Queue',
        body: 'Borderline bookings (risk 31–60) land in the admin queue for human review.\n\nAdmins see: KYC result, risk score breakdown, DNS matches, client history — one panel, one click to decide.',
        badge: '🔐 Admin View',
        badgeColor: 'purple',
        targetView: 'admin_dashboard',
        targetRole: 'admin',
        spotlight: '#tour-booking-queue',
        tooltipMode: 'floating',
        demoContent: (
            <div className="mt-3">
                <div className="bg-zinc-800 rounded-xl p-3 border border-amber-500/30">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <p className="text-xs font-bold text-white">VIP Birthday Party</p>
                            <p className="text-[10px] text-zinc-400">Laurina Sargeant · 15 guests</p>
                        </div>
                        <span className="text-[10px] text-amber-400 font-bold px-2 py-0.5 bg-amber-500/10 rounded-full border border-amber-500/30">REVIEW</span>
                    </div>
                    <div className="flex gap-2">
                        <button className="flex-1 text-[10px] bg-emerald-500/20 text-emerald-400 rounded-lg px-2 py-1.5 font-bold border border-emerald-500/30">✓ Approve</button>
                        <button className="flex-1 text-[10px] bg-red-500/20 text-red-400 rounded-lg px-2 py-1.5 font-bold border border-red-500/30">✗ Reject</button>
                    </div>
                </div>
                <p className="text-[10px] text-zinc-500 mt-2">Every decision is audit-logged with timestamp + admin ID</p>
            </div>
        ),
    },
    {
        id: 'payment',
        title: 'Step 8 — Deposit Payment',
        body: 'Approved bookings move to payment. The client gets a PayID payment request with a unique reference.\n\nOnce confirmed, the performer receives full client details — address, phone, event info — via notification.',
        badge: '💳 Payment',
        badgeColor: 'emerald',
        tooltipMode: 'centered',
        demoContent: (
            <div className="mt-3 space-y-2">
                <div className="bg-zinc-800 rounded-xl p-3 space-y-1.5">
                    <div className="flex justify-between text-xs">
                        <span className="text-zinc-400">3hrs × $160/hr</span>
                        <span className="text-white">$480.00</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-zinc-400">25% Deposit (now)</span>
                        <span className="text-orange-400 font-bold">$120.00</span>
                    </div>
                    <div className="h-px bg-zinc-700 my-1" />
                    <div className="flex justify-between text-xs">
                        <span className="text-zinc-400">Balance on night</span>
                        <span className="text-zinc-300">$360.00</span>
                    </div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-[10px] text-emerald-400 flex items-center gap-1.5">
                    <CreditCard className="h-3 w-3" />
                    PayID: bookings@flavorentertainers.com.au — Ref: #BFA3E8
                </div>
            </div>
        ),
    },
    {
        id: 'performer',
        title: 'Step 9 — Performer Dashboard',
        body: 'Performers manage availability, review bookings, and receive instant push notifications.\n\nPerformer address is only released after deposit confirmation — protecting both parties.',
        badge: '🎭 Performer View',
        badgeColor: 'blue',
        targetView: 'performer_dashboard',
        targetRole: 'performer',
        spotlight: '#tour-performer-dashboard',
        tooltipMode: 'floating',
        demoContent: (
            <div className="mt-3">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
                    <p className="text-xs font-bold text-emerald-400">💰 DEPOSIT PAID — Booking Confirmed</p>
                    <div className="mt-1.5 space-y-0.5 text-[10px] text-zinc-300">
                        <p>👤 Client: James Thompson</p>
                        <p>📍 42 King St, Perth CBD</p>
                        <p>📅 Sat 15 Mar 8pm · 25 guests</p>
                    </div>
                </div>
                <p className="text-[10px] text-zinc-500 mt-2">Address not visible until deposit is paid</p>
            </div>
        ),
    },
    {
        id: 'safety',
        title: 'Step 10 — Safety Incident Reporting',
        body: 'Performers submit safety reports for unsafe clients directly from their dashboard.\n\nAdmin reviews the report. On approval, the client is added to the DNS register — silently blocking all future bookings.',
        badge: '🚨 Safety Tools',
        badgeColor: 'red',
        targetView: 'performer_dashboard',
        targetRole: 'performer',
        tooltipMode: 'centered',
        demoContent: (
            <div className="mt-3">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                        <p className="text-xs font-bold text-red-400">Safety Report Submitted</p>
                    </div>
                    <p className="text-[10px] text-zinc-300 leading-relaxed">
                        "Attempted to negotiate services outside contract. Felt unsafe. Photos taken without consent."
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                        <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold border border-red-500/30">HIGH RISK</span>
                        <span className="text-[10px] bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded-full">Pending admin review</span>
                    </div>
                </div>
                <p className="text-[10px] text-zinc-500 mt-2">Client is unaware a report has been made</p>
            </div>
        ),
    },
    {
        id: 'cta',
        title: 'Ready to Run Your Agency on This?',
        body: 'Every feature in this demo is production-ready:\n\n✅ Real Didit KYC integration\n✅ Live DNS safety register\n✅ Automated risk scoring engine\n✅ Real-time performer management\n✅ Full legal audit trail',
        badge: '🚀 AgencyFlow',
        badgeColor: 'orange',
        targetView: 'available_now',
        targetRole: 'user',
        tooltipMode: 'centered',
        demoContent: (
            <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                    { icon: <Star className="h-3.5 w-3.5" />, label: 'White-label SaaS', cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
                    { icon: <Shield className="h-3.5 w-3.5" />, label: 'Legal compliance', cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
                    { icon: <Zap className="h-3.5 w-3.5" />, label: 'Full automation', cls: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
                    { icon: <Users className="h-3.5 w-3.5" />, label: 'Multi-agency ready', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                ].map(item => (
                    <div key={item.label} className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border ${item.cls}`}>
                        {item.icon} {item.label}
                    </div>
                ))}
            </div>
        ),
    },
];

// ─── Main Component ───────────────────────────────────────────────────────────

const WalkthroughOverlay: React.FC<WalkthroughOverlayProps> = ({
    isActive, onClose, onRoleChange, onNavigate
}) => {
    const [step, setStep] = useState(0);
    const [showScenarios, setShowScenarios] = useState(false);
    const [transitioning, setTransitioning] = useState(false);
    const steps = buildSteps();
    const current = steps[step];
    const total = steps.length;

    useEffect(() => {
        if (!isActive) return;
        const s = steps[step];
        if (s.targetRole) onRoleChange(s.targetRole);
        if (s.targetView) setTimeout(() => onNavigate(s.targetView!), 120);
    }, [step, isActive]);

    const go = useCallback((n: number) => {
        setTransitioning(true);
        setTimeout(() => { setStep(n); setTransitioning(false); }, 160);
    }, []);

    const goNext = useCallback(() => step < total - 1 ? go(step + 1) : onClose(), [step, total, go, onClose]);
    const goPrev = useCallback(() => step > 0 && go(step - 1), [step, go]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (!isActive) return;
            if (e.key === 'ArrowRight' || e.key === 'Enter') goNext();
            if (e.key === 'ArrowLeft') goPrev();
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [isActive, goNext, goPrev, onClose]);

    if (!isActive) return null;

    const badgeCls: Record<string, string> = {
        orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        red: 'bg-red-500/20 text-red-400 border-red-500/30',
        emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    };

    const isCentered = current.tooltipMode === 'centered';

    const panel = (
        <div
            className={`pointer-events-auto bg-zinc-900/98 backdrop-blur-xl border border-zinc-700 rounded-2xl shadow-2xl shadow-black/70 transition-all duration-160 ${transitioning ? 'opacity-0 scale-[0.97] translate-y-1' : 'opacity-100 scale-100 translate-y-0'
                } ${isCentered ? 'w-full max-w-md' : 'w-full'}`}
        >
            <div className="h-0.5 bg-gradient-to-r from-orange-600 via-orange-400 to-orange-600 rounded-t-2xl" />

            <div className="p-5">
                {/* Badge row */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        {current.badge && (
                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${badgeCls[current.badgeColor || 'orange']}`}>
                                {current.badge}
                            </span>
                        )}
                        {current.targetRole && current.targetRole !== 'user' && (
                            <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                                <ArrowRight className="h-2.5 w-2.5" />
                                {current.targetRole === 'admin' ? 'Admin' : 'Performer'} view
                            </span>
                        )}
                    </div>
                    <button onClick={() => setShowScenarios(true)} className="text-[10px] text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1">
                        <Play className="h-3 w-3" /> Scenarios
                    </button>
                </div>

                <h3 className="text-[15px] font-bold text-white mb-2 leading-snug">{current.title}</h3>
                <p className="text-[13px] text-zinc-300 leading-relaxed whitespace-pre-line">{current.body}</p>

                {current.demoContent && <div>{current.demoContent}</div>}

                {/* Nav */}
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-zinc-800">
                    <button
                        onClick={goPrev}
                        disabled={step === 0}
                        className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4" /> Back
                    </button>

                    <div className="flex gap-1.5 items-center">
                        {steps.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => go(i)}
                                className={`rounded-full transition-all duration-300 ${i === step ? 'w-5 h-1.5 bg-orange-500' : i < step ? 'w-1.5 h-1.5 bg-zinc-500 hover:bg-zinc-300' : 'w-1.5 h-1.5 bg-zinc-700 hover:bg-zinc-500'
                                    }`}
                            />
                        ))}
                    </div>

                    {step === total - 1 ? (
                        <button onClick={onClose} className="btn-primary !py-2 !px-4 !text-sm flex items-center gap-1.5">
                            <Zap className="h-4 w-4" /> Explore Now
                        </button>
                    ) : current.showScenarioBtn ? (
                        <button onClick={() => setShowScenarios(true)} className="btn-primary !py-2 !px-3 !text-xs flex items-center gap-1">
                            <Play className="h-3.5 w-3.5" /> Try Scenarios
                        </button>
                    ) : (
                        <button onClick={goNext} className="flex items-center gap-1.5 text-sm text-orange-400 hover:text-orange-300 font-semibold transition-colors">
                            {step === total - 2 ? 'Finish' : 'Next'}
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <>
            {showScenarios && <ScenarioModal onClose={() => setShowScenarios(false)} />}

            {/* SVG Spotlight */}
            <SpotlightOverlay targetSelector={current.spotlight ?? null} />

            {/* Progress badge top-right */}
            <div className="fixed top-24 right-5 z-[600] flex items-center gap-2 pointer-events-auto">
                <div className="bg-zinc-900/95 border border-zinc-700 rounded-full px-3 py-1.5 flex items-center gap-2 shadow-xl">
                    <div className="h-1.5 w-16 bg-zinc-700 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${((step + 1) / total) * 100}%` }} />
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-300">{step + 1}/{total}</span>
                    <button onClick={onClose} title="Exit tour" className="text-zinc-500 hover:text-white transition-colors ml-0.5">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {/* Keyboard hint */}
            {step === 0 && (
                <div className="fixed bottom-52 left-1/2 -translate-x-1/2 z-[600] text-[10px] text-zinc-500 flex items-center gap-2 pointer-events-none select-none">
                    <kbd className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">←→</kbd> navigate
                    <span>·</span>
                    <kbd className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">Esc</kbd> exit
                </div>
            )}

            {/* Panel placement */}
            {isCentered ? (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 pointer-events-none">
                    {panel}
                </div>
            ) : (
                <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[600] w-full max-w-md px-4 pointer-events-none">
                    {panel}
                </div>
            )}
        </>
    );
};

export default WalkthroughOverlay;
