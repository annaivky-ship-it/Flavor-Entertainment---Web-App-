
import React from 'react';
import { Eye, PlusCircle, CheckCircle, MapPin, Star, Clock, DollarSign } from 'lucide-react';
import type { Performer, PerformerStatus } from '../types';
import { allServices } from '../data/mockData';

interface PerformerCardProps {
  performer: Performer;
  onViewProfile: (performer: Performer) => void;
  onToggleSelection: (performer: Performer) => void;
  isSelected: boolean;
}

const statusConfig: Record<PerformerStatus, { bg: string; dot: string; label: string }> = {
  available: { bg: 'bg-green-500/20 border-green-500/30 text-green-400', dot: 'bg-green-400', label: 'Available' },
  busy: { bg: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400', dot: 'bg-yellow-400', label: 'Busy' },
  offline: { bg: 'bg-[#8888a0]/20 border-[#8888a0]/30 text-[#8888a0]', dot: 'bg-[#8888a0]', label: 'Offline' },
  pending_verification: { bg: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400', dot: 'bg-yellow-400', label: 'Pending' },
  rejected: { bg: 'bg-red-500/20 border-red-500/30 text-red-400', dot: 'bg-red-400', label: 'Unavailable' },
};

const PerformerCard: React.FC<PerformerCardProps> = ({ performer, onViewProfile, onToggleSelection, isSelected }) => {
  const status = statusConfig[performer.status];
  
  // Get lowest rate for this performer
  const performerServices = allServices.filter(s => performer.service_ids.includes(s.id));
  const lowestRate = performerServices.length > 0 
    ? Math.min(...performerServices.map(s => s.rate)) 
    : 0;

  return (
    <div
      className={`relative bg-[#1a1a22] rounded-2xl overflow-hidden group transition-all duration-500 ease-in-out border flex flex-col h-full ${
        isSelected ? 'border-[#e6398a] shadow-[0_0_30px_rgba(230,57,138,0.2)]' : 'border-[#2a2a35] hover:border-[#e6398a]/40'
      }`}
    >
      <div className="relative aspect-square md:aspect-[3/4] overflow-hidden">
        <img
          src={performer.photo_url}
          alt={performer.name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        
        {/* Status Badge */}
        <div className={`absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold border ${status.bg}`}>
          <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${status.dot}`} />
          {status.label}
        </div>

        {/* Rating Badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-xs font-bold text-white border border-white/10">
          <Star className="w-3 h-3 text-[#e6398a] fill-[#e6398a]" />
          <span>{(performer.rating || 0).toFixed(1)}</span>
          <span className="text-[#8888a0] font-normal">({performer.review_count || 0})</span>
        </div>
        
        <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a22] via-[#1a1a22]/20 to-transparent md:block hidden" />
        
        <div className="absolute bottom-0 left-0 p-5 w-full md:block hidden">
          <h3 className="text-2xl font-bold text-white tracking-tight mb-1">{performer.name}</h3>
          <p className="text-[#e6398a] text-xs font-semibold uppercase tracking-wide mb-3">{performer.tagline}</p>
          
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-[#b8b8c2]">
              <MapPin size={12} className="text-[#e6398a]" />
              <span className="truncate">{performer.service_areas.join(', ')}</span>
            </div>
            {lowestRate > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-[#b8b8c2]">
                <DollarSign size={12} className="text-[#e6398a]" />
                <span>From ${lowestRate}</span>
              </div>
            )}
            {performer.min_booking_duration_hours && (
              <div className="flex items-center gap-1.5 text-xs text-[#b8b8c2]">
                <Clock size={12} className="text-[#e6398a]" />
                <span>Min {performer.min_booking_duration_hours} hr{performer.min_booking_duration_hours > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Action Overlay */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden md:flex items-center justify-center pointer-events-none">
          <div className="flex flex-col gap-3 w-full max-w-[200px] pointer-events-auto transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
            <button
              onClick={() => onViewProfile(performer)}
              className="w-full bg-white text-[#0f0f12] font-bold px-6 py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 hover:bg-[#e6398a] hover:text-white"
            >
              <Eye className="h-5 w-5" />
              View Profile
            </button>
            <button
              onClick={() => onToggleSelection(performer)}
              className={`w-full font-bold px-6 py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 border-2 ${isSelected ? 'bg-[#e6398a] border-[#e6398a] text-white' : 'bg-transparent border-white text-white hover:bg-white hover:text-[#0f0f12]'}`}
            >
              {isSelected ? <CheckCircle className="h-5 w-5" /> : <PlusCircle className="h-5 w-5" />}
              {isSelected ? 'Selected' : 'Book Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Content & Actions */}
      <div className="p-4 md:hidden flex flex-col flex-grow">
        <div className="mb-4">
          <div className="flex justify-between items-start mb-1">
            <h3 className="text-xl font-bold text-white tracking-tight">{performer.name}</h3>
            {lowestRate > 0 && (
              <span className="text-sm font-bold text-[#e6398a]">From ${lowestRate}</span>
            )}
          </div>
          <p className="text-[#e6398a] text-xs font-semibold uppercase tracking-wide mb-2">{performer.tagline}</p>
          <div className="flex items-center gap-1 text-xs text-[#8888a0]">
            <MapPin size={12} className="text-[#e6398a]" />
            <span className="truncate">{performer.service_areas[0]}</span>
          </div>
        </div>
        
        <div className="mt-auto grid grid-cols-2 gap-2">
          <button
            onClick={() => onViewProfile(performer)}
            className="w-full bg-[#2a2a35] text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 active:bg-[#1a1a22] transition-colors"
          >
            <Eye className="h-4 w-4" />
            Profile
          </button>
          <button
            onClick={() => onToggleSelection(performer)}
            className={`w-full font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border transition-colors ${isSelected ? 'bg-[#e6398a] border-[#e6398a] text-white' : 'bg-transparent border-[#2a2a35] text-white active:bg-[#1a1a22]'}`}
          >
            {isSelected ? <CheckCircle className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
            {isSelected ? 'Selected' : 'Book Now'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PerformerCard;
