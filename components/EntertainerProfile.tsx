
import React, { useMemo } from 'react';
// Fix: Import Service type
import type { Performer, Service } from '../types';
import { allServices } from '../data/mockData';
import { ArrowLeft, Briefcase, MapPin, Sparkles, Star } from 'lucide-react';

interface PerformerProfileProps {
  performer: Performer;
  onBack: () => void;
  onBook: (performer: Performer) => void;
}

const PerformerProfile: React.FC<PerformerProfileProps> = ({ performer, onBack, onBook }) => {
  const performerServices = useMemo(() => {
    return allServices.filter(service => performer.service_ids.includes(service.id));
  }, [performer.service_ids]);

  const servicesByCategory = useMemo(() => {
    // Fix: Explicitly type the accumulator's initial value to ensure correct type inference for Object.entries.
    // Without this, `services` in the `.map()` below would be of type `unknown`.
    return performerServices.reduce((acc, service) => {
      (acc[service.category] = acc[service.category] || []).push(service);
      return acc;
    }, {} as Record<string, Service[]>);
  }, [performerServices]);

  return (
    <div className="animate-fade-in">
      <button
        onClick={onBack}
        className="mb-8 inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-transparent px-5 py-2.5 text-sm font-semibold text-zinc-300 transition-all hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
      >
        <ArrowLeft className="h-5 w-5" />
        Back to Gallery
      </button>

      <div className="grid md:grid-cols-5 gap-8 lg:gap-12">
        <div className="md:col-span-2">
          <div className="sticky top-28">
            <div className="relative">
                <img
                  src={performer.photo_url}
                  alt={performer.name}
                  loading="lazy"
                  className="rounded-2xl shadow-2xl shadow-black/50 w-full h-auto object-cover aspect-[3/4] border-4 border-zinc-800"
                />
                <div className="absolute -inset-2 rounded-2xl bg-orange-500/30 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10"></div>
            </div>
          </div>
        </div>

        <div className="md:col-span-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold text-white tracking-tight">{performer.name}</h1>
            <div className="flex items-center gap-2 bg-zinc-800/50 px-4 py-2 rounded-xl border border-white/5 self-start sm:self-center">
              <Star className="w-5 h-5 text-orange-400 fill-orange-400" />
              <span className="text-xl font-bold text-white">{(performer.rating || 0).toFixed(1)}</span>
              <span className="text-zinc-400">({performer.review_count || 0} reviews)</span>
            </div>
          </div>
          <p className="text-xl sm:text-2xl text-orange-400 font-medium mb-4">{performer.tagline}</p>
          
          <div className="flex items-center gap-2 mb-8 text-zinc-300">
            <MapPin className="h-5 w-5 text-orange-500 flex-shrink-0" />
            <span className="font-semibold">Service Areas:</span>
            <span className="text-zinc-400">{performer.service_areas.join(', ')}</span>
          </div>

          <div className="prose prose-invert sm:prose-lg max-w-none text-zinc-300 mb-10 leading-relaxed">
            <p>{performer.bio}</p>
          </div>
          
          <div className="mb-10">
            <h3 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
              <Briefcase className="h-7 w-7 text-orange-500" />
              Services Offered
            </h3>
            <div className="space-y-6">
              {/* Fix: Property 'map' does not exist on type 'unknown' is resolved by explicitly casting Object.entries results to Service array entries. */}
              {(Object.entries(servicesByCategory) as [string, Service[]][]).map(([category, services]) => (
                <div key={category} className="card-base !p-6 !bg-zinc-900/50">
                  <h4 className="text-xl font-semibold text-orange-400 mb-4 border-b border-zinc-700 pb-3">{category}</h4>
                  <div className="flex flex-col divide-y divide-zinc-800">
                    {services.map((service) => (
                      <div key={service.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                             <p className="font-bold text-white">{service.name}</p>
                             <p className="text-sm text-zinc-400 mt-1">{service.description}</p>
                          </div>
                          <span className="bg-orange-500/20 text-orange-300 px-3 py-1 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 mt-1">
                            ${service.rate}
                            {service.rate_type === 'per_hour' ? '/hr' : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
           <button 
             onClick={() => onBook(performer)}
             className="btn-primary w-full md:w-auto py-4 px-10 text-lg flex items-center justify-center gap-3"
            >
            <Sparkles />
            Book {performer.name} Now
           </button>
        </div>
      </div>
    </div>
  );
};

export default PerformerProfile;
