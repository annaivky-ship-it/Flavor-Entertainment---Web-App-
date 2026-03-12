import React from 'react';
import { LayoutDashboard, CalendarCheck, Users, ShieldCheck, BarChart3, Bell } from 'lucide-react';

interface AdminPreviewProps {
  onViewDemo: () => void;
}

const AdminPreview: React.FC<AdminPreviewProps> = ({ onViewDemo }) => {
  return (
    <section className="section-spacing">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: description */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e6398a]/10 border border-[#e6398a]/20 text-[#e6398a] text-xs font-semibold uppercase tracking-wider mb-4">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Agency Control Center
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-6">
              Everything your agency needs, in one dashboard
            </h2>
            <p className="text-[#b8b8c2] mb-8 leading-relaxed">
              Manage bookings, approve requests, track performer availability, review client verifications, and monitor revenue — all from a single control center designed for agency operators.
            </p>

            <div className="space-y-4 mb-8">
              {[
                { icon: CalendarCheck, text: 'View and manage all pending and confirmed bookings' },
                { icon: Users, text: 'Track performer schedules and availability in real time' },
                { icon: ShieldCheck, text: 'Review client verification status and safety flags' },
                { icon: BarChart3, text: 'Monitor revenue, deposit status, and key metrics' },
              ].map((item) => (
                <div key={item.text} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#e6398a]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <item.icon className="h-4 w-4 text-[#e6398a]" />
                  </div>
                  <p className="text-sm text-[#b8b8c2]">{item.text}</p>
                </div>
              ))}
            </div>

            <button onClick={onViewDemo} className="btn-primary flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Try the Demo Dashboard
            </button>
          </div>

          {/* Right: dashboard mockup */}
          <div className="relative">
            <div className="absolute -inset-4 bg-[#e6398a]/5 blur-3xl rounded-3xl" />
            <div className="relative rounded-2xl border border-[#2a2a35] bg-[#1a1a22] overflow-hidden shadow-2xl">
              {/* Title bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2a2a35] bg-[#13131a]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/50" />
                </div>
                <span className="text-xs text-[#8888a0] ml-2">Agency Control Center</span>
              </div>

              {/* Dashboard content preview */}
              <div className="p-6 space-y-4">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Pending', value: '5', color: 'text-yellow-400' },
                    { label: 'Confirmed', value: '12', color: 'text-green-400' },
                    { label: 'Revenue', value: '$8.4k', color: 'text-[#e6398a]' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-[#13131a] rounded-xl p-3 border border-[#2a2a35]">
                      <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
                      <div className="text-[10px] text-[#8888a0] uppercase tracking-wider">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Fake booking rows */}
                {[
                  { name: 'Scarlett', event: 'Corporate Gala', status: 'Confirmed', statusColor: 'bg-green-500/20 text-green-400' },
                  { name: 'April', event: 'Birthday Party', status: 'Pending', statusColor: 'bg-yellow-500/20 text-yellow-400' },
                  { name: 'Amber', event: 'Private Event', status: 'Deposit Due', statusColor: 'bg-[#e6398a]/20 text-[#e6398a]' },
                ].map((row) => (
                  <div key={row.name} className="flex items-center justify-between p-3 bg-[#13131a] rounded-xl border border-[#2a2a35]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#2a2a35]" />
                      <div>
                        <div className="text-sm font-semibold text-white">{row.name}</div>
                        <div className="text-[10px] text-[#8888a0]">{row.event}</div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${row.statusColor}`}>
                      {row.status}
                    </span>
                  </div>
                ))}

                {/* Notification */}
                <div className="flex items-center gap-3 p-3 bg-[#e6398a]/5 rounded-xl border border-[#e6398a]/20">
                  <Bell className="h-4 w-4 text-[#e6398a]" />
                  <span className="text-xs text-[#b8b8c2]">3 new booking requests need your review</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AdminPreview;
