
import React from 'react';
import { Eye, PlusCircle, CheckCircle, MapPin, Star, Clock } from 'lucide-react';
import type { Performer, PerformerStatus } from '../types';

interface PerformerCardProps {
  performer: Performer;
  onViewProfile: (performer: Performer) => void;
  onToggleSelection: (performer: Performer) => void;
  isSelected: boolean;
}

const statusClasses: Record<PerformerStatus, string> = {
  available: 'bg-green-500/80 border-green-400 text-green-50',
  busy: 'bg-yellow-500/80 border-yellow-400 text-yellow-50',
  offline: 'bg-zinc-500/80 border-zinc-400 text-zinc-50',
  pending_verification: 'bg-yellow-500/80 border-yellow-400 text-yellow-50',
  rejected: 'bg-red-500/80 border-red-400 text-red-50',
};

const PerformerCard: React.FC<PerformerCardProps> = ({ performer, onViewProfile, onToggleSelection, isSelected }) => {
  const cardStyle = {
    '--glow-color': isSelected ? 'rgba(249, 115, 22, 0.5)' : 'rgba(249, 115, 22, 0.3)',
    '--glow-opacity-hover': isSelected ? '1' : '1',
    '--glow-opacity-base': isSelected ? '1' : '0'
  } as React.CSSProperties;

  return (
    <div
      style={cardStyle}
      className={`relative bg-zinc-900 rounded-2xl overflow-hidden group transition-all duration-500 ease-in-out border flex flex-col h-full ${isSelected ? 'border-orange-500 shadow-lg shadow-orange-500/10' : 'border-zinc-800/60 hover:border-orange-500/40'}`}
    >
      {isSelected && (
        <div className="absolute -inset-1 rounded-2xl bg-orange-500/20 blur-xl -z-10" />
      )}

      <div className="relative aspect-[3/4] overflow-hidden">
        {performer.photo_url ? (
          <img
            src={performer.photo_url}
            alt={performer.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
            <span className="text-6xl font-bold text-gradient">{performer.name?.charAt(0)?.toUpperCase()}</span>
          </div>
        )}

        {/* Status Badge */}
        <div className={`absolute top-3 right-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold border ${statusClasses[performer.status]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${performer.status === 'available' ? 'bg-green-400 animate-pulse' : performer.status === 'busy' ? 'bg-yellow-400' : 'bg-zinc-400'}`}></span>
          {performer.status === 'pending_verification' ? 'Pending' : performer.status}
        </div>

        {/* Rating Badge */}
        {(performer.rating || 0) > 0 && (
          <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs font-bold text-white border border-white/10">
            <Star className="w-3 h-3 text-orange-400 fill-orange-400" />
            <span>{(performer.rating || 0).toFixed(1)}</span>
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent md:block hidden"></div>
        
        <div className="absolute bottom-0 left-0 p-6 w-full md:block hidden">
          <h3 className="text-3xl font-bold text-white tracking-tight mb-1">{performer.name}</h3>
          <p className="text-orange-400 text-sm font-semibold uppercase tracking-wide mb-3">{performer.tagline}</p>
          
          <div className="space-y-2">
            <p className="text-zinc-300 text-sm line-clamp-2 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {performer.bio}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <MapPin size={14} className="text-orange-500" />
              <span className="truncate">{performer.service_areas.join(', ')}</span>
            </div>
            {performer.min_booking_duration_hours && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Clock size={14} className="text-orange-500" />
                <span>Min {performer.min_booking_duration_hours} hr{performer.min_booking_duration_hours > 1 ? 's' : ''} booking</span>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Action Overlay */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden md:flex items-center justify-center pointer-events-none">
          <div className="flex flex-col gap-3 w-full max-w-[200px] pointer-events-auto transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
            <button
              onClick={() => onViewProfile(performer)}
              className="w-full bg-white text-zinc-950 font-bold px-6 py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 hover:bg-orange-500 hover:text-white"
            >
              <Eye className="h-5 w-5" />
              View Profile
            </button>
            <button
              onClick={() => onToggleSelection(performer)}
              className={`w-full font-bold px-6 py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 border-2 ${isSelected ? 'bg-green-600 border-green-600 text-white hover:bg-green-700' : 'bg-transparent border-white text-white hover:bg-white hover:text-zinc-950'}`}
            >
              {isSelected ? <CheckCircle className="h-5 w-5" /> : <PlusCircle className="h-5 w-5" />}
              {isSelected ? 'Selected' : 'Select'}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Content & Actions */}
      <div className="p-4 md:hidden flex flex-col flex-grow">
        <div className="mb-3">
          <h3 className="text-lg font-bold text-white tracking-tight mb-0.5">{performer.name}</h3>
          <p className="text-orange-400/80 text-[11px] font-semibold uppercase tracking-wider mb-2">{performer.tagline}</p>
          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1">
              <MapPin size={11} className="text-orange-500/70" />
              {performer.service_areas[0]}
            </span>
            {performer.min_booking_duration_hours && (
              <span className="flex items-center gap-1">
                <Clock size={11} className="text-orange-500/70" />
                {performer.min_booking_duration_hours}hr min
              </span>
            )}
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2">
          <button
            onClick={() => onViewProfile(performer)}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            Profile
          </button>
          <button
            onClick={() => onToggleSelection(performer)}
            className={`w-full font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 border transition-all ${isSelected ? 'bg-orange-500 border-orange-500 text-white' : 'bg-transparent border-zinc-700 text-zinc-300 hover:border-orange-500/50 hover:text-white'}`}
          >
            {isSelected ? <CheckCircle className="h-3.5 w-3.5" /> : <PlusCircle className="h-3.5 w-3.5" />}
            {isSelected ? 'Selected' : 'Select'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PerformerCard;
