import React from 'react';
import { UserCheck, Calendar, CreditCard } from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: UserCheck,
    title: 'Select Your Performer',
    description: 'Browse verified professionals by category, availability, and location. View profiles and services before you book.',
  },
  {
    number: '02',
    icon: Calendar,
    title: 'Enter Event Details',
    description: 'Tell us when, where, and what type of event. Select the services you need and add any special requests.',
  },
  {
    number: '03',
    icon: CreditCard,
    title: 'Pay Deposit & Confirm',
    description: 'A small deposit secures your booking. The performer confirms, admin verifies, and you receive confirmation.',
  },
];

const HowItWorks: React.FC = () => {
  return (
    <section className="section-spacing">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e6398a]/10 border border-[#e6398a]/20 text-[#e6398a] text-xs font-semibold uppercase tracking-wider mb-4">
            How It Works
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Book in 3 simple steps
          </h2>
          <p className="text-[#b8b8c2] max-w-xl mx-auto">
            From browsing to confirmation, the entire process takes under 5 minutes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className="relative text-center animate-fade-in"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px bg-gradient-to-r from-[#e6398a]/30 to-transparent" />
              )}

              <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-[#1a1a22] border border-[#2a2a35] mb-6 group-hover:border-[#e6398a]/30">
                <step.icon className="h-10 w-10 text-[#e6398a]" />
                <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[#e6398a] text-white text-xs font-bold flex items-center justify-center">
                  {step.number}
                </span>
              </div>

              <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
              <p className="text-sm text-[#b8b8c2] leading-relaxed max-w-xs mx-auto">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
