
import React from 'react';
import { Eye, PlusCircle, CheckCircle, MapPin, Star } from 'lucide-react';
import type { Performer } from '../types';

interface PerformerCardProps {
  performer: Performer;
  onViewProfile: (performer: Performer) => void;
  onToggleSelection: (performer: Performer) => void;
  isSelected: boolean;
}

const statusClasses = {
  available: 'bg-green-500/80 border-green-400 text-green-50',
  busy: 'bg-yellow-500/80 border-yellow-400 text-yellow-50',
  offline: 'bg-zinc-500/80 border-zinc-400 text-zinc-50',
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
      className={`relative bg-zinc-900 rounded-2xl overflow-hidden group transition-all duration-500 ease-in-out border border-zinc-800 flex flex-col h-full hover:border-orange-500/50`}
    >
      <div 
        className={`absolute -inset-1 rounded-2xl bg-[var(--glow-color)] blur-xl transition-opacity duration-500 opacity-[var(--glow-opacity-base)] group-hover:opacity-[var(--glow-opacity-hover)] -z-10`}
      ></div>

      <div className="relative aspect-[3/4] overflow-hidden">
        <img
          src={performer.photo_url}
          alt={performer.name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        
        {/* Status Badge */}
        <div className={`absolute top-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold border ${statusClasses[performer.status]}`}>
          <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${performer.status === 'available' ? 'bg-green-400' : performer.status === 'busy' ? 'bg-yellow-400' : 'bg-zinc-400'}`}></span>
          {performer.status}
        </div>

        {/* Rating Badge */}
        <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold text-white border border-white/10">
          <Star className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
          <span>{performer.rating.toFixed(1)}</span>
          <span className="text-zinc-400 font-normal">({performer.review_count})</span>
        </div>
        
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent"></div>
        
        <div className="absolute bottom-0 left-0 p-6 w-full">
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
          </div>
        </div>
      </div>
      
      {/* Action Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center pointer-events-none">
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
  );
};

export default PerformerCard;
