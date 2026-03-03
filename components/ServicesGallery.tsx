
import React, { useMemo } from 'react';
import { allServices } from '../data/mockData';
import type { Service } from '../types';
import { Briefcase, Sparkles } from 'lucide-react';

interface ServicesGalleryProps {
  onBookService: (serviceId: string) => void;
}

const ServicesGallery: React.FC<ServicesGalleryProps> = ({ onBookService }) => {
  const servicesByCategory = useMemo(() => {
    // Fix: Explicitly type the accumulator's initial value to ensure correct type inference for Object.entries.
    // Without this, `services` in the `.map()` below would be of type `unknown`.
    return allServices.reduce((acc, service) => {
      (acc[service.category] = acc[service.category] || []).push(service);
      return acc;
    }, {} as Record<string, Service[]>);
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-12">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white mb-4 tracking-tight">
          Our Services
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
          Explore our range of professional services. Click 'Book Now' to find performers who offer your desired experience.
        </p>
      </div>

      <div className="space-y-12">
        {/* Fix: Explicitly cast Object.entries to entries of Service arrays to avoid 'unknown' type mapping errors. */}
        {(Object.entries(servicesByCategory) as [string, Service[]][]).map(([category, services]) => (
          <div key={category}>
            <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
              <Briefcase className="h-7 w-7 text-orange-500" />
              {category}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Fix: Property 'map' does not exist on type 'unknown' is resolved by the typing of the reduce accumulator above and entries casting. */}
              {services.map(service => (
                <div key={service.id} className="card-base !p-6 flex flex-col justify-between h-full hover:!border-orange-500/60">
                  <div>
                     <div className="flex justify-between items-start gap-4 mb-2">
                       <h3 className="text-xl font-semibold text-white flex-1">{service.name}</h3>
                       <div className="flex flex-col items-end gap-1">
                         <span className="bg-orange-500/20 text-orange-300 px-3 py-1 rounded-full text-sm font-semibold whitespace-nowrap">
                             ${service.rate}
                             {service.rate_type === 'per_hour' ? '/hr' : ''}
                         </span>
                         {(service.duration_minutes || service.min_duration_hours) && (
                           <span className="text-xs text-zinc-400 font-medium">
                             {service.duration_minutes ? `${service.duration_minutes} mins` : `Min ${service.min_duration_hours} hr${service.min_duration_hours! > 1 ? 's' : ''}`}
                           </span>
                         )}
                       </div>
                    </div>
                    <p className="text-zinc-400 text-sm mb-4">
                      {service.description}
                    </p>
                  </div>
                  <button onClick={() => onBookService(service.id)} className="btn-primary w-full mt-auto flex items-center justify-center gap-2">
                    <Sparkles size={16} />
                    Book Now
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ServicesGallery;
