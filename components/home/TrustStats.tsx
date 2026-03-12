import React from 'react';
import { CalendarCheck, Users, ShieldCheck, TrendingUp } from 'lucide-react';

const stats = [
  { icon: CalendarCheck, value: '200+', label: 'Bookings Processed', description: 'Seamless event coordination' },
  { icon: Users, value: '50+', label: 'Active Performers', description: 'Verified professionals' },
  { icon: ShieldCheck, value: '100%', label: 'Verified Clients', description: 'ID-checked before every booking' },
  { icon: TrendingUp, value: '98%', label: 'Satisfaction Rate', description: 'From performers and clients' },
];

const TrustStats: React.FC = () => {
  return (
    <section className="section-spacing">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="card-base text-center group hover:border-[#e6398a]/30 animate-fade-in"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-[#e6398a]/10 mb-4 group-hover:bg-[#e6398a]/20 transition-colors">
                <stat.icon className="h-7 w-7 text-[#e6398a]" />
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold text-white mb-1">{stat.value}</div>
              <div className="text-sm font-semibold text-white mb-1">{stat.label}</div>
              <div className="text-xs text-[#8888a0]">{stat.description}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustStats;
