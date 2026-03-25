import React, { useMemo } from 'react';
import type { Performer } from '../types';
import { calculateBookingCost, getBookingDurationInfo } from '../utils/bookingUtils';
import { DEPOSIT_PERCENTAGE } from '../constants';
import { DollarSign, Clock, AlertTriangle, Navigation } from 'lucide-react';
import { allServices } from '../data/mockData';

interface BookingCostCalculatorProps {
  selectedServices: string[];
  durationHours: number;
  performers: Performer[];
  suburbName?: string;
  className?: string;
  onClearAll?: () => void;
}

const BookingCostCalculator: React.FC<BookingCostCalculatorProps> = ({
  selectedServices,
  durationHours,
  performers,
  suburbName,
  className = '',
  onClearAll,
}) => {
  const { totalCost, depositAmount, travelFee } = useMemo(() => {
    return calculateBookingCost(durationHours, selectedServices, performers.length, suburbName);
  }, [selectedServices, durationHours, performers, suburbName]);

  const { formattedTotalDuration } = useMemo(() => {
    return getBookingDurationInfo(durationHours, selectedServices);
  }, [durationHours, selectedServices]);

  const durationWarning = useMemo(() => {
    const duration = durationHours;
    if (isNaN(duration) || duration <= 0) return null;

    const hourlyServices = allServices.filter(
      s => selectedServices.includes(s.id) && s.rate_type === 'per_hour'
    );

    for (const service of hourlyServices) {
      if (service.min_duration_hours && duration < service.min_duration_hours) {
        return `Warning: ${service.name} requires a minimum duration of ${service.min_duration_hours} hours.`;
      }
    }

    for (const performer of performers) {
      if (performer.min_booking_duration_hours && duration < performer.min_booking_duration_hours) {
        return `Warning: ${performer.name} requires a minimum booking duration of ${performer.min_booking_duration_hours} hours.`;
      }
    }

    return null;
  }, [durationHours, selectedServices, performers]);

  return (
    <div className={`card-base !p-6 !bg-zinc-950/50 border-zinc-800/50 transition-all duration-500 ${className} ${totalCost > 0 ? 'ring-1 ring-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.1)]' : ''}`}>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <DollarSign className="text-orange-500" /> Cost Summary
        </h3>
        {onClearAll && totalCost > 0 && (
          <button 
            onClick={onClearAll}
            className="text-xs font-semibold text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-red-400/10 border border-zinc-800"
          >
            Clear
          </button>
        )}
      </div>
      
      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <span className="text-sm text-zinc-400">Total Booking Cost</span>
          <span className="font-black text-3xl text-white tracking-tight animate-in fade-in slide-in-from-right-4 duration-500">
            ${(totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {travelFee > 0 && (
          <div className="flex justify-between items-center p-2.5 bg-blue-500/5 rounded-xl border border-blue-500/10">
            <span className="text-sm text-blue-200/70 flex items-center gap-1.5">
              <Navigation size={14} className="text-blue-400" />
              Travel Fee (incl.)
            </span>
            <span className="font-semibold text-blue-400">${travelFee.toFixed(2)}</span>
          </div>
        )}

        <div className="flex justify-between items-center p-3 bg-orange-500/5 rounded-xl border border-orange-500/10">
          <span className="text-sm font-medium text-orange-200/70">Deposit Due ({DEPOSIT_PERCENTAGE * 100}%)</span>
          <span className="font-bold text-xl text-orange-500">
            ${(depositAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {formattedTotalDuration !== 'N/A' && (
        <div className="mt-6 pt-6 border-t border-zinc-800/50">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-zinc-400">
              <Clock size={16} className="text-orange-500/70" />
              <span className="text-sm">Total Duration</span>
            </div>
            <span className="font-bold text-zinc-200">{formattedTotalDuration}</span>
          </div>
        </div>
      )}

      {durationWarning && (
        <div className="mt-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-400 animate-in zoom-in-95 duration-300">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-medium leading-relaxed">{durationWarning}</p>
        </div>
      )}
      
      {totalCost === 0 && (
        <p className="mt-4 text-[10px] text-zinc-600 text-center italic">
          Select services to see pricing
        </p>
      )}
    </div>
  );
};

export default BookingCostCalculator;