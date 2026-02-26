import React, { useMemo } from 'react';
import type { Performer } from '../types';
import { calculateBookingCost, getBookingDurationInfo } from '../utils/bookingUtils';
import { DEPOSIT_PERCENTAGE } from '../constants';
import { DollarSign, Clock, AlertTriangle } from 'lucide-react';
import { allServices } from '../data/mockData';

interface BookingCostCalculatorProps {
  selectedServices: string[];
  durationHours: number;
  performers: Performer[];
  className?: string;
  onClearAll?: () => void;
}

const BookingCostCalculator: React.FC<BookingCostCalculatorProps> = ({
  selectedServices,
  durationHours,
  performers,
  className = '',
  onClearAll,
}) => {
  const { totalCost, depositAmount } = useMemo(() => {
    return calculateBookingCost(durationHours, selectedServices, performers.length);
  }, [selectedServices, durationHours, performers]);

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
    return null;
  }, [durationHours, selectedServices]);

  return (
    <div className={`card-base !p-6 !bg-zinc-950/50 ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-orange-400 flex items-center gap-2">
          <DollarSign /> Cost Estimate
        </h3>
        {onClearAll && (
          <button 
            onClick={onClearAll}
            className="text-xs font-medium text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-red-400/10"
          >
            Clear All
          </button>
        )}
      </div>
      <div className="space-y-2 text-zinc-300">
        <div className="flex justify-between items-center">
          <span>Total Booking Cost:</span>
          <span className="font-bold text-2xl text-white">${totalCost.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Deposit Due ({DEPOSIT_PERCENTAGE * 100}%):</span>
          <span className="font-semibold text-xl text-orange-400">${depositAmount.toFixed(2)}</span>
        </div>
      </div>
       {formattedTotalDuration !== 'N/A' && (
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2 mb-2">
            <Clock /> Duration Estimate
          </h3>
          <div className="flex justify-between items-center text-zinc-300">
            <span>Total Event Duration:</span>
            <span className="font-semibold text-lg text-white">{formattedTotalDuration}</span>
          </div>
        </div>
      )}
      {durationWarning && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3 text-red-400">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{durationWarning}</p>
        </div>
      )}
    </div>
  );
};

export default BookingCostCalculator;