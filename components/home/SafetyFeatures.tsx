import React from 'react';
import { ShieldCheck, UserX, Wallet, FileText, CheckCircle, Heart } from 'lucide-react';

const features = [
  {
    icon: ShieldCheck,
    title: 'ID Verification',
    description: 'Every client is verified with government-issued ID before any booking is confirmed.',
  },
  {
    icon: UserX,
    title: 'Do Not Serve Blacklist',
    description: 'Performers can flag problematic clients. Flagged individuals are automatically blocked from future bookings.',
  },
  {
    icon: Wallet,
    title: 'Deposit Protection',
    description: 'Deposits secure the performer and reduce last-minute cancellations. Funds are tracked and verified.',
  },
  {
    icon: FileText,
    title: 'Booking Audit Logs',
    description: 'Every action is logged with timestamps. Full transparency for dispute resolution and compliance.',
  },
  {
    icon: CheckCircle,
    title: 'Approval Workflow',
    description: 'Multi-step approval ensures performers accept jobs before clients pay. Admin oversight at every stage.',
  },
  {
    icon: Heart,
    title: 'Performer-First Safety',
    description: 'The platform is designed around performer safety. Location sharing, check-ins, and emergency protocols built in.',
  },
];

const SafetyFeatures: React.FC = () => {
  return (
    <section className="section-spacing bg-gradient-to-b from-[#0f0f12] to-[#13131a]">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <ShieldCheck className="h-3.5 w-3.5" />
            Trust & Safety
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Safety is built into every layer
          </h2>
          <p className="text-[#b8b8c2] max-w-xl mx-auto">
            From client verification to performer protection, every feature is designed with safety as the foundation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className="card-base group hover:border-green-500/30 animate-fade-in"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-green-500/10 mb-4 group-hover:bg-green-500/20 transition-colors">
                <feature.icon className="h-6 w-6 text-green-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-[#b8b8c2] leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SafetyFeatures;
