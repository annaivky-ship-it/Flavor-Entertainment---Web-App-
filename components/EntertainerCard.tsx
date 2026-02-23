
import React from 'react';
import { Eye, PlusCircle, CheckCircle, MapPin } from 'lucide-react';
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
      className={`relative bg-zinc-900 rounded-xl overflow-hidden group transition-all duration-300 ease-in-out border border-zinc-800 flex flex-col`}
    >
      <div 
        className={`absolute -inset-1 rounded-xl bg-[var(--glow-color)] blur-lg transition-opacity duration-300 opacity-[var(--glow-opacity-base)] group-hover:opacity-[var(--glow-opacity-hover)] -z-10`}
      ></div>

      <div className="relative">
        <img
          src={performer.photo_url}
          alt={performer.name}
          className="w-full h-80 sm:h-96 object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className={`absolute top-3 right-3 flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-semibold border ${statusClasses[performer.status]}`}>
          <span className={`h-2 w-2 rounded-full ${statusClasses[performer.status].split(' ')[0]}`}></span>
          <span className="capitalize">{performer.status}</span>
        </div>
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
        
        <div className="absolute bottom-0 left-0 p-4 w-full">
          <h3 className="text-2xl font-bold text-white">{performer.name}</h3>
          <p className="text-orange-400 text-sm font-medium">{performer.tagline}</p>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-zinc-300 opacity-80">
            <MapPin size={14} className="flex-shrink-0" />
            <span className="truncate">{performer.service_areas.join(', ')}</span>
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out">
         <div className="pt-8">
            <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => onViewProfile(performer)}
                  className="w-full bg-zinc-700/80 backdrop-blur-sm hover:bg-zinc-600 text-white font-semibold px-4 py-2.5 rounded-lg transition-colors duration-300 flex items-center justify-center gap-2"
                >
                  <Eye className="h-4 w-4" />
                  Profile
                </button>
                <button
                  onClick={() => onToggleSelection(performer)}
                  className={`w-full text-white font-semibold px-4 py-2.5 rounded-lg transition-colors duration-300 flex items-center justify-center gap-2 ${isSelected ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-500 hover:bg-orange-600'}`}
                >
                  {isSelected ? <CheckCircle className="h-5 w-5" /> : <PlusCircle className="h-5 w-5" />}
                  {isSelected ? 'Selected' : 'Select'}
                </button>
            </div>
         </div>
      </div>
    </div>
  );
};

export default PerformerCard;
