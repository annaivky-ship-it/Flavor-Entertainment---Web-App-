import React from 'react';
import { Star, ArrowRight } from 'lucide-react';
import type { Performer } from '../../types';

interface FeaturedPerformersProps {
  performers: Performer[];
  onViewAll: () => void;
  onViewProfile: (performer: Performer) => void;
}

const FeaturedPerformers: React.FC<FeaturedPerformersProps> = ({ performers, onViewAll, onViewProfile }) => {
  const featured = performers.filter(p => p.status === 'available').slice(0, 4);

  return (
    <section className="section-spacing bg-gradient-to-b from-[#13131a] to-[#0f0f12]">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-12 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e6398a]/10 border border-[#e6398a]/20 text-[#e6398a] text-xs font-semibold uppercase tracking-wider mb-4">
              Featured
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Top-rated performers
            </h2>
          </div>
          <button
            onClick={onViewAll}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            View All Performers
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featured.map((performer, i) => (
            <div
              key={performer.id}
              onClick={() => onViewProfile(performer)}
              className="group cursor-pointer rounded-2xl overflow-hidden bg-[#1a1a22] border border-[#2a2a35] hover:border-[#e6398a]/30 transition-all duration-300 animate-fade-in"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="relative aspect-[3/4] overflow-hidden">
                <img
                  src={performer.photo_url}
                  alt={performer.name}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a22] via-transparent to-transparent" />

                {/* Status badge */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold text-green-400 border border-green-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  Available
                </div>

                {/* Rating */}
                <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-xs font-bold text-white border border-white/10">
                  <Star className="w-3 h-3 text-[#e6398a] fill-[#e6398a]" />
                  {(performer.rating || 0).toFixed(1)}
                </div>

                {/* Bottom info */}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h3 className="text-xl font-bold text-white mb-1">{performer.name}</h3>
                  <p className="text-[#e6398a] text-xs font-semibold uppercase tracking-wide">{performer.tagline}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturedPerformers;
